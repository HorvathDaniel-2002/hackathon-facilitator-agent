'use strict';

const { isIP } = require('node:net');
const path = require('node:path');

const APP_NAME = 'Hackathon Facilitator';
const APP_ID = 'com.danielhorvath.hackathonfacilitator';
const TOKEN_HEADER = 'x-hf-desktop-token';
const SYSTEM_ENVIRONMENT_KEYS = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMDATA', 'ALLUSERSPROFILE', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'PROGRAMW6432', 'LANG', 'LC_ALL', 'TZ',
]);

function assertToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new TypeError('A fresh 64-character desktop session token is required.');
  }
}

function loopbackOrigin(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('A valid loopback port is required.');
  }
  return `http://127.0.0.1:${port}`;
}

function isTrustedBackendUrl(value, origin) {
  if (typeof value !== 'string' || typeof origin !== 'string') return false;
  try {
    const base = new URL(origin);
    const candidate = new URL(value);
    return /^http:\/\/127\.0\.0\.1(?::[0-9]+)?$/.test(origin)
      && /^http:\/\/127\.0\.0\.1(?::[0-9]+)?(?:[/?#]|$)/.test(value)
      && base.hostname === '127.0.0.1'
      && candidate.origin === base.origin
      && candidate.username === ''
      && candidate.password === '';
  } catch {
    return false;
  }
}

function headersForRequest(headers, url, origin, token) {
  assertToken(token);
  const result = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (name.toLowerCase() !== TOKEN_HEADER) result[name] = value;
  }
  if (isTrustedBackendUrl(url, origin)) result[TOKEN_HEADER] = token;
  return result;
}

function sanitizeEnvironment(source) {
  const result = {};
  for (const [name, value] of Object.entries(source || {})) {
    if (SYSTEM_ENVIRONMENT_KEYS.has(name.toUpperCase()) && typeof value === 'string') {
      result[name.toUpperCase()] = value;
    }
  }
  return result;
}

function backendEnvironment(source, { databasePath, port, token }) {
  assertToken(token);
  if (typeof databasePath !== 'string' || !path.isAbsolute(databasePath)) {
    throw new TypeError('An absolute workspace database path is required.');
  }
  return {
    ...sanitizeEnvironment(source),
    NODE_ENV: 'production',
    AUTH_MODE: 'desktop-local',
    AI_PROVIDER: 'mock',
    DATABASE_URL: `file:${databasePath}`,
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    APP_URL: loopbackOrigin(port),
    HF_DESKTOP_SESSION_TOKEN: token,
    NEXT_TELEMETRY_DISABLED: '1',
    HF_DESKTOP_PACKAGE: '1',
  };
}

function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\\]/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.') || host.endsWith('.')) return false;
    if (/(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|arpa|onion)$/.test(host)) {
      return false;
    }
    return host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
      && /^[a-z]{2,63}$/.test(host.split('.').at(-1));
  } catch {
    return false;
  }
}

function isTrustedDownloadUrl(value, origin) {
  return isTrustedBackendUrl(value, origin)
    || (typeof value === 'string' && value.startsWith('blob:')
      && isTrustedBackendUrl(value.slice(5), origin));
}

function safeDownloadName(value) {
  if (typeof value !== 'string' || value.length > 240) return null;
  let name = path.win32.basename(value.replace(/:/g, '-')).replace(/[<>"/\\|?*\u0000-\u001f\u007f]/g, '-').trim();
  name = name.replace(/[. ]+$/, '');
  const extension = path.win32.extname(name).slice(1).toLowerCase();
  if (!['md', 'markdown', 'csv', 'txt', 'json'].includes(extension)) return null;
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) name = `export-${name}`;
  return name;
}

module.exports = {
  APP_NAME, APP_ID, TOKEN_HEADER, assertToken, loopbackOrigin, isTrustedBackendUrl,
  headersForRequest, sanitizeEnvironment, backendEnvironment, isSafeExternalUrl,
  isTrustedDownloadUrl, safeDownloadName,
};
