'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { storeConfig, manifest, validateDesktopInput, REQUIRED } = require('../store/config.cjs');
const valid = () => ({
  STORE_IDENTITY_CONFIRMED: 'true',
  STORE_IDENTITY_NAME: '12345.ExampleProduct',
  STORE_PUBLISHER: 'CN=00000000-0000-4000-8000-000000000001',
  STORE_PUBLISHER_DISPLAY_NAME: 'Example Publisher',
  STORE_DISPLAY_NAME: 'Example Product',
  STORE_PACKAGE_VERSION: '1.0.0.0',
});

test('no Store package identity is invented when the account or reservation is absent', () => {
  assert.throws(() => storeConfig({}), /not confirmed/);
  for (const key of REQUIRED) assert.throws(() => storeConfig({ ...valid(), [key]: '' }), /Missing Partner Center/);
  assert.throws(() => storeConfig({ ...valid(), STORE_IDENTITY_NAME: 'LocalValidation.HackathonFacilitator' }), /placeholder/);
  assert.throws(() => storeConfig({ ...valid(), STORE_PUBLISHER: 'CN=Daniel Horvath' }), /Partner Center publisher/);
});
test('submission CLI refuses missing identity before creating output', () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('STORE_')) delete env[key];
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'store', 'package.cjs')], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Store identity is not confirmed/);
});
test('validation-only identity remains explicitly separate from a real Store submission', () => {
  assert.throws(() => storeConfig({}, { validationOnly: true }), /disposable CI/);
  const c = storeConfig({ GITHUB_ACTIONS: 'true' }, { validationOnly: true });
  assert.equal(c.validationOnly, true);
  assert.equal(c.name, 'LocalValidation.HackathonFacilitator');
});
test('Store versions obey four-part Store rules and preserve reserved names exactly', () => {
  assert.equal(storeConfig(valid()).version, '1.0.0.0');
  for (const version of ['0.3.1.0', '1.0.0.1', '1.0.0', '1.65536.0.0', '01.0.0.0', '1.-1.0.0']) {
    assert.throws(() => storeConfig({ ...valid(), STORE_PACKAGE_VERSION: version }), /version/);
  }
  assert.throws(() => storeConfig({ ...valid(), STORE_DISPLAY_NAME: ' App ' }), /reserved Store/);
});
test('manifest uses only full-trust desktop capability and encoded reserved metadata', () => {
  const c = storeConfig({ ...valid(), STORE_DISPLAY_NAME: 'Example & Tools', STORE_PUBLISHER_DISPLAY_NAME: 'A & B' });
  const x = manifest(c, 'arm64');
  assert.match(x, /ProcessorArchitecture="arm64"/);
  assert.match(x, /Example &amp; Tools/);
  assert.match(x, /packagedClassicApp/);
  assert.match(x, /TrustLevel="mediumIL"/);
  assert.match(x, /runFullTrust/);
  assert.match(x, /Microsoft.VCLibs.140.00.UWPDesktop/);
  for (const forbidden of ['broadFileSystemAccess', 'allowElevation', 'startupTask', 'appExecutionAlias', 'rescap:Capability Name="unvirtualizedResources"']) {
    assert.ok(!x.includes(forbidden));
  }
  assert.throws(() => manifest(c, 'x86'), /reviewed/);
});
test('packaging refuses an installed profile, foreign architecture and extra databases', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-store-package-'));
  const write = (relative, content = 'fixture') => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  try {
    const pe = Buffer.alloc(128);
    pe.write('MZ');
    pe.writeUInt32LE(64, 60);
    pe.writeUInt32LE(0x4550, 64);
    pe.writeUInt16LE(0xaa64, 68);
    const hash = value => createHash('sha256').update(value).digest('hex');
    for (const f of ['resources/app.asar', 'resources/backend/server/server.js', 'resources/backend/template.db']) write(f);
    for (const f of ['Hackathon Facilitator.exe', 'resources/backend/node/node.exe',
      'resources/backend/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node']) write(f, pe);
    write('resources/backend/metadata.json', JSON.stringify({ arch: 'arm64', nodeSha256: hash(pe), templateSha256: hash('fixture') }));
    assert.equal(validateDesktopInput(root, 'arm64').length, 7);
    assert.throws(() => validateDesktopInput(root, 'x64'), /architecture/);
    const wrongPe = Buffer.from(pe);
    wrongPe.writeUInt16LE(0x8664, 68);
    write('Hackathon Facilitator.exe', wrongPe);
    assert.throws(() => validateDesktopInput(root, 'arm64'), /Native executable architecture/);
    write('Hackathon Facilitator.exe', pe);
    write('resources/backend/template.db', 'changed');
    assert.throws(() => validateDesktopInput(root, 'arm64'), /hash mismatch/);
    write('resources/backend/template.db');
    const database = write('resources/backend/customer.db');
    assert.throws(() => validateDesktopInput(root, 'arm64'), /synthetic template/);
    fs.unlinkSync(database);
    const env = write('.env', 'not a secret');
    assert.throws(() => validateDesktopInput(root, 'arm64'), /private file/);
    fs.unlinkSync(env);
    write('Uninstall Hackathon Facilitator.exe');
    assert.throws(() => validateDesktopInput(root, 'arm64'), /Installer/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Store logos have exact square dimensions and use PNG format', () => {
  for (const [file, size] of [['StoreLogo.png', 50], ['Square150x150Logo.png', 150], ['Square44x44Logo.png', 44]]) {
    const png = fs.readFileSync(path.join(__dirname, '..', 'store', 'assets', file));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
