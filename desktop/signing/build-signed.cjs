'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { signingSettings, buildConfiguration } = require('./config.cjs');

function main() {
  const root = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--arch') throw new Error('Usage: node signing/build-signed.cjs --arch <x64|arm64>');
  const arch = args[1];
  const settings = signingSettings();
  if (process.platform !== 'win32' ||
      (settings.provider === 'artifact-signing' && process.arch !== 'x64')) {
    throw new Error('Signing requires Windows; Artifact Signing additionally requires an x64 signing runner.');
  }
  if (settings.provider === 'certificate-store') {
    const preflight = spawnSync('pwsh.exe', ['-NoProfile', '-File',
      path.join(__dirname, 'sign-certificate.ps1'), '-CheckOnly'], {
      cwd: root, env: process.env, stdio: 'inherit', windowsHide: true, timeout: 120000,
    });
    if (preflight.error) throw preflight.error;
    if (preflight.status !== 0) throw new Error('Certificate-store signing prerequisites are not ready. No build was started.');
  }
  const base = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = buildConfiguration(base, root, arch);
  const payload = JSON.parse(fs.readFileSync(path.join(root, 'payload', 'metadata.json'), 'utf8'));
  if (payload.arch !== arch || payload.appVersion !== base.version) throw new Error('Payload version/architecture does not match this signed build.');
  if (fs.existsSync(path.join(root, 'dist-signed'))) throw new Error('Signed output already exists; use a clean runner, never mix old and newly signed files.');
  fs.mkdirSync(path.join(root, '.build'), { recursive: true });
  const filename = path.join(root, '.build', 'signed-builder.json');
  fs.writeFileSync(filename, JSON.stringify(config, null, 2));
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'),
    '--win', 'nsis', `--${arch}`, '--publish', 'never', '--config', filename,
  ], {
    cwd: root, env: { ...process.env, HF_SIGNING_ARCH: arch, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Signed installer build failed. No unsigned replacement was produced.');
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
