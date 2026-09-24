'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { DesktopRuntimeError } = require('../runtime.cjs');
const policy = require('../policy.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const origin = 'http://127.0.0.1:43210';
const token = 'e'.repeat(64);

function event(extra = {}) {
  return { prevented: false, preventDefault() { this.prevented = true; }, ...extra };
}

async function launch({ hasLock = true, startupError, startImpl } = {}) {
  const calls = { dialogs: [], external: [], folders: [], windows: [], logs: [], stops: 0, quit: 0 };
  const app = new EventEmitter();
  const isolatedSession = new EventEmitter();
  const runtime = {
    origin, token, dataDirectory: path.resolve('tests', 'owned-workspace', 'data'),
    stop: async () => { calls.stops += 1; },
  };
  Object.assign(app, {
    isPackaged: true,
    setName: (name) => { calls.name = name; },
    setAppUserModelId: (id) => { calls.appId = id; },
    requestSingleInstanceLock: () => hasLock,
    getPath: (name) => path.resolve('tests', 'owned-workspace', name),
    whenReady: async () => {},
    quit: () => { calls.quit += 1; app.emit('before-quit', event()); },
  });
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.visible = false;
      this.minimized = false;
      this.destroyed = false;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        getURL: () => this.url,
        setWindowOpenHandler: (handler) => { this.openHandler = handler; },
      });
      calls.windows.push(this);
    }
    removeMenu() { this.menuRemoved = true; }
    loadURL(url) { this.url = url; this.emit('ready-to-show'); return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() { this.focused = true; }
  }
  class Tray extends EventEmitter {
    constructor(icon) { super(); this.icon = icon; calls.tray = this; }
    setToolTip(value) { this.tooltip = value; }
    setContextMenu(value) { this.menu = value; }
    destroy() { this.destroyed = true; }
  }
  Object.assign(isolatedSession, {
    webRequest: { onBeforeSendHeaders: (handler) => { calls.headers = handler; } },
    setPermissionRequestHandler: (handler) => { calls.permissionRequest = handler; },
    setPermissionCheckHandler: (handler) => { calls.permissionCheck = handler; },
    setDevicePermissionHandler: (handler) => { calls.devicePermission = handler; },
    setDisplayMediaRequestHandler: (handler) => { calls.displayMedia = handler; },
  });
  const electron = {
    app, BrowserWindow, Tray,
    Menu: { buildFromTemplate: (items) => items },
    dialog: { showErrorBox: (title, message) => calls.dialogs.push({ title, message }) },
    shell: {
      openExternal: async (url) => { calls.external.push(url); },
      openPath: async (directory) => { calls.folders.push(directory); return ''; },
    },
    session: {
      fromPartition: (name, options) => {
        calls.partition = { name, options };
        return isolatedSession;
      },
    },
  };
  vm.runInNewContext(source, {
    require(name) {
      if (name === 'electron') return electron;
      if (name === './policy.cjs') return policy;
      if (name === './runtime.cjs') {
        return {
          DesktopRuntimeError,
          payloadDirectory: () => path.resolve('tests', 'payload'),
          startDesktopRuntime: async (options) => {
            calls.startOptions = options;
            if (startupError) throw startupError;
            return startImpl ? startImpl(options, runtime) : runtime;
          },
        };
      }
      return require(name);
    },
    __dirname: path.join(__dirname, '..'),
    process: { resourcesPath: path.resolve('tests', 'resources') },
    AbortController,
    console: { log: (message) => calls.logs.push(message) },
  }, { filename: 'main.cjs' });
  await nextTurn();
  return { calls, app, session: isolatedSession, window: calls.windows[0], runtime };
}

test('shell creates a sandboxed window, ephemeral session, denied permissions, and tray', async () => {
  const { calls, window } = await launch();
  assert.equal(calls.name, policy.APP_NAME);
  assert.equal(calls.appId, policy.APP_ID);
  assert.equal(calls.windows.length, 1);
  assert.equal(window.options.width, 1366);
  assert.equal(window.options.height, 900);
  assert.equal(window.url, `${origin}/`);
  assert.equal(window.visible, true);
  assert.equal(window.menuRemoved, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.webSecurity, true);
  assert.equal(window.options.webPreferences.webviewTag, false);
  assert.equal(window.options.webPreferences.devTools, false);
  assert.equal(Object.hasOwn(window.options.webPreferences, 'preload'), false);
  assert.ok(calls.partition.name.startsWith('hf-desktop-'));
  assert.equal(calls.partition.name.startsWith('persist:'), false);
  assert.equal(calls.partition.options.cache, false);
  calls.permissionRequest(null, 'camera', (allowed) => assert.equal(allowed, false));
  assert.equal(calls.permissionCheck(), false);
  assert.equal(calls.devicePermission(), false);
  calls.displayMedia({}, (streams) => assert.equal(Object.keys(streams).length, 0));
  assert.deepEqual(Array.from(calls.tray.menu, (item) => item.label).filter(Boolean), ['Open', 'Open data folder', 'Quit']);
  assert.equal(calls.logs.some((line) => line.includes(token)), false);
});

test('session request hook authenticates only its backend and strips tokens from foreign origins', async () => {
  const { calls } = await launch();
  calls.headers({ url: `${origin}/api`, requestHeaders: { 'X-HF-Desktop-Token': 'forged' } }, ({ requestHeaders }) => {
    assert.deepEqual(requestHeaders, { [policy.TOKEN_HEADER]: token });
  });
  calls.headers({ url: 'https://example.com', requestHeaders: { [policy.TOKEN_HEADER]: token } }, ({ requestHeaders }) => {
    assert.deepEqual(requestHeaders, {});
  });
});

