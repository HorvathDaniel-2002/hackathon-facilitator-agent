'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { parseArgs, profileDirectory, cookieValue, safeEqual, backendFetch } = require('../launcher.cjs');

test('portable command modes are explicit and mutually exclusive', () => {
  assert.deepEqual(parseArgs([]), { open: true, stop: false, backup: false, check: false });
  assert.deepEqual(parseArgs(['--no-open']), { open: false, stop: false, backup: false, check: false });
  assert.equal(parseArgs(['--stop']).stop, true);
  assert.equal(parseArgs(['--backup']).backup, true);
  assert.equal(parseArgs(['--check']).check, true);
  assert.throws(() => parseArgs(['--stop', '--backup']), /only one/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
});

test('portable profile defaults to APPDATA and supports an explicit absolute test profile', () => {
  assert.equal(profileDirectory({ APPDATA: 'C:\\Users\\Demo\\AppData\\Roaming' }),
    path.win32.join('C:\\Users\\Demo\\AppData\\Roaming', 'Hackathon Facilitator Portable'));
  assert.equal(profileDirectory({ APPDATA: 'C:\\ignored', HF_PORTABLE_PROFILE: 'C:\\test\\profile' }),
    path.resolve('C:\\test\\profile'));
  assert.throws(() => profileDirectory({ APPDATA: 'relative' }), /valid APPDATA/);
});

test('session cookie parsing and constant-time equality reject missing or altered values', () => {
  assert.equal(cookieValue({ headers: { cookie: 'other=1; hf=value; last=2' } }, 'hf'), 'value');
  assert.equal(cookieValue({ headers: {} }, 'hf'), '');
  assert.equal(safeEqual('a'.repeat(64), 'a'.repeat(64)), true);
  assert.equal(safeEqual('a'.repeat(64), 'b'.repeat(64)), false);
  assert.equal(safeEqual('short', 'different'), false);
});

test('portable backend readiness preserves the proxy Host capability', async (t) => {
  const server = http.createServer((request, response) => {
    assert.equal(request.headers.host, '127.0.0.1:54321');
    assert.equal(request.headers['x-forwarded-host'], '127.0.0.1:54321');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ready":true}');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await backendFetch(`http://127.0.0.1:${server.address().port}/api/desktop-health`, {
    headers: { host: '127.0.0.1:54321', 'x-forwarded-host': '127.0.0.1:54321' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ready: true });
});
