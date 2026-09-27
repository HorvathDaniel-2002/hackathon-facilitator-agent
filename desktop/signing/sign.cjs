'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { signingSettings, classifyTarget, assertUpstreamNode } = require('./config.cjs');

module.exports = async function sign(configuration) {
  const settings = signingSettings();
  if (process.platform !== 'win32' || configuration.hash !== 'sha256') {
    throw new Error('Signing requires Windows and SHA-256. No unsigned fallback is allowed.');
  }
  const root = path.resolve(__dirname, '..');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const kind = classifyTarget(configuration.path, root, process.env.HF_SIGNING_ARCH, version);
  if (kind === 'upstream-node') assertUpstreamNode(configuration.path, root);
  const command = kind === 'upstream-node' ? 'verify-signature.ps1' :
    settings.provider === 'certificate-store' ? 'sign-certificate.ps1' : 'sign-file.ps1';
  const args = ['-NoProfile', ...(settings.provider === 'artifact-signing' ? ['-NonInteractive'] : []),
    '-File', path.join(__dirname, command), '-FilePath', configuration.path];
  if (kind === 'upstream-node') args.push('-UpstreamNode');
  const result = spawnSync('pwsh.exe', args, {
    cwd: root, env: process.env, stdio: 'inherit', windowsHide: true, timeout: 180000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Trusted signing/signature verification failed. This artifact must not be published as signed.');
  fs.appendFileSync(path.join(root, 'dist-signed', 'signing-receipts.jsonl'), JSON.stringify({
    file: path.relative(path.join(root, 'dist-signed'), configuration.path).split(path.sep).join('/'),
    result: kind === 'upstream-node' ? 'preserved-upstream-signature' : 'publisher-and-timestamp-verified',
    sha256: createHash('sha256').update(fs.readFileSync(configuration.path)).digest('hex'),
  }) + '\n');
};
