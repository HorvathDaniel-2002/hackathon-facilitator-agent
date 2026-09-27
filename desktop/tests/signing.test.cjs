'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { REQUIRED, signingSettings, buildConfiguration, classifyTarget, assertUpstreamNode } = require('../signing/config.cjs');
const base = require('../package.json');
const valid = () => ({
  SIGNING_ENABLED: 'true',
  AZURE_TENANT_ID: '00000000-0000-4000-8000-000000000001',
  AZURE_CLIENT_ID: '00000000-0000-4000-8000-000000000002',
  AZURE_SUBSCRIPTION_ID: '00000000-0000-4000-8000-000000000003',
  SIGNING_ENDPOINT: 'https://weu.codesigning.azure.net',
  SIGNING_ACCOUNT_NAME: 'example-signing-account',
  SIGNING_CERTIFICATE_PROFILE: 'example-public-profile',
  SIGNING_PUBLISHER_SUBJECT: 'CN=Example Publisher, O=Example Publisher, C=US',
  SIGNING_PROFILE_EKU: '1.3.6.1.4.1.311.97.1234.5678.9012',
});
const personal = () => ({
  SIGNING_ENABLED: 'true',
  SIGNING_PROVIDER: 'certificate-store',
  SIGNING_CERTIFICATE_SHA1: 'A'.repeat(40),
  SIGNING_CERTIFICATE_ISSUER: 'CN=Example Public CA, O=Example CA, C=US',
  SIGNING_PUBLISHER_SUBJECT: 'CN=Example Developer, C=HU',
  SIGNING_TIMESTAMP_URL: 'https://timestamp.example-ca.com/',
  SIGNING_SIGNTOOL_PATH: 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe',
});
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hf-signing-test-'));

