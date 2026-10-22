'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const LIB_ROOT = fs.existsSync(path.join(ROOT, 'lib', 'runtime.cjs'))
  ? path.join(ROOT, 'lib')
  : path.join(ROOT, '..', 'desktop');
const { startDesktopRuntime, validatePayload, sha256File } = require(path.join(LIB_ROOT, 'runtime.cjs'));
const { TOKEN_HEADER } = require(path.join(LIB_ROOT, 'policy.cjs'));
const PROFILE_NAME = 'Hackathon Facilitator Portable';
const LOCK_NAME = 'launcher.json';
const CONTROL_HEADER = 'x-hf-portable-control';
const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function parseArgs(args) {
  const known = new Set(['--no-open', '--stop', '--backup', '--check']);
  for (const arg of args) {
    if (!known.has(arg)) throw new Error(`Unknown option: ${arg}`);
  }
  const modes = args.filter(arg => ['--stop', '--backup', '--check'].includes(arg));
  if (modes.length > 1) throw new Error('Choose only one of --stop, --backup or --check.');
  return {
    open: !args.includes('--no-open'),
    stop: args.includes('--stop'),
    backup: args.includes('--backup'),
    check: args.includes('--check'),
  };
}

function profileDirectory(environment = process.env) {
  const override = environment.HF_PORTABLE_PROFILE;
  const base = override || environment.APPDATA;
  if (!base || !path.isAbsolute(base)) {
    throw new Error('A valid APPDATA directory is required.');
  }
  return override ? path.resolve(override) : path.join(base, PROFILE_NAME);
}

function payloadDirectory() {
  if (!['x64', 'arm64'].includes(process.arch)) {
    throw new Error(`Unsupported Windows architecture: ${process.arch}. Use x64 or ARM64 Windows.`);
  }
  return path.join(ROOT, 'runtime', process.arch);
}

function pidIsActive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function readLock(lockPath) {
  try {
    const lock = JSON.parse(await fsp.readFile(lockPath, 'utf8'));
    return lock && typeof lock === 'object' ? lock : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot read ${lockPath}. Preserve the profile and inspect the file before retrying.`);
  }
}

async function writeLock(lockPath, value, exclusive = false) {
  await fsp.mkdir(path.dirname(lockPath), { recursive: true });
  if (exclusive) {
    await fsp.writeFile(lockPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return;
  }
  const temporary = `${lockPath}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await fsp.rename(temporary, lockPath);
}

async function removeOwnLock(lockPath) {
  const lock = await readLock(lockPath);
  if (lock?.pid === process.pid) await fsp.rm(lockPath, { force: true });
}

function openBrowser(url, environment = process.env) {
  const command = environment.ComSpec || environment.COMSPEC || 'cmd.exe';
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['/d', '/s', '/c', `start "" "${url}"`], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
      env: environment,
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('The default browser could not be opened.')));
  });
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator > 0 && cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return '';
}

function proxyRequest(request, response, runtime, publicOrigin) {
  const target = new URL(request.url, runtime.origin);
  const headers = { ...request.headers };
  for (const name of HOP_HEADERS) delete headers[name];
  delete headers.cookie;
  headers[TOKEN_HEADER] = runtime.token;
  headers['x-forwarded-host'] = new URL(publicOrigin).host;
  headers['x-forwarded-proto'] = 'http';

  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: request.method,
    path: `${target.pathname}${target.search}`,
    headers,
  }, upstreamResponse => {
    const responseHeaders = { ...upstreamResponse.headers };
    for (const name of HOP_HEADERS) delete responseHeaders[name];
    if (typeof responseHeaders.location === 'string' && responseHeaders.location.startsWith(runtime.origin)) {
      responseHeaders.location = publicOrigin + responseHeaders.location.slice(runtime.origin.length);
    }
    responseHeaders['referrer-policy'] ||= 'no-referrer';
    response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.pipe(response);
  });
  upstream.once('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('The local application backend is unavailable. Stop and restart Hackathon Facilitator.');
  });
  request.once('aborted', () => upstream.destroy());
  request.pipe(upstream);
}

function backendFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers,
      signal: options.signal,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: response.statusCode || 0,
          json: async () => JSON.parse(body.toString('utf8')),
          body: { cancel: async () => response.destroy() },
        });
      });
    });
    request.once('error', reject);
    request.end();
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function closeServer(server) {
  if (!server?.listening) return;
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}

async function waitForExisting(lockPath) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const lock = await readLock(lockPath);
    if (!lock || !pidIsActive(lock.pid)) return null;
    if (typeof lock.launchUrl === 'string' && /^http:\/\/127\.0\.0\.1:\d+\/_hf_launch\/[a-f0-9]{64}$/.test(lock.launchUrl)) {
      return lock;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Hackathon Facilitator is starting in another window. Wait a moment and try again.');
}

async function stopExisting(lockPath) {
  const lock = await readLock(lockPath);
  if (!lock || !pidIsActive(lock.pid)) {
    await fsp.rm(lockPath, { force: true });
    console.log('Hackathon Facilitator is not running.');
    return;
  }
  if (typeof lock.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(lock.origin)
      || typeof lock.controlSecret !== 'string' || !/^[a-f0-9]{64}$/.test(lock.controlSecret)) {
    throw new Error('The active launcher record is incomplete. Close its console window or stop its PID manually.');
  }
  const response = await fetch(`${lock.origin}/_hf_control/quit`, {
    method: 'POST',
    headers: { [CONTROL_HEADER]: lock.controlSecret },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 202) throw new Error(`The launcher refused the stop request (${response.status}).`);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && pidIsActive(lock.pid)) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (pidIsActive(lock.pid)) throw new Error('The launcher did not stop. Close its console window.');
  console.log('Hackathon Facilitator stopped.');
}

