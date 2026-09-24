'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { spawn } = require('node:child_process');
const {
  payloadDirectory, validatePayload, initializeData, chooseLoopbackPort, waitForBackend,
  stopBackend, startDesktopRuntime,
} = require('../runtime.cjs');
const { TOKEN_HEADER } = require('../policy.cjs');

const token = 'b'.repeat(64);
const schemaHash = 'c'.repeat(64);

async function fixture(t) {
  const root = path.relative(process.cwd(), path.join(__dirname, `.runtime-test-${randomUUID()}`));
  await fs.mkdir(path.join(root, 'payload', 'node'), { recursive: true });
  await fs.mkdir(path.join(root, 'payload', 'server'), { recursive: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('SQLite format 3\0synthetic seed test fixture');
  const metadata = {
    schemaHash, arch: process.arch, nodeVersion: '24.15.0', appVersion: '0.3.0',
    templateSha256: createHash('sha256').update(bytes).digest('hex'),
  };
  const directory = path.resolve(root, 'payload');
  const userDataPath = path.resolve(root, 'user');
  await Promise.all([
    fs.writeFile(path.join(root, 'payload', 'metadata.json'), JSON.stringify(metadata)),
    fs.writeFile(path.join(root, 'payload', 'node', 'node.exe'), 'fixture, not executable'),
    fs.writeFile(path.join(root, 'payload', 'server', 'server.js'), '// fixture'),
    fs.writeFile(path.join(root, 'payload', 'template.db'), bytes),
  ]);
  return { root, bytes, metadata, directory, userDataPath, templatePath: path.join(directory, 'template.db') };
}

function errorCode(code) {
  return (error) => error.code === code && !error.message.includes(token);
}

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = 424242;
    this.exitCode = null;
    this.signalCode = null;
    this.kills = [];
  }
  kill(signal = 'SIGTERM') {
    this.kills.push(signal);
    queueMicrotask(() => {
      this.signalCode = signal;
      this.emit('exit', null, signal);
    });
    return true;
  }
}

async function healthServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('development and installed payload locations are distinct', () => {
  const desktopDirectory = path.resolve('desktop');
  const resourcesPath = path.resolve('resources');
  assert.equal(payloadDirectory({ isPackaged: false, desktopDirectory, resourcesPath }), path.join(desktopDirectory, 'payload'));
  assert.equal(payloadDirectory({ isPackaged: true, desktopDirectory, resourcesPath }), path.join(resourcesPath, 'backend'));
});

test('payload validation requires correct architecture, bundled Node 24, files, and hashes', async (t) => {
  const data = await fixture(t);
  const payload = await validatePayload(data.directory);
  assert.equal(payload.nodePath, path.join(data.directory, 'node', 'node.exe'));
  await assert.rejects(validatePayload(data.directory, process.arch === 'arm64' ? 'x64' : 'arm64'), errorCode('WRONG_ARCH'));
  await fs.writeFile(path.join(data.directory, 'metadata.json'), JSON.stringify({ ...data.metadata, nodeVersion: '22.0.0' }));
  await assert.rejects(validatePayload(data.directory), errorCode('INVALID_PAYLOAD'));
  await fs.writeFile(path.join(data.directory, 'metadata.json'), JSON.stringify({ ...data.metadata, schemaHash: 'invalid' }));
  await assert.rejects(validatePayload(data.directory), errorCode('INVALID_PAYLOAD'));
  await fs.writeFile(path.join(data.directory, 'metadata.json'), JSON.stringify(data.metadata));
  await fs.unlink(payload.nodePath);
  await assert.rejects(validatePayload(data.directory), errorCode('INCOMPLETE_PAYLOAD'));
});

test('first launch copies the verified synthetic seed and writes the matching schema marker', async (t) => {
  const data = await fixture(t);
  const workspace = await initializeData(data.userDataPath, data);
  assert.equal(workspace.created, true);
  assert.deepEqual(await fs.readFile(workspace.databasePath), data.bytes);
  assert.deepEqual(JSON.parse(await fs.readFile(workspace.markerPath, 'utf8')), {
    schemaHash, appVersion: data.metadata.appVersion,
  });
});

test('a matching-schema upgrade preserves the existing database and marker byte for byte', async (t) => {
  const data = await fixture(t);
  const workspace = await initializeData(data.userDataPath, data);
  const changedBytes = Buffer.from('existing workspace - must not be reset');
  await fs.writeFile(workspace.databasePath, changedBytes);
  const previousMarker = await fs.readFile(workspace.markerPath);
  await fs.writeFile(data.templatePath, 'different seed must never replace a workspace');
  const second = await initializeData(data.userDataPath, {
    ...data, metadata: { ...data.metadata, appVersion: '0.4.0' },
  });
  assert.equal(second.created, false);
  assert.deepEqual(await fs.readFile(workspace.databasePath), changedBytes);
  assert.deepEqual(await fs.readFile(workspace.markerPath), previousMarker);
});

