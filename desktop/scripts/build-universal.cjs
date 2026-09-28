'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { validatePayload } = require('../runtime.cjs');

function universalConfiguration(base) {
  return {
    ...base.build,
    directories: { ...base.build.directories, output: 'dist-oneclick' },
    extraResources: [{ from: 'payload-${arch}', to: 'backend' }],
    nsis: {
      ...base.build.nsis,
      packElevateHelper: false,
      artifactName: 'Hackathon-Facilitator-Setup-${version}.${ext}',
    },
  };
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Build the universal Windows installer on Windows.');
  const root = path.resolve(__dirname, '..');
  const base = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = universalConfiguration(base);
  for (const arch of ['x64', 'arm64']) {
    const directory = path.join(root, `payload-${arch}`);
    const payload = await validatePayload(directory, arch);
    if (payload.metadata.appVersion !== base.version) throw new Error(`${arch} payload version does not match the installer.`);
    for (const [filename, expected] of [[payload.templatePath, payload.metadata.templateSha256],
      [payload.nodePath, payload.metadata.nodeSha256]]) {
      if (createHash('sha256').update(fs.readFileSync(filename)).digest('hex') !== expected) {
        throw new Error(`${arch} payload hash mismatch: ${path.basename(filename)}`);
      }
    }
  }
  if (fs.existsSync(path.join(root, 'dist-oneclick'))) throw new Error('Use a clean output directory, not an existing release build.');
  fs.mkdirSync(path.join(root, '.build'), { recursive: true });
  const configPath = path.join(root, '.build', 'oneclick-builder.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'),
    '--win', 'nsis', '--x64', '--arm64', '--publish', 'never', '--config', configPath,
  ], { cwd: root, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Universal installer build failed.');
  const name = `Hackathon-Facilitator-Setup-${base.version}.exe`;
  const digest = createHash('sha256').update(fs.readFileSync(path.join(root, 'dist-oneclick', name))).digest('hex');
  fs.writeFileSync(path.join(root, 'dist-oneclick', `hackathon-facilitator-${base.version}.sha256`), `${digest}  ${name}\n`);
  console.log(JSON.stringify({ file: name, sha256: digest, architectures: ['x64', 'arm64'], signed: false }));
}
module.exports = { universalConfiguration };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
