'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  APP_ID, TOKEN_HEADER, loopbackOrigin, isTrustedBackendUrl, headersForRequest,
  sanitizeEnvironment, backendEnvironment, isSafeExternalUrl, isTrustedDownloadUrl, safeDownloadName,
  isTrustedPrintViewUrl, isAttributionMailto,
} = require('../policy.cjs');

const origin = 'http://127.0.0.1:43123';
const token = 'a'.repeat(64);

test('backend trust is limited to the exact numeric loopback origin', () => {
  for (const value of [origin, `${origin}/`, `${origin}/api?a=1#section`]) {
    assert.equal(isTrustedBackendUrl(value, origin), true, value);
  }
  for (const value of [
    'http://127.0.0.1:43124/', 'https://127.0.0.1:43123/', 'http://localhost:43123/',
    'http://[::1]:43123/', 'http://127.0.0.1.evil.com:43123/', 'http://2130706433:43123/',
    'http://127.1:43123/', `http://user:pass@127.0.0.1:43123/`, `${origin}@evil.com/`,
    ` ${origin}/`, `${origin}\\@evil.com/`, 'file:///C:/workspace.db', 'about:blank', '/api', null,
  ]) assert.equal(isTrustedBackendUrl(value, origin), false, String(value));
  assert.equal(isTrustedBackendUrl('https://example.com/', 'https://example.com'), false);
});

test('only trusted requests receive the fresh token and inherited token variants are removed', () => {
  const headers = { Accept: 'application/json', 'X-HF-Desktop-Token': 'old', [TOKEN_HEADER]: 'forged' };
  assert.deepEqual(headersForRequest(headers, `${origin}/api`, origin, token), {
    Accept: 'application/json', [TOKEN_HEADER]: token,
  });
  for (const target of ['https://example.com/', 'http://localhost:43123/', 'http://127.0.0.1:43124/']) {
    assert.deepEqual(headersForRequest(headers, target, origin, token), { Accept: 'application/json' });
  }
  assert.equal(headers['X-HF-Desktop-Token'], 'old');
  assert.throws(() => headersForRequest({}, origin, origin, 'short'), /session token/);
  assert.throws(() => headersForRequest({}, origin, origin, 'A'.repeat(64)), /session token/);
});

test('backend environment is an allowlist with fixed local-only production settings', () => {
  const inherited = {
    Path: 'C:\\Windows\\System32', SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows',
    APPDATA: 'C:\\Users\\Demo\\AppData\\Roaming', TEMP: 'C:\\Users\\Demo\\AppData\\Local\\Temp',
    NODE_OPTIONS: '--require secret.cjs', NODE_PATH: 'injected', ELECTRON_RUN_AS_NODE: '1',
    OPENAI_API_KEY: 'secret', AZURE_CLIENT_SECRET: 'secret', AWS_SECRET_ACCESS_KEY: 'secret',
    DATABASE_URL: 'customer.db', AUTH_MODE: 'none', AI_PROVIDER: 'azure', PORT: '1',
    HTTPS_PROXY: 'https://secret:secret@example.com', HF_DESKTOP_SESSION_TOKEN: 'inherited',
  };
  assert.deepEqual(sanitizeEnvironment(inherited), {
    PATH: inherited.Path, SYSTEMROOT: inherited.SystemRoot, WINDIR: inherited.WINDIR,
    APPDATA: inherited.APPDATA, TEMP: inherited.TEMP,
  });
  const databasePath = path.resolve('tests', 'space in name', 'workspace.db');
  const env = backendEnvironment(inherited, { databasePath, port: 43123, token });
  assert.equal(env.DATABASE_URL, `file:${databasePath}`);
  assert.equal(env.AUTH_MODE, 'desktop-local');
  assert.equal(env.AI_PROVIDER, 'mock');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.HOSTNAME, '127.0.0.1');
  assert.equal(env.APP_URL, origin);
  assert.equal(env.PORT, '43123');
  assert.equal(env.HF_DESKTOP_SESSION_TOKEN, token);
  assert.equal(env.NEXT_TELEMETRY_DISABLED, '1');
  assert.equal(env.HF_DESKTOP_PACKAGE, '1');
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE', 'OPENAI_API_KEY', 'AZURE_CLIENT_SECRET', 'AWS_SECRET_ACCESS_KEY', 'HTTPS_PROXY']) {
    assert.equal(Object.hasOwn(env, name), false, name);
  }
  assert.throws(() => backendEnvironment({}, { databasePath: 'relative.db', port: 43123, token }), /absolute/);
  for (const port of [0, -1, 65536, 2.5, '43123', NaN]) assert.throws(() => loopbackOrigin(port));
  assert.equal(APP_ID, 'com.danielhorvath.hackathonfacilitator');
});

