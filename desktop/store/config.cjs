'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const REQUIRED = ['STORE_IDENTITY_NAME', 'STORE_PUBLISHER', 'STORE_PUBLISHER_DISPLAY_NAME', 'STORE_DISPLAY_NAME', 'STORE_PACKAGE_VERSION'];
const TEST_IDENTITY = {
  name: 'LocalValidation.HackathonFacilitator',
  publisher: 'CN=Local Packaging Validation',
  publisherDisplayName: 'Local validation only',
  displayName: 'Hackathon Facilitator - Validation only',
  version: '1.0.0.0',
  validationOnly: true,
};
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function storeConfig(env = process.env, { validationOnly = false } = {}) {
  if (validationOnly) {
    if (env.GITHUB_ACTIONS !== 'true') throw new Error('Validation identity is only for disposable CI; it is not a Store product identity.');
    return { ...TEST_IDENTITY };
  }
  if (env.STORE_IDENTITY_CONFIRMED !== 'true') {
    throw new Error('Store identity is not confirmed. Create the Partner Center product and copy its exact identity fields; no package was created.');
  }
  const missing = REQUIRED.filter(name => typeof env[name] !== 'string' || !env[name].trim());
  if (missing.length) throw new Error(`Missing Partner Center values: ${missing.join(', ')}.`);
  const name = env.STORE_IDENTITY_NAME;
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{2,49}$/.test(name) || /LocalValidation|placeholder|your[-.]?app/i.test(name)) {
    throw new Error('STORE_IDENTITY_NAME must be the exact Partner Center Package/Identity/Name, not a placeholder.');
  }
  if (!/^CN=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.STORE_PUBLISHER)) {
    throw new Error('STORE_PUBLISHER must be the exact Partner Center publisher identity (CN=<publisher UUID>).');
  }
  for (const key of ['STORE_PUBLISHER_DISPLAY_NAME', 'STORE_DISPLAY_NAME']) {
    if (/[\x00-\x1f\x7f]/.test(env[key]) || env[key].length > 100 || env[key] !== env[key].trim()) {
      throw new Error(`${key} must match the reserved Store value without control characters or padding.`);
    }
  }
  const version = env.STORE_PACKAGE_VERSION;
  if (!/^\d+\.\d+\.\d+\.0$/.test(version) || version.split('.').some(n => Number(n) > 65535) ||
      Number(version.split('.')[0]) === 0 || version.split('.').some(n => n.length > 1 && n.startsWith('0'))) {
    throw new Error('Store package version must have four integers, a nonzero major and a final .0, for example 1.0.0.0.');
  }
  return {
    name, publisher: env.STORE_PUBLISHER, publisherDisplayName: env.STORE_PUBLISHER_DISPLAY_NAME,
    displayName: env.STORE_DISPLAY_NAME, version, validationOnly: false,
  };
}

function manifest(config, arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('MSIX supports only the reviewed x64 and ARM64 payloads.');
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap uap10 rescap">
 <Identity Name="${xml(config.name)}" Publisher="${xml(config.publisher)}" Version="${xml(config.version)}" ProcessorArchitecture="${arch}" />
 <Properties>
  <DisplayName>${xml(config.displayName)}</DisplayName>
  <PublisherDisplayName>${xml(config.publisherDisplayName)}</PublisherDisplayName>
  <Description>Kanban-first local hackathon planning with shared handoffs and mock AI.</Description>
  <Logo>Assets\\StoreLogo.png</Logo>
 </Properties>
 <Resources><Resource Language="en-US" /></Resources>
 <Dependencies>
  <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  <PackageDependency Name="Microsoft.VCLibs.140.00.UWPDesktop" MinVersion="14.0.27323.0" Publisher="CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US" />
 </Dependencies>
 <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
 <Applications>
  <Application Id="App" Executable="app\\Hackathon Facilitator.exe" uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
   <uap:VisualElements DisplayName="${xml(config.displayName)}" Description="Local Kanban workspace, readiness evidence and accountable follow-up"
    Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" BackgroundColor="#1559b7" />
  </Application>
 </Applications>
</Package>
`;
}

function validateDesktopInput(directory, arch) {
  const base = path.resolve(directory);
  const stat = fs.lstatSync(base);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Use a normal unpacked desktop build folder.');
  const metadata = JSON.parse(fs.readFileSync(path.join(base, 'resources', 'backend', 'metadata.json'), 'utf8'));
  if (metadata.arch !== arch) throw new Error('MSIX architecture does not match its backend payload.');
  for (const file of ['Hackathon Facilitator.exe', 'resources/app.asar', 'resources/backend/server/server.js',
    'resources/backend/node/node.exe', 'resources/backend/template.db']) {
    if (!fs.statSync(path.join(base, ...file.split('/'))).isFile()) throw new Error('Desktop build is incomplete.');
  }
  for (const [relative, expected] of [['node/node.exe', metadata.nodeSha256], ['template.db', metadata.templateSha256]]) {
    const actual = createHash('sha256').update(fs.readFileSync(path.join(base, 'resources', 'backend', relative))).digest('hex');
    if (actual !== expected) throw new Error(`Payload hash mismatch: ${relative}`);
  }
  const files = [];
  let nativeSqliteFound = false;
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error('MSIX inputs must not contain symbolic links or junctions.');
      const relative = path.relative(base, full).split(path.sep).join('/');
      if (item.isDirectory()) walk(full);
      else if (item.isFile()) {
        if (!/^[\x20-\x7e]+$/.test(relative)) throw new Error(`Use ASCII package paths: ${relative}`);
        if (/(?:^|\/)(?:\.env(?:\.|$)|\.git(?:\/|$)|\.artifacts(?:\/|$)|Uninstall |elevate\.exe$)/i.test(relative)) {
          throw new Error(`Installer/private file must not enter MSIX: ${relative}`);
        }
        if (/\.db(?:$|-)/i.test(relative) && relative !== 'resources/backend/template.db') {
          throw new Error('Only the isolated synthetic template database may be packaged.');
        }
        if (/\.(exe|dll|node)$/i.test(relative)) {
          const fd = fs.openSync(full, 'r');
          try {
            const dos = Buffer.alloc(64), pe = Buffer.alloc(6);
            if (fs.readSync(fd, dos, 0, 64, 0) !== 64 || dos.toString('ascii', 0, 2) !== 'MZ' ||
                fs.readSync(fd, pe, 0, 6, dos.readUInt32LE(60)) !== 6 ||
                pe.readUInt32LE(0) !== 0x4550 || pe.readUInt16LE(4) !== (arch === 'arm64' ? 0xaa64 : 0x8664)) {
              throw new Error(`Native executable architecture does not match ${arch}: ${relative}`);
            }
          } finally { fs.closeSync(fd); }
          if (item.name === 'better_sqlite3.node') nativeSqliteFound = true;
        }
        files.push({ source: full, relative });
      }
    }
  }
  walk(base);
  if (!nativeSqliteFound) throw new Error('Matching native SQLite runtime is missing.');
  return files;
}

module.exports = { REQUIRED, TEST_IDENTITY, storeConfig, manifest, validateDesktopInput };
if (require.main === module) {
  try {
    const config = storeConfig();
    console.log(JSON.stringify({ identityConfigured: true, name: config.name, version: config.version,
      notice: 'Local format checks do not prove that Partner Center issued these values or accepted the app.' }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
