'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const MODULE_VERSION = '0.1.20';
const REQUIRED = [
  'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_SUBSCRIPTION_ID',
  'SIGNING_ENDPOINT', 'SIGNING_ACCOUNT_NAME', 'SIGNING_CERTIFICATE_PROFILE',
  'SIGNING_PUBLISHER_SUBJECT', 'SIGNING_PROFILE_EKU',
];
const REGIONS = new Set(['brs', 'cus', 'eus', 'jpe', 'krc', 'ncus', 'neu', 'plc', 'scus', 'swn', 'wcus', 'weu', 'wus', 'wus2', 'wus3']);

function certificateStoreSettings(env) {
  const required = ['SIGNING_CERTIFICATE_SHA1', 'SIGNING_CERTIFICATE_ISSUER',
    'SIGNING_PUBLISHER_SUBJECT', 'SIGNING_TIMESTAMP_URL', 'SIGNING_SIGNTOOL_PATH'];
  const missing = required.filter(name => typeof env[name] !== 'string' || !env[name].trim());
  if (missing.length) throw new Error(`Missing signing configuration: ${missing.join(', ')}. No signing was attempted.`);
  if (!/^[a-f0-9]{40}$/i.test(env.SIGNING_CERTIFICATE_SHA1)) {
    throw new Error('SIGNING_CERTIFICATE_SHA1 must be the exact certificate thumbprint; it does not choose the file-signature digest.');
  }
  for (const name of ['SIGNING_PUBLISHER_SUBJECT', 'SIGNING_CERTIFICATE_ISSUER']) {
    if (!env[name].startsWith('CN=') || /[\r\n\0]/.test(env[name]) || env[name].length > 1000) {
      throw new Error(`${name} must be the exact distinguished name from the issued certificate, starting with CN=.`);
    }
  }
  if (env.SIGNING_PUBLISHER_SUBJECT === env.SIGNING_CERTIFICATE_ISSUER) {
    throw new Error('A self-issued certificate is not a substitute for a trusted code-signing identity.');
  }
  if (!path.win32.isAbsolute(env.SIGNING_SIGNTOOL_PATH) ||
      path.win32.basename(env.SIGNING_SIGNTOOL_PATH).toLowerCase() !== 'signtool.exe' ||
      /[\r\n\0"]/.test(env.SIGNING_SIGNTOOL_PATH) || env.SIGNING_SIGNTOOL_PATH.startsWith('\\\\')) {
    throw new Error('SIGNING_SIGNTOOL_PATH must identify a local Windows SDK signtool.exe.');
  }
  let timestamp;
  try { timestamp = new URL(env.SIGNING_TIMESTAMP_URL); } catch { throw new Error('Invalid RFC3161 timestamp URL.'); }
  if (!['https:', 'http:'].includes(timestamp.protocol) || timestamp.username || timestamp.password ||
      timestamp.port || timestamp.search || timestamp.hash ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(timestamp.hostname) ||
      /(?:^|\.)(localhost|local|internal|example|test|invalid)$/i.test(timestamp.hostname)) {
    throw new Error('Use the certificate provider-approved RFC3161 timestamp URL without credentials or local endpoints.');
  }
  if (['CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD',
    'SIGNING_CERTIFICATE_PASSWORD', 'SIGNING_TOKEN_PIN'].some(name => env[name])) {
    throw new Error('The certificate-store lane never accepts a PFX password or token PIN in environment variables.');
  }
  return {
    provider: 'certificate-store',
    publisher: env.SIGNING_PUBLISHER_SUBJECT,
    certificateSha1: env.SIGNING_CERTIFICATE_SHA1.toUpperCase(),
    certificateIssuer: env.SIGNING_CERTIFICATE_ISSUER,
    timestampUrl: env.SIGNING_TIMESTAMP_URL,
    signTool: env.SIGNING_SIGNTOOL_PATH,
  };
}

function signingSettings(env = process.env) {
  if (env.SIGNING_ENABLED !== 'true') {
    throw new Error('Trusted signing is not enabled. Complete the approved signing setup; no unsigned fallback is allowed.');
  }
  const provider = env.SIGNING_PROVIDER || 'artifact-signing';
  if (provider === 'certificate-store') return certificateStoreSettings(env);
  if (provider !== 'artifact-signing') throw new Error('Unknown signing provider. Choose artifact-signing or certificate-store explicitly.');
  const missing = REQUIRED.filter(name => typeof env[name] !== 'string' || !env[name].trim());
  if (missing.length) throw new Error(`Missing signing configuration: ${missing.join(', ')}. No signing or publication was attempted.`);
  for (const name of REQUIRED.slice(0, 3)) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env[name])) {
      throw new Error(`${name} must be an actual tenant/application/subscription UUID.`);
    }
  }
  let endpoint;
  try { endpoint = new URL(env.SIGNING_ENDPOINT); } catch { throw new Error('SIGNING_ENDPOINT is not a valid service URL.'); }
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || endpoint.pathname !== '/' ||
      !REGIONS.has(endpoint.hostname.replace(/\.codesigning\.azure\.net$/, '')) ||
      !endpoint.hostname.endsWith('.codesigning.azure.net')) {
    throw new Error('Use the approved regional HTTPS Artifact Signing endpoint, without credentials, query or path.');
  }
  for (const name of ['SIGNING_ACCOUNT_NAME', 'SIGNING_CERTIFICATE_PROFILE']) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,99}$/.test(env[name])) throw new Error(`${name} is not a valid resource name.`);
  }
  if (!env.SIGNING_PUBLISHER_SUBJECT.startsWith('CN=') ||
      /[\r\n\0]/.test(env.SIGNING_PUBLISHER_SUBJECT) || env.SIGNING_PUBLISHER_SUBJECT.length > 1000) {
    throw new Error('SIGNING_PUBLISHER_SUBJECT must exactly match the verified certificate subject, starting with CN=.');
  }
  const eku = env.SIGNING_PROFILE_EKU;
  if (!/^1\.3\.6\.1\.4\.1\.311\.97\.(?:\d+\.){2,}\d+$/.test(eku) ||
      eku === '1.3.6.1.4.1.311.97.1.0' || eku.startsWith('1.3.6.1.4.1.311.97.1.3.') ||
      eku.startsWith('1.3.6.1.4.1.311.97.1.4.')) {
    throw new Error('SIGNING_PROFILE_EKU must be the specific Public Trust profile EKU, not a shared or Private Trust EKU.');
  }
  const forbidden = ['AZURE_CLIENT_SECRET', 'AZURE_CLIENT_CERTIFICATE_PATH', 'AZURE_USERNAME',
    'AZURE_PASSWORD', 'CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD'];
  if (forbidden.some(name => env[name])) throw new Error('This signing lane uses OIDC/Azure CLI only; remove alternate credential variables.');
  return {
    provider: 'artifact-signing',
    endpoint: endpoint.origin,
    account: env.SIGNING_ACCOUNT_NAME,
    profile: env.SIGNING_CERTIFICATE_PROFILE,
    publisher: env.SIGNING_PUBLISHER_SUBJECT,
    profileEku: eku,
    moduleVersion: MODULE_VERSION,
  };
}