test('close hides to tray, second instance restores, and minimization does not hide', async () => {
  const { app, calls, window } = await launch();
  const close = event();
  window.emit('close', close);
  assert.equal(close.prevented, true);
  assert.equal(window.visible, false);
  assert.equal(calls.stops, 0);
  app.emit('second-instance');
  assert.equal(window.visible, true);
  window.minimized = true;
  window.emit('minimize', event());
  assert.equal(window.visible, true);
  calls.tray.emit('double-click');
  assert.equal(window.minimized, false);
  assert.equal(window.focused, true);
});

test('a second process with no single-instance lock never starts the backend', async () => {
  const { calls } = await launch({ hasLock: false });
  assert.equal(calls.quit, 1);
  assert.equal(calls.startOptions, undefined);
  assert.equal(calls.windows.length, 0);
});

test('navigation, redirects, webviews, and new windows cannot leave the local shell', async () => {
  const { calls, window } = await launch();
  const contents = window.webContents;
  const local = event();
  contents.emit('will-navigate', local, `${origin}/dashboard`);
  assert.equal(local.prevented, false);
  const external = event();
  contents.emit('will-navigate', external, 'https://learn.microsoft.com/');
  assert.equal(external.prevented, true);
  assert.deepEqual(calls.external, ['https://learn.microsoft.com/']);
  for (const url of ['file:///C:/Windows/explorer.exe', 'javascript:alert(1)', 'https://localhost']) {
    const blocked = event();
    contents.emit('will-navigate', blocked, url);
    assert.equal(blocked.prevented, true);
    assert.equal(window.openHandler({ url }).action, 'deny');
  }
  const redirect = event();
  contents.emit('will-redirect', redirect, 'https://example.com');
  assert.equal(redirect.prevented, true);
  const frame = event({ isMainFrame: false, url: 'https://example.com' });
  contents.emit('will-frame-navigate', frame);
  assert.equal(frame.prevented, true);
  const webview = event();
  contents.emit('will-attach-webview', webview);
  assert.equal(webview.prevented, true);
  assert.equal(window.openHandler({ url: 'https://github.com' }).action, 'deny');
  assert.deepEqual(calls.external, ['https://learn.microsoft.com/', 'https://github.com']);
});

test('exports use native save approval and foreign or executable downloads are cancelled', async () => {
  const { session, window } = await launch();
  function download({ filename = 'report.csv', chain = [`blob:${origin}/uuid`], source = window.webContents } = {}) {
    const downloadEvent = event();
    let options;
    const item = {
      getFilename: () => filename,
      getURLChain: () => chain,
      setSaveDialogOptions: (value) => { options = value; },
    };
    session.emit('will-download', downloadEvent, item, source);
    return { prevented: downloadEvent.prevented, options };
  }
  const good = download();
  assert.equal(good.prevented, false);
  assert.equal(good.options.buttonLabel, 'Save');
  assert.ok(good.options.defaultPath.endsWith('report.csv'));
  for (const options of [
    { filename: 'setup.exe' }, { chain: ['https://example.com/report.csv'] },
    { chain: [`${origin}/redirect`, 'https://example.com/report.csv'] },
    { chain: [] }, { source: new EventEmitter() },
  ]) {
    const blocked = download(options);
    assert.equal(blocked.prevented, true);
    assert.equal(blocked.options, undefined);
  }
});

test('tray data-folder action uses only the owned directory and Quit stops the backend', async () => {
  const { calls, runtime, window } = await launch();
  calls.tray.menu.find((item) => item.label === 'Open data folder').click();
  await nextTurn();
  assert.deepEqual(calls.folders, [runtime.dataDirectory]);
  calls.tray.menu.find((item) => item.label === 'Quit').click();
  await nextTurn();
  assert.ok(calls.stops >= 1);
  assert.equal(calls.tray.destroyed, true);
  const close = event();
  window.emit('close', close);
  assert.equal(close.prevented, false);
});

test('backend and renderer crashes show native errors and stop the application', async () => {
  for (const crash of ['backend', 'renderer']) {
    const { calls, window } = await launch();
    if (crash === 'backend') calls.startOptions.onUnexpectedExit(new DesktopRuntimeError('BACKEND_EXITED', 'Backend stopped.'));
    else window.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    await nextTurn();
    assert.equal(calls.dialogs.length, 1);
    assert.ok(calls.quit >= 1);
    assert.ok(calls.stops >= 1);
    assert.equal(calls.tray.destroyed, true);
    assert.equal(calls.dialogs[0].message.includes(token), false);
  }
});

test('startup failures cannot leave an empty healthy-looking tray application', async () => {
  const { calls } = await launch({
    startupError: new DesktopRuntimeError('SCHEMA_MISMATCH', 'Incompatible workspace; data preserved.'),
  });
  await nextTurn();
  assert.equal(calls.dialogs.length, 1);
  assert.equal(calls.windows.length, 0);
  assert.equal(calls.tray, undefined);
  assert.ok(calls.quit >= 1);
});

test('quitting during startup cancels readiness and never creates a window', async () => {
  const { calls, app } = await launch({
    startImpl: (options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }),
  });
  app.quit();
  await nextTurn();
  assert.equal(calls.startOptions.signal.aborted, true);
  assert.equal(calls.windows.length, 0);
  assert.equal(calls.dialogs.length, 0);
});