test('schema mismatch, absent marker, and damaged marker all preserve existing data', async (t) => {
  const data = await fixture(t);
  const workspace = await initializeData(data.userDataPath, data);
  await assert.rejects(initializeData(data.userDataPath, {
    ...data, metadata: { ...data.metadata, schemaHash: 'd'.repeat(64) },
  }), errorCode('SCHEMA_MISMATCH'));
  await fs.writeFile(workspace.markerPath, 'not JSON');
  await assert.rejects(initializeData(data.userDataPath, data), errorCode('INVALID_WORKSPACE_MARKER'));
  await fs.unlink(workspace.markerPath);
  await assert.rejects(initializeData(data.userDataPath, data), errorCode('UNMARKED_WORKSPACE'));
  assert.deepEqual(await fs.readFile(workspace.databasePath), data.bytes);
});

test('a tampered template is rejected before any database or marker is written', async (t) => {
  const data = await fixture(t);
  await fs.writeFile(data.templatePath, 'damaged seed');
  await assert.rejects(initializeData(data.userDataPath, data), errorCode('TEMPLATE_HASH_MISMATCH'));
  assert.deepEqual(await fs.readdir(path.join(data.userDataPath, 'data')), []);
});

test('orphan schema markers or SQLite sidecars must not cause automatic reseeding', async (t) => {
  const data = await fixture(t);
  const directory = path.join(data.userDataPath, 'data');
  await fs.mkdir(directory, { recursive: true });
  for (const filename of ['workspace.schema.json', 'workspace.db-wal', 'workspace.db-shm']) {
    await fs.writeFile(path.join(directory, filename), 'preserve');
    await assert.rejects(initializeData(data.userDataPath, data), errorCode('INCOMPLETE_WORKSPACE'));
    assert.deepEqual(await fs.readdir(directory), [filename]);
    assert.equal(await fs.readFile(path.join(directory, filename), 'utf8'), 'preserve');
    await fs.unlink(path.join(directory, filename));
  }
});

test('simultaneous first launches cannot overwrite the exclusive database copy', async (t) => {
  const data = await fixture(t);
  const results = await Promise.allSettled([
    initializeData(data.userDataPath, data), initializeData(data.userDataPath, data),
  ]);
  assert.ok(results.some((result) => result.status === 'fulfilled'));
  assert.deepEqual(await fs.readFile(path.join(data.userDataPath, 'data', 'workspace.db')), data.bytes);
  assert.equal((await initializeData(data.userDataPath, data)).created, false);
});

test('health polling sends only a header token and requires status 200 plus ready true', async (t) => {
  let calls = 0;
  const origin = await healthServer(t, (request, response) => {
    assert.equal(request.url, '/api/desktop-health');
    assert.equal(request.headers[TOKEN_HEADER], token);
    calls += 1;
    response.writeHead(calls === 1 ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ready: calls >= 3 }));
  });
  await waitForBackend({ origin, token, timeoutMs: 2000, pollIntervalMs: 10 });
  assert.equal(calls, 3);
});

test('health redirects are never followed and timeout is explicit', async (t) => {
  let redirectedCalls = 0;
  const origin = await healthServer(t, (request, response) => {
    if (request.url !== '/api/desktop-health') redirectedCalls += 1;
    response.writeHead(302, { location: '/redirected' });
    response.end();
  });
  await assert.rejects(waitForBackend({ origin, token, timeoutMs: 100, pollIntervalMs: 10 }), errorCode('HEALTH_TIMEOUT'));
  assert.equal(redirectedCalls, 0);
});

test('hung health requests abort within the overall deadline', async (t) => {
  const origin = await healthServer(t, () => {});
  await assert.rejects(waitForBackend({
    origin, token, timeoutMs: 100, requestTimeoutMs: 1000, pollIntervalMs: 10,
  }), errorCode('HEALTH_TIMEOUT'));
});

test('child exit and user cancellation abort health polling without leaking listeners', async (t) => {
  const origin = await healthServer(t, () => {});
  const child = new FakeChild();
  const waiting = waitForBackend({ origin, token, child, timeoutMs: 2000 });
  child.emit('exit', 1, null);
  await assert.rejects(waiting, errorCode('BACKEND_EXITED'));
  assert.equal(child.listenerCount('exit'), 0);
  assert.equal(child.listenerCount('error'), 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForBackend({ origin, token, signal: controller.signal }), errorCode('STARTUP_CANCELLED'));
});