function buildConfiguration(base, root, arch, env = process.env) {
  signingSettings(env);
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Signed builds require an explicit x64 or arm64 architecture.');
  if (base.build.nsis.useZip !== true || base.build.nsis.differentialPackage !== false) {
    throw new Error('Preserve the verified ZIP-based NSIS extraction configuration.');
  }
  const unsignedWin = { ...base.build.win };
  delete unsignedWin.signtoolOptions;
  delete unsignedWin.azureSignOptions;
  return {
    ...base.build,
    forceCodeSigning: true,
    directories: { ...base.build.directories, output: 'dist-signed' },
    win: {
      ...unsignedWin,
      signExecutable: true,
      artifactName: 'Hackathon-Facilitator-Setup-${version}-${arch}-signed.${ext}',
      signtoolOptions: {
        sign: path.resolve(root, 'signing', 'sign.cjs'),
        signingHashAlgorithms: ['sha256'],
      },
    },
  };
}

function classifyTarget(filename, root, arch, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !['x64', 'arm64'].includes(arch)) throw new Error('Invalid signed-build version or architecture.');
  const absolute = path.resolve(filename);
  const output = path.resolve(root, 'dist-signed');
  const rel = path.relative(output, absolute);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Signing target is outside the signed build output.');
  let cursor = path.parse(absolute).root;
  for (const part of path.relative(cursor, absolute).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Refusing a signing target redirected through a link.');
  }
  if (!fs.statSync(absolute).isFile()) throw new Error('Signing target must be a file.');
  const unpacked = arch === 'x64' ? 'win-unpacked' : 'win-arm64-unpacked';
  if (rel === path.join(unpacked, 'resources', 'backend', 'node', 'node.exe')) return 'upstream-node';
  if (rel === path.join(unpacked, 'Hackathon Facilitator.exe')) return 'owned';
  const stem = `Hackathon-Facilitator-Setup-${version}-${arch}-signed`;
  if ([`${stem}.exe`, `${stem}.__uninstaller.exe`].includes(rel)) return 'owned';
  throw new Error('Unexpected signing target; only the app, its installer/uninstaller and exact bundled Node are allowed.');
}

function assertUpstreamNode(filename, root) {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'payload', 'metadata.json'), 'utf8'));
  const digest = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(metadata.nodeSha256 || '') || metadata.nodeSha256 !== digest) {
    throw new Error('The third-party Node runtime differs from the verified payload; it will not be re-signed.');
  }
}

module.exports = { MODULE_VERSION, REQUIRED, signingSettings, buildConfiguration, classifyTarget, assertUpstreamNode };

if (require.main === module) {
  try {
    signingSettings();
    console.log('Signing configuration is complete. Identity, role assignment, environment approval and live signing still require validation.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