test('external browser links require public-looking HTTPS names without credentials or custom ports', () => {
  for (const url of ['https://learn.microsoft.com/en-us/', 'https://github.com/a/b?q=1#readme', 'https://example.com:443/']) {
    assert.equal(isSafeExternalUrl(url), true, url);
  }
  for (const url of [
    'http://example.com', 'file:///C:/Windows/explorer.exe', 'javascript:alert(1)',
    'data:text/html,hello', 'mailto:someone@example.com', 'https://user:pass@example.com',
    'https://user@example.com', 'https://example.com:8443', 'https://localhost', 'https://intranet',
    'https://127.0.0.1', 'https://10.1.2.3', 'https://172.16.0.1', 'https://192.168.1.1',
    'https://169.254.169.254', 'https://2130706433', 'https://0x7f000001', 'https://[::1]',
    'https://[fd00::1]', 'https://office.local', 'https://login.internal', 'https://files.corp',
    'https://metadata.google.internal', 'https://foo.home.arpa', 'https://example.com.',
    'https://example.com\\@localhost', ' https://example.com', 'https://exam\nple.com', null,
  ]) assert.equal(isSafeExternalUrl(url), false, String(url));
});

test('download policy permits local exports and rejects executable or foreign downloads', () => {
  assert.equal(isTrustedDownloadUrl(`${origin}/export.csv`, origin), true);
  assert.equal(isTrustedDownloadUrl(`blob:${origin}/uuid`, origin), true);
  for (const url of ['blob:https://example.com/uuid', 'blob:null/uuid', 'data:text/csv,hello', 'https://example.com/export.csv']) {
    assert.equal(isTrustedDownloadUrl(url, origin), false);
  }
  assert.equal(safeDownloadName('report.csv'), 'report.csv');
  assert.equal(safeDownloadName('..\\..\\report.md'), 'report.md');
  assert.equal(safeDownloadName('CON.csv'), 'export-CON.csv');
  assert.equal(safeDownloadName('a:b.csv'), 'a-b.csv');
  assert.equal(safeDownloadName('project notes.md'), 'project notes.md');
  for (const filename of ['setup.exe', 'script.cmd', 'payload.ps1', 'page.html', 'image.svg', 'file.csv.exe', '', null]) {
    assert.equal(safeDownloadName(filename), null, String(filename));
  }
});

test('print preview permits only the exact local HTML export endpoint', () => {
  for (const url of [
    `${origin}/api/export?hackathonId=synthetic-id&kind=portfolio&format=html`,
    `${origin}/api/export?hackathonId=synthetic-id&kind=runbook&format=html`,
  ]) assert.equal(isTrustedPrintViewUrl(url, origin), true, url);
  for (const url of [
    `${origin}/dashboard?format=html`, `${origin}/api/export?format=csv`,
    `${origin}/api/export?format=html`, `${origin}/api/export?hackathonId=x&kind=summary&format=html`,
    `${origin}/api/export?format=html&format=csv`, `${origin}/api/export?format=html&redirect=https://example.com`,
    `${origin}/api/export?format=html&kind=a&kind=b`, `${origin}/api/export`,
    'http://localhost:43123/api/export?format=html', 'https://example.com/api/export?format=html',
    'file:///C:/api/export?format=html',
  ]) assert.equal(isTrustedPrintViewUrl(url, origin), false, url);
});

test('attribution mail link cannot include extra recipients, headers, or arguments', () => {
  assert.equal(isAttributionMailto('mailto:dahorvath@microsoft.com'), true);
  for (const url of [
    'mailto:other@example.test', 'mailto:dahorvath@microsoft.com?subject=hello',
    'mailto:dahorvath@microsoft.com?bcc=other@example.com', 'mailto:dahorvath@microsoft.com,other@example.com',
    'mailto:dahorvath@microsoft.com%0d%0aSubject:test', 'mailto:dahorvath@microsoft.com --flag',
  ]) assert.equal(isAttributionMailto(url), false, url);
});