test('signing never defaults to enabled or silently uses the unsigned build', () => {
  assert.throws(() => signingSettings({}), /not enabled/);
  assert.throws(() => signingSettings({ ...valid(), SIGNING_ENABLED: 'false' }), /not enabled/);
  for (const name of REQUIRED) assert.throws(() => signingSettings({ ...valid(), [name]: '' }), /Missing signing/);
});
test('signing accepts a configured approved regional endpoint and Public Trust identity', () => {
  const result = signingSettings(valid());
  assert.equal(result.endpoint, 'https://weu.codesigning.azure.net');
  assert.equal(result.moduleVersion, '0.1.20');
});
test('signing rejects arbitrary endpoints, paths, credentials and control characters', () => {
  for (const endpoint of ['http://weu.codesigning.azure.net', 'https://weu.codesigning.azure.net.evil.example',
    'https://codesigning.azure.net', 'https://weu.codesigning.azure.net:444', 'https://a:b@weu.codesigning.azure.net',
    'https://weu.codesigning.azure.net/extra', 'https://weu.codesigning.azure.net/?x=y']) {
    assert.throws(() => signingSettings({ ...valid(), SIGNING_ENDPOINT: endpoint }), /endpoint|service URL/);
  }
  assert.throws(() => signingSettings({ ...valid(), SIGNING_ACCOUNT_NAME: "bad';cmd" }), /resource name/);
  assert.throws(() => signingSettings({ ...valid(), SIGNING_PUBLISHER_SUBJECT: "CN=Test\npublisher=other" }), /certificate subject/);
  assert.throws(() => signingSettings({ ...valid(), AZURE_CLIENT_ID: 'placeholder' }), /UUID/);
});
test('private trust and alternate credentials cannot substitute for the approved publisher', () => {
  for (const eku of ['1.3.6.1.4.1.311.97.1.0', '1.3.6.1.4.1.311.97.1.3.1.111',
    '1.3.6.1.4.1.311.97.1.4.1.111', '1.3.6.1.5.5.7.3.3']) {
    assert.throws(() => signingSettings({ ...valid(), SIGNING_PROFILE_EKU: eku }), /Public Trust/);
  }
  for (const key of ['AZURE_CLIENT_SECRET', 'CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'AZURE_PASSWORD']) {
    assert.throws(() => signingSettings({ ...valid(), [key]: 'synthetic-not-a-secret' }), /OIDC/);
  }
});
test('CA certificate-store signing does not require an Azure tenant or Artifact Signing profile', () => {
  const result = signingSettings(personal());
  assert.equal(result.provider, 'certificate-store');
  assert.equal(result.certificateSha1, 'A'.repeat(40));
  assert.equal(result.publisher, 'CN=Example Developer, C=HU');
  assert.equal(result.profileEku, undefined);
  assert.equal(result.endpoint, undefined);
  const configuration = buildConfiguration(base, __dirname, 'arm64', personal());
  assert.equal(configuration.forceCodeSigning, true);
  assert.equal(configuration.win.signExecutable, true);
  assert.deepEqual(configuration.win.signtoolOptions.signingHashAlgorithms, ['sha256']);
});
test('certificate-store configuration requires exact identity and local official tool selection', () => {
  for (const key of ['SIGNING_CERTIFICATE_SHA1', 'SIGNING_CERTIFICATE_ISSUER',
    'SIGNING_PUBLISHER_SUBJECT', 'SIGNING_TIMESTAMP_URL', 'SIGNING_SIGNTOOL_PATH']) {
    assert.throws(() => signingSettings({ ...personal(), [key]: '' }), /Missing signing/);
  }
  assert.throws(() => signingSettings({ ...personal(), SIGNING_PROVIDER: 'anything' }), /Unknown signing/);
  assert.throws(() => signingSettings({ ...personal(), SIGNING_CERTIFICATE_SHA1: 'all certificates' }), /thumbprint/);
  assert.throws(() => signingSettings({ ...personal(), SIGNING_CERTIFICATE_ISSUER: personal().SIGNING_PUBLISHER_SUBJECT }), /self-issued/);
  assert.throws(() => signingSettings({ ...personal(), SIGNING_CERTIFICATE_ISSUER: 'CN=CA\ncommand' }), /distinguished name/);
  for (const tool of ['signtool.exe', 'C:\\tools\\fake.exe', '\\\\host\\share\\signtool.exe']) {
    assert.throws(() => signingSettings({ ...personal(), SIGNING_SIGNTOOL_PATH: tool }), /local Windows SDK/);
  }
  for (const url of ['https://user:pass@timestamp.example.test', 'file:///C:/clock', 'http://127.0.0.1',
    'http://signing.internal', 'https://timestamp.example-ca.com/?token=x']) {
    assert.throws(() => signingSettings({ ...personal(), SIGNING_TIMESTAMP_URL: url }), /timestamp/);
  }
  assert.throws(() => signingSettings({ ...personal(), SIGNING_TOKEN_PIN: 'not-a-real-pin' }), /PIN/);
  assert.throws(() => signingSettings({ ...personal(), CSC_LINK: 'not-a-pfx' }), /PFX/);
});
test('signed config preserves unsigned preview and ARM64 extraction fix without reusing output', () => {
  const before = JSON.stringify(base);
  const config = buildConfiguration(base, __dirname, 'arm64', valid());
  assert.equal(JSON.stringify(base), before);
  assert.equal(base.build.win.signExecutable, false);
  assert.equal(config.win.signExecutable, true);
  assert.equal(config.forceCodeSigning, true);
  assert.equal(config.directories.output, 'dist-signed');
  assert.ok(config.win.artifactName.includes('-signed.'));
  assert.deepEqual(config.win.signtoolOptions.signingHashAlgorithms, ['sha256']);
  assert.equal(config.nsis.useZip, true);
  assert.equal(config.nsis.differentialPackage, false);
  assert.throws(() => buildConfiguration(base, __dirname, 'ia32', valid()), /architecture/);
});
test('signing target allowlist rejects arbitrary files, escape paths and third-party replacement', () => {
  const root = temp();
  try {
    const write = relative => {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'synthetic PE fixture - not executable');
      return file;
    };
    for (const arch of ['x64', 'arm64']) {
      const unpacked = arch === 'x64' ? 'win-unpacked' : 'win-arm64-unpacked';
      const exe = write(`dist-signed/${unpacked}/Hackathon Facilitator.exe`);
      const setup = write(`dist-signed/Hackathon-Facilitator-Setup-${base.version}-${arch}-signed.exe`);
      const uninstall = write(`dist-signed/Hackathon-Facilitator-Setup-${base.version}-${arch}-signed.__uninstaller.exe`);
      assert.equal(classifyTarget(exe, root, arch, base.version), 'owned');
      assert.equal(classifyTarget(setup, root, arch, base.version), 'owned');
      assert.equal(classifyTarget(uninstall, root, arch, base.version), 'owned');
      const node = write(`dist-signed/${unpacked}/resources/backend/node/node.exe`);
      assert.equal(classifyTarget(node, root, arch, base.version), 'upstream-node');
      fs.mkdirSync(path.join(root, 'payload'), { recursive: true });
      fs.writeFileSync(path.join(root, 'payload', 'metadata.json'), JSON.stringify({
        nodeSha256: createHash('sha256').update(fs.readFileSync(node)).digest('hex'),
      }));
      assert.doesNotThrow(() => assertUpstreamNode(node, root));
      fs.appendFileSync(node, 'changed');
      assert.throws(() => assertUpstreamNode(node, root), /differs/);
    }
    assert.throws(() => classifyTarget(write('outside.exe'), root, 'x64', base.version), /outside/);
    assert.throws(() => classifyTarget(write('dist-signed/unknown.exe'), root, 'x64', base.version), /Unexpected/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('missing signing configuration fails before any tooling or network activity', () => {
  const env = { ...process.env, SIGNING_ENABLED: '' };
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'signing', 'config.cjs')], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not enabled/);
});
test('PowerShell verifier rejects unsigned/wrong-publisher/missing-timestamp signatures', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'signing-verification.ps1')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
