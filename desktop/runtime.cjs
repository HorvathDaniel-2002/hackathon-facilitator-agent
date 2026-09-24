'use strict';

const fs = require('node:fs/promises');
const { constants, createReadStream } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const {
  TOKEN_HEADER, assertToken, loopbackOrigin, isTrustedBackendUrl,
  backendEnvironment, sanitizeEnvironment,
} = require('./policy.cjs');

class DesktopRuntimeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DesktopRuntimeError';
    this.code = code;
  }
}

function payloadDirectory({ isPackaged, resourcesPath, desktopDirectory }) {
  return isPackaged ? path.join(resourcesPath, 'backend') : path.join(desktopDirectory, 'payload');
}

async function fileInfo(filename) {
  try {
    return await fs.lstat(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function validatePayload(directory, arch = process.arch) {
  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(path.join(directory, 'metadata.json'), 'utf8'));
  } catch {
    throw new DesktopRuntimeError('INVALID_PAYLOAD', 'The desktop package metadata is missing or damaged. Reinstall the complete Windows application.');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new DesktopRuntimeError('INVALID_PAYLOAD', 'The desktop package metadata is invalid. Reinstall the complete Windows application.');
  }
  if (metadata.arch !== arch) {
    throw new DesktopRuntimeError('WRONG_ARCH', `This package does not match the running ${arch} application architecture. Install the Windows ${arch} package; do not copy a Node runtime from another installation.`);
  }
  if (!['x64', 'arm64'].includes(metadata.arch)
    || typeof metadata.nodeVersion !== 'string' || !/^v?24\.\d+\.\d+$/.test(metadata.nodeVersion)
    || typeof metadata.appVersion !== 'string' || !metadata.appVersion.trim()
    || !/^[a-f0-9]{64}$/i.test(metadata.schemaHash || '')
    || !/^[a-f0-9]{64}$/i.test(metadata.templateSha256 || '')) {
    throw new DesktopRuntimeError('INVALID_PAYLOAD', 'The desktop package metadata or bundled Node 24 version is invalid. Reinstall the complete Windows application.');
  }
  const nodePath = path.join(directory, 'node', 'node.exe');
  const serverDirectory = path.join(directory, 'server');
  const templatePath = path.join(directory, 'template.db');
  for (const filename of [nodePath, path.join(serverDirectory, 'server.js'), templatePath]) {
    const info = await fileInfo(filename);
    if (!info || !info.isFile()) {
      throw new DesktopRuntimeError('INCOMPLETE_PAYLOAD', 'The bundled Node runtime, server, or synthetic workspace template is missing. Reinstall the complete Windows application; no separate Node installation is needed.');
    }
  }
  return {
    nodePath, serverDirectory, templatePath,
    metadata: {
      ...metadata,
      schemaHash: metadata.schemaHash.toLowerCase(),
      templateSha256: metadata.templateSha256.toLowerCase(),
    },
  };
}

async function initializeData(userDataPath, { templatePath, metadata }) {
  const dataDirectory = path.resolve(userDataPath, 'data');
  const databasePath = path.join(dataDirectory, 'workspace.db');
  const markerPath = path.join(dataDirectory, 'workspace.schema.json');
  await fs.mkdir(dataDirectory, { recursive: true });
  const databaseInfo = await fileInfo(databasePath);
  const markerInfo = await fileInfo(markerPath);

  if (databaseInfo) {
    if (!databaseInfo.isFile() || !markerInfo?.isFile()) {
      throw new DesktopRuntimeError('UNMARKED_WORKSPACE', 'An existing workspace has no valid schema marker. Its data has not been changed. Restore its matching workspace.schema.json from a backup or contact support; do not delete or replace the database.');
    }
    let marker;
    try {
      marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
    } catch {
      throw new DesktopRuntimeError('INVALID_WORKSPACE_MARKER', 'The workspace schema marker cannot be read. Its database has not been changed. Restore the matching marker from a backup or contact support.');
    }
    if (!marker || marker.schemaHash !== metadata.schemaHash) {
      throw new DesktopRuntimeError('SCHEMA_MISMATCH', 'This application version is not compatible with the existing workspace schema. No migration or reset was performed. Use the previous compatible version or contact support about migrating a backup.');
    }
    return { dataDirectory, databasePath, markerPath, created: false };
  }

  if (markerInfo || await fileInfo(`${databasePath}-wal`) || await fileInfo(`${databasePath}-shm`)) {
    throw new DesktopRuntimeError('INCOMPLETE_WORKSPACE', 'Workspace files already exist but the database is missing. No replacement was created. Restore the complete workspace from a backup or contact support.');
  }
  if (await sha256File(templatePath) !== metadata.templateSha256) {
    throw new DesktopRuntimeError('TEMPLATE_HASH_MISMATCH', 'The synthetic workspace template failed its integrity check. No database was created. Reinstall the complete Windows application.');
  }

  // Neither an existing database nor a marker may ever be replaced, including after a partial first launch.
  try {
    await fs.copyFile(templatePath, databasePath, constants.COPYFILE_EXCL);
    await fs.chmod(databasePath, 0o600);
    await fs.writeFile(markerPath, `${JSON.stringify({
      schemaHash: metadata.schemaHash,
      appVersion: metadata.appVersion,
    }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch {
    throw new DesktopRuntimeError('WORKSPACE_CREATE_FAILED', 'The first workspace could not be safely created. Any existing files were preserved. Check folder permissions and available disk space, then contact support if a partial workspace remains.');
  }
  return { dataDirectory, databasePath, markerPath, created: true };
}

function chooseLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function childHasExited(child) {
  return !child?.pid || child.exitCode !== null || child.signalCode !== null;
}

function backendExitError() {
  return new DesktopRuntimeError('BACKEND_EXITED', 'The local backend stopped unexpectedly. Close and reopen the application. If it keeps failing, check whether endpoint protection blocked the bundled Node runtime or reinstall the matching Windows package.');
}

async function waitForBackend({
  origin, token, child, signal, timeoutMs = 90_000, pollIntervalMs = 250,
  requestTimeoutMs = 2_000, fetchImpl = globalThis.fetch,
}) {
  assertToken(token);
  if (!isTrustedBackendUrl(origin, origin)) throw new TypeError('A loopback backend origin is required.');
  const controller = new AbortController();
  const cancel = () => controller.abort(new DesktopRuntimeError('STARTUP_CANCELLED', 'Desktop startup was cancelled.'));
  const onExit = () => controller.abort(backendExitError());
  const onError = () => controller.abort(new DesktopRuntimeError('BACKEND_START_FAILED', 'The included Node runtime could not start. Check endpoint protection and reinstall the matching Windows package.'));
  child?.once('exit', onExit);
  child?.once('error', onError);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  if (child?.pid && childHasExited(child)) onExit();
  const timer = setTimeout(() => controller.abort(new DesktopRuntimeError(
    'HEALTH_TIMEOUT',
    `The local backend did not become ready within ${Math.ceil(timeoutMs / 1000)} seconds. It has been stopped. Close and reopen the application; if this repeats, check endpoint protection or reinstall the complete Windows package.`,
  )), timeoutMs);

  try {
    while (!controller.signal.aborted) {
      try {
        const response = await fetchImpl(`${origin}/api/desktop-health`, {
          headers: { [TOKEN_HEADER]: token },
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeoutMs)]),
        });
        if (response.status === 200 && (await response.json())?.ready === true) {
          controller.signal.throwIfAborted();
          return;
        }
        await response.body?.cancel();
      } catch {
        controller.signal.throwIfAborted();
      }
      try {
        await delay(pollIntervalMs, undefined, { signal: controller.signal });
      } catch {
        controller.signal.throwIfAborted();
      }
    }
    controller.signal.throwIfAborted();
  } finally {
    clearTimeout(timer);
    child?.removeListener('exit', onExit);
    child?.removeListener('error', onError);
    signal?.removeEventListener('abort', cancel);
  }
}

function waitForExit(child, timeoutMs) {
  if (childHasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
  });
}

async function stopBackend(child, { graceMs = 3_000, forceMs = 2_000, platform = process.platform, spawnImpl = spawn } = {}) {
  if (childHasExited(child)) return;
  const gracefulExit = waitForExit(child, graceMs);
  try { child.kill(); } catch { /* Escalate only for this still-owned process. */ }
  if (await gracefulExit || childHasExited(child)) return;
  const forcedExit = waitForExit(child, forceMs);
  if (platform === 'win32') {
    const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || process.env.WINDIR || 'C:\\Windows';
    const killer = spawnImpl(path.join(systemRoot, 'System32', 'taskkill.exe'), [
      '/PID', String(child.pid), '/T', '/F',
    ], { windowsHide: true, shell: false, stdio: 'ignore', env: sanitizeEnvironment(process.env) });
    killer.on('error', () => {});
    const killerTimeout = setTimeout(() => { if (!childHasExited(killer)) killer.kill(); }, forceMs);
    killer.once('exit', () => clearTimeout(killerTimeout));
  } else {
    try { child.kill('SIGKILL'); } catch { /* The process may have exited between checks. */ }
  }
  if (!await forcedExit) {
    throw new DesktopRuntimeError('BACKEND_STOP_FAILED', 'The owned backend process could not be stopped. Close this application and end that process in Task Manager before reopening it.');
  }
}

async function startDesktopRuntime({
  directory, userDataPath, arch = process.arch, environment = process.env, signal,
  timeoutMs = 90_000, onUnexpectedExit = () => {}, spawnImpl = spawn, fetchImpl = globalThis.fetch,
}) {
  const payload = await validatePayload(directory, arch);
  const workspace = await initializeData(userDataPath, payload);
  signal?.throwIfAborted();
  const port = await chooseLoopbackPort();
  signal?.throwIfAborted();
  const origin = loopbackOrigin(port);
  const token = randomBytes(32).toString('hex');
  let child;
  try {
    child = spawnImpl(payload.nodePath, ['server.js'], {
      cwd: payload.serverDirectory,
      env: backendEnvironment(environment, { databasePath: workspace.databasePath, port, token }),
      windowsHide: true,
      shell: false,
      // Backend output can contain workspace content; never persist or relay it into desktop logs.
      stdio: 'ignore',
    });
  } catch {
    throw new DesktopRuntimeError('BACKEND_START_FAILED', 'The included Node runtime could not start. Reinstall the matching Windows package.');
  }
  let ready = false;
  let stopping = false;
  let stopPromise;
  const onFailure = () => { if (ready && !stopping) onUnexpectedExit(backendExitError()); };
  child.on('exit', onFailure);
  child.on('error', onFailure);
  const stop = () => {
    stopping = true;
    stopPromise ||= stopBackend(child).finally(() => {
      child.removeListener('exit', onFailure);
      child.removeListener('error', onFailure);
    });
    return stopPromise;
  };
  try {
    await waitForBackend({ origin, token, child, signal, timeoutMs, fetchImpl });
    if (childHasExited(child)) throw backendExitError();
    signal?.throwIfAborted();
    ready = true;
    return { ...workspace, metadata: payload.metadata, origin, token, child, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

module.exports = {
  DesktopRuntimeError, payloadDirectory, validatePayload, initializeData, sha256File,
  chooseLoopbackPort, waitForBackend, stopBackend, startDesktopRuntime,
};