async function backupWorkspace(profile) {
  const lockPath = path.join(profile, LOCK_NAME);
  const lock = await readLock(lockPath);
  if (lock && pidIsActive(lock.pid)) {
    throw new Error('Stop Hackathon Facilitator before making a database backup.');
  }
  await fsp.rm(lockPath, { force: true });
  const source = path.join(profile, 'data');
  const info = await fsp.stat(source).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!info?.isDirectory()) throw new Error('No portable workspace exists yet. Start the application first.');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(profile, 'backups', timestamp);
  await fsp.cp(source, destination, { recursive: true, errorOnExist: true, force: false });
  console.log(`Backup created:\n${destination}`);
}

async function checkPackage() {
  const payload = await validatePayload(payloadDirectory(), process.arch);
  if (!/^[a-f0-9]{64}$/i.test(payload.metadata.nodeSha256 || '')) {
    throw new Error('The bundled Node checksum is missing.');
  }
  if (await sha256File(payload.nodePath) !== payload.metadata.nodeSha256.toLowerCase()) {
    throw new Error('The bundled Node runtime failed its integrity check.');
  }
  console.log(`Full app ${payload.metadata.appVersion}; Node ${payload.metadata.nodeVersion}; ${payload.metadata.arch}; package integrity passed.`);
  return payload;
}

async function start(options, profile) {
  const lockPath = path.join(profile, LOCK_NAME);
  const current = await readLock(lockPath);
  if (current && pidIsActive(current.pid)) {
    const active = await waitForExisting(lockPath);
    if (options.open && active) await openBrowser(active.launchUrl);
    console.log('Hackathon Facilitator is already running.');
    return;
  }
  await fsp.rm(lockPath, { force: true });
  await writeLock(lockPath, { pid: process.pid, status: 'starting', startedAt: new Date().toISOString() }, true);

  const sessionSecret = randomBytes(32).toString('hex');
  const launchSecret = randomBytes(32).toString('hex');
  const controlSecret = randomBytes(32).toString('hex');
  const cookieName = `hf_portable_${randomBytes(8).toString('hex')}`;
  let runtime;
  let publicOrigin;
  let stopping = false;
  let exitResolve;
  const exited = new Promise(resolve => { exitResolve = resolve; });

  const server = http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/_hf_control/quit'
        && safeEqual(String(request.headers[CONTROL_HEADER] || ''), controlSecret)) {
      response.writeHead(202, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      response.end('Stopping.');
      setImmediate(() => shutdown());
      return;
    }
    if (request.method === 'GET' && request.url === `/_hf_launch/${launchSecret}`) {
      response.writeHead(302, {
        location: '/',
        'set-cookie': `${cookieName}=${sessionSecret}; HttpOnly; SameSite=Strict; Path=/`,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      response.end();
      return;
    }
    if (!safeEqual(cookieValue(request, cookieName), sessionSecret)) {
      response.writeHead(403, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      response.end('Open Hackathon Facilitator through Start-Hackathon-Facilitator.cmd.');
      return;
    }
    if (!runtime) {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '1' });
      response.end('Hackathon Facilitator is starting.');
      return;
    }
    proxyRequest(request, response, runtime, publicOrigin);
  });
  server.on('upgrade', (_request, socket) => socket.destroy());

  async function shutdown(error) {
    if (stopping) return;
    stopping = true;
    if (error) {
      console.error(error.message || error);
      process.exitCode = 1;
    }
    await closeServer(server).catch(() => {});
    await runtime?.stop().catch(failure => {
      console.error(failure.message);
      process.exitCode = 1;
    });
    await removeOwnLock(lockPath).catch(() => {});
    exitResolve();
  }

  const onSignal = () => shutdown();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  process.once('SIGHUP', onSignal);

  try {
    const payload = await checkPackage();
    publicOrigin = await listen(server);
    runtime = await startDesktopRuntime({
      directory: payloadDirectory(),
      userDataPath: profile,
      appUrl: publicOrigin,
      fetchImpl: backendFetch,
      onUnexpectedExit: error => shutdown(error),
    });
    const launchUrl = `${publicOrigin}/_hf_launch/${launchSecret}`;
    await writeLock(lockPath, {
      pid: process.pid,
      status: 'ready',
      startedAt: new Date().toISOString(),
      origin: publicOrigin,
      launchUrl,
      controlSecret,
      appVersion: runtime.metadata.appVersion,
      architecture: runtime.metadata.arch,
      dataDirectory: runtime.dataDirectory,
    });
    console.log(`\nHackathon Facilitator ${runtime.metadata.appVersion} is ready.`);
    console.log(`Data: ${runtime.dataDirectory}`);
    console.log('Keep this window open. Use Stop-Hackathon-Facilitator.cmd or Ctrl+C to stop.\n');
    if (options.open) await openBrowser(launchUrl);
    await exited;
  } catch (error) {
    await shutdown(error);
    throw error;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGHUP', onSignal);
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This portable package supports Windows x64 and ARM64.');
  const options = parseArgs(process.argv.slice(2));
  const profile = profileDirectory();
  const lockPath = path.join(profile, LOCK_NAME);
  if (options.stop) return stopExisting(lockPath);
  if (options.backup) return backupWorkspace(profile);
  if (options.check) return checkPackage();
  return start(options, profile);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`\nERROR: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs, profileDirectory, pidIsActive, cookieValue, safeEqual, backendFetch,
};
