'use strict';

const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { app, BrowserWindow, Tray, Menu, dialog, shell, session } = require('electron');
const {
  APP_NAME, APP_ID, headersForRequest, isTrustedBackendUrl, isSafeExternalUrl,
  isAttributionMailto, isTrustedPrintViewUrl, isTrustedDownloadUrl, safeDownloadName,
} = require('./policy.cjs');
const { DesktopRuntimeError, payloadDirectory, startDesktopRuntime } = require('./runtime.cjs');

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

let mainWindow;
let tray;
let runtime;
let startupPromise;
let shutdownPromise;
let quitting = false;
let shutdownComplete = false;
let failureShown = false;
const startupAbort = new AbortController();
const printWindows = new Set();

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function fail(error) {
  if (quitting || failureShown) return;
  failureShown = true;
  const message = error instanceof DesktopRuntimeError ? error.message
    : 'The desktop application could not start or lost its connection to its local backend. Close it and try again. If this continues, reinstall the matching Windows package.';
  dialog.showErrorBox(APP_NAME, `${message}\n\nYour saved workspace is not automatically reset or deleted.`);
  app.quit();
}

function openExternal(url) {
  if (!isSafeExternalUrl(url) && !isAttributionMailto(url)) return;
  void shell.openExternal(url).catch(() => {
    if (!quitting) dialog.showErrorBox(APP_NAME, 'The link could not be opened in your default application.');
  });
}

function isolatedWebPreferences(isolatedSession) {
  return {
    session: isolatedSession,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
    devTools: !app.isPackaged,
    navigateOnDragDrop: false,
  };
}

function restrictWindowContents(contents, isolatedSession, allowPrintView = false) {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedBackendUrl(url, runtime.origin)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  contents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && !isTrustedBackendUrl(event.url, runtime.origin)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isTrustedBackendUrl(url, runtime.origin)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (!quitting && allowPrintView && isTrustedBackendUrl(contents.getURL(), runtime.origin)
      && isTrustedPrintViewUrl(url, runtime.origin)) {
      openPrintView(url, isolatedSession);
    } else {
      openExternal(url);
    }
    return { action: 'deny' };
  });
  contents.on('render-process-gone', () => fail(new DesktopRuntimeError(
    'RENDERER_EXITED', 'The application window stopped unexpectedly. Reopen the application to reconnect to your saved workspace.',
  )));
  contents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      fail(new DesktopRuntimeError('WINDOW_LOAD_FAILED', 'The application window could not load the local backend. Close and reopen the application.'));
    }
  });
}

function openPrintView(url, isolatedSession) {
  const preview = new BrowserWindow({
    parent: mainWindow,
    title: `${APP_NAME} — Print-ready view`,
    width: 1100,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: isolatedWebPreferences(isolatedSession),
  });
  printWindows.add(preview);
  preview.setMenu(Menu.buildFromTemplate([{ label: 'File', submenu: [
    { label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => preview.webContents.print({ silent: false }) },
    { role: 'close' },
  ] }]));
  preview.once('ready-to-show', () => { if (!quitting && !preview.isDestroyed()) preview.show(); });
  preview.on('closed', () => printWindows.delete(preview));
  restrictWindowContents(preview.webContents, isolatedSession);
  void preview.loadURL(url).catch(fail);
}

function createWindow() {
  const isolatedSession = session.fromPartition(`hf-desktop-${randomBytes(16).toString('hex')}`, { cache: false });
  isolatedSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: headersForRequest(details.requestHeaders, details.url, runtime.origin, runtime.token) });
  });
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  isolatedSession.setDevicePermissionHandler(() => false);
  isolatedSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1366,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: isolatedWebPreferences(isolatedSession),
  });
  mainWindow.removeMenu();
  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => { if (!quitting) showWindow(); });
  mainWindow.on('close', (event) => {
    if (!quitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  const contents = mainWindow.webContents;
  restrictWindowContents(contents, isolatedSession, true);

  isolatedSession.on('will-download', (event, item, source) => {
    const filename = safeDownloadName(item.getFilename());
    const chain = item.getURLChain();
    if (source !== contents || !isTrustedBackendUrl(contents.getURL(), runtime.origin)
      || !filename || chain.length === 0 || !chain.every((url) => isTrustedDownloadUrl(url, runtime.origin))) {
      event.preventDefault();
      return;
    }
    // No setSavePath: Electron's native save dialog must approve every export. Never open it automatically.
    item.setSaveDialogOptions({
      title: 'Save workspace export',
      buttonLabel: 'Save',
      defaultPath: path.join(app.getPath('downloads'), filename),
      filters: [{ name: 'Workspace export', extensions: [path.extname(filename).slice(1)] }],
    });
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  tray.setToolTip(`${APP_NAME} — close the window to keep it in the notification area`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: showWindow },
    {
      label: 'Open data folder',
      click: () => {
        // This is the fixed, owned workspace directory, never a renderer-supplied path.
        void shell.openPath(runtime.dataDirectory).then((error) => {
          if (error && !quitting) dialog.showErrorBox(APP_NAME, 'The workspace data folder could not be opened.');
        }).catch(() => {
          if (!quitting) dialog.showErrorBox(APP_NAME, 'The workspace data folder could not be opened.');
        });
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('double-click', showWindow);
}

async function start() {
  runtime = await startDesktopRuntime({
    directory: payloadDirectory({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      desktopDirectory: __dirname,
    }),
    userDataPath: app.getPath('userData'),
    signal: startupAbort.signal,
    onUnexpectedExit: fail,
  });
  if (quitting) {
    await runtime.stop();
    return;
  }
  createWindow();
  createTray();
  await mainWindow.loadURL(`${runtime.origin}/`);
  console.log(`${APP_NAME} ready at ${runtime.origin}`);
  console.log(`Workspace folder: ${runtime.dataDirectory}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('window-all-closed', () => { if (!quitting) app.quit(); });
  app.on('before-quit', (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownPromise) return;
    quitting = true;
    startupAbort.abort();
    shutdownPromise = (async () => {
      try {
        await runtime?.stop();
        await startupPromise;
        await runtime?.stop();
      } catch {
        dialog.showErrorBox(APP_NAME, 'The desktop backend could not be cleanly stopped. If it is still running, end the owned Node process in Task Manager before reopening the application. Your workspace has not been deleted.');
      } finally {
        tray?.destroy();
        tray = null;
        shutdownComplete = true;
        app.quit();
      }
    })();
  });
  startupPromise = app.whenReady().then(start).catch(fail);
}