test('startup uses the included runtime, fixed working directory, fresh token, and no inherited secrets', async (t) => {
  const data = await fixture(t);
  const child = new FakeChild();
  let spawnOptions;
  const runtime = await startDesktopRuntime({
    directory: data.directory, userDataPath: data.userDataPath,
    environment: { PATH: 'system-path', NODE_OPTIONS: 'injection', OPENAI_API_KEY: 'secret' },
    spawnImpl(executable, args, options) {
      assert.equal(executable, path.join(data.directory, 'node', 'node.exe'));
      assert.deepEqual(args, ['server.js']);
      spawnOptions = options;
      return child;
    },
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).pathname, '/api/desktop-health');
      assert.match(options.headers[TOKEN_HEADER], /^[a-f0-9]{64}$/);
      assert.equal(options.headers[TOKEN_HEADER], spawnOptions.env.HF_DESKTOP_SESSION_TOKEN);
      return { status: 200, json: async () => ({ ready: true }) };
    },
  });
  assert.equal(spawnOptions.cwd, path.join(data.directory, 'server'));
  assert.equal(spawnOptions.shell, false);
  assert.equal(spawnOptions.windowsHide, true);
  assert.equal(spawnOptions.stdio, 'ignore');
  assert.equal(spawnOptions.env.NODE_OPTIONS, undefined);
  assert.equal(spawnOptions.env.OPENAI_API_KEY, undefined);
  assert.equal(spawnOptions.env.APP_URL, runtime.origin);
  assert.equal(spawnOptions.env.DATABASE_URL, `file:${runtime.databasePath}`);
  await Promise.all([runtime.stop(), runtime.stop()]);
  assert.deepEqual(child.kills, ['SIGTERM']);
});

test('startup timeout stops its owned backend before returning the error', async (t) => {
  const data = await fixture(t);
  const child = new FakeChild();
  await assert.rejects(startDesktopRuntime({
    directory: data.directory, userDataPath: data.userDataPath, timeoutMs: 30,
    spawnImpl: () => child,
    fetchImpl: async () => ({ status: 503 }),
  }), errorCode('HEALTH_TIMEOUT'));
  assert.deepEqual(child.kills, ['SIGTERM']);
  assert.equal(child.listenerCount('exit'), 0);
});

test('a bundled runtime spawn error fails startup without an unhandled child error', async (t) => {
  const data = await fixture(t);
  const child = new FakeChild();
  child.pid = undefined;
  await assert.rejects(startDesktopRuntime({
    directory: data.directory, userDataPath: data.userDataPath,
    spawnImpl: () => {
      queueMicrotask(() => child.emit('error', new Error('ENOENT')));
      return child;
    },
    fetchImpl: async () => ({ status: 503 }),
  }), errorCode('BACKEND_START_FAILED'));
  assert.deepEqual(child.kills, []);
});

test('runtime reports post-readiness backend crashes but not an intentional shutdown', async (t) => {
  const data = await fixture(t);
  const child = new FakeChild();
  const failures = [];
  const runtime = await startDesktopRuntime({
    directory: data.directory, userDataPath: data.userDataPath, spawnImpl: () => child,
    fetchImpl: async () => ({ status: 200, json: async () => ({ ready: true }) }),
    onUnexpectedExit: (error) => failures.push(error.code),
  });
  child.exitCode = 1;
  child.emit('exit', 1, null);
  assert.deepEqual(failures, ['BACKEND_EXITED']);
  await runtime.stop();
  assert.deepEqual(child.kills, []);
  assert.equal(child.listenerCount('exit'), 0);
});

test('stopBackend terminates a real owned child and is harmless after its exit', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    windowsHide: true, shell: false, stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  await stopBackend(child, { graceMs: 1000, forceMs: 1000 });
  assert.ok(child.exitCode !== null || child.signalCode !== null);
  await stopBackend(child);
});

test('Windows shutdown escalation uses only the exact owned PID, never an image name', async () => {
  const child = new FakeChild();
  child.kill = () => true;
  let command;
  await stopBackend(child, {
    graceMs: 5, forceMs: 100, platform: 'win32',
    spawnImpl(executable, args, options) {
      command = { executable, args, options };
      const killer = new FakeChild();
      queueMicrotask(() => {
        child.exitCode = 1;
        child.emit('exit', 1, null);
        killer.exitCode = 0;
        killer.emit('exit', 0, null);
      });
      return killer;
    },
  });
  assert.match(command.executable, /taskkill\.exe$/);
  assert.deepEqual(command.args, ['/PID', '424242', '/T', '/F']);
  assert.equal(command.options.shell, false);
});

test('port allocation returns an available loopback port', async () => {
  const port = await chooseLoopbackPort();
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
});
