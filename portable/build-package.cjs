'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { validatePayload } = require('../desktop/runtime.cjs');

const root = path.resolve(__dirname, '..');
const portableRoot = path.join(root, 'portable');
const desktop = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8'));
const version = desktop.version;
const folderName = `Hackathon-Facilitator-Full-Portable-${version}`;
const output = path.join(portableRoot, 'dist');
const staging = path.join(output, folderName);
const zip = path.join(output, `${folderName}.zip`);
const checksum = path.join(output, `hackathon-facilitator-full-portable-${version}.sha256`);

function sha256(filename) {
  return createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function copyFile(relative, destination = relative) {
  const source = path.join(portableRoot, relative);
  const target = path.join(staging, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

function files(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${absolute}`);
    if (entry.isDirectory()) return files(absolute, base);
    if (!entry.isFile()) throw new Error(`Unsupported package entry: ${absolute}`);
    return [path.relative(base, absolute).replaceAll('\\', '/')];
  });
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Build the portable ZIP on Windows.');
  if (fs.existsSync(output)) throw new Error('Use a clean portable/dist output directory.');
  fs.mkdirSync(staging, { recursive: true });

  for (const name of [
    'launcher.cjs',
    'Start-Hackathon-Facilitator.cmd',
    'Stop-Hackathon-Facilitator.cmd',
    'Backup-Hackathon-Workspace.cmd',
    'Open-Hackathon-Data-Folder.cmd',
    'README.txt',
  ]) copyFile(name);
  fs.mkdirSync(path.join(staging, 'lib'), { recursive: true });
  fs.copyFileSync(path.join(root, 'desktop', 'runtime.cjs'), path.join(staging, 'lib', 'runtime.cjs'), fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(root, 'desktop', 'policy.cjs'), path.join(staging, 'lib', 'policy.cjs'), fs.constants.COPYFILE_EXCL);

  const payloads = {};
  for (const arch of ['x64', 'arm64']) {
    const source = path.join(root, 'desktop', `payload-${arch}`);
    const payload = await validatePayload(source, arch);
    if (payload.metadata.appVersion !== version) throw new Error(`${arch} payload version does not match ${version}.`);
    if (sha256(payload.nodePath) !== payload.metadata.nodeSha256) throw new Error(`${arch} Node checksum mismatch.`);
    const destination = path.join(staging, 'runtime', arch);
    fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
    payloads[arch] = payload.metadata;
  }

  fs.writeFileSync(path.join(staging, 'package-info.json'), `${JSON.stringify({
    name: 'Hackathon Facilitator Full Portable',
    distribution: 'portable-browser-local',
    appVersion: version,
    architectures: ['x64', 'arm64'],
    payloads,
    createdAt: new Date().toISOString(),
    signedInstaller: false,
    nodeExecutablesRetainUpstreamSignatures: true,
  }, null, 2)}\n`, { flag: 'wx' });

  const manifestEntries = files(staging).map(relative => ({
    path: relative,
    sha256: sha256(path.join(staging, relative)),
  }));
  fs.writeFileSync(path.join(staging, 'checksums.json'), `${JSON.stringify({
    algorithm: 'SHA-256',
    files: manifestEntries,
  }, null, 2)}\n`, { flag: 'wx' });

  const archive = spawnSync('tar.exe', ['-a', '-c', '-f', path.basename(zip), folderName], {
    cwd: output,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (archive.error) throw archive.error;
  if (archive.status !== 0) throw new Error(`tar.exe failed with exit ${archive.status}.`);
  const digest = sha256(zip);
  fs.writeFileSync(checksum, `${digest}  ${path.basename(zip)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    file: path.basename(zip),
    bytes: fs.statSync(zip).size,
    sha256: digest,
    appVersion: version,
    architectures: ['x64', 'arm64'],
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
