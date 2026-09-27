'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { storeConfig, manifest, validateDesktopInput } = require('./config.cjs');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const options = { validationOnly: false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--validation-only') options.validationOnly = true;
  else if (['--arch', '--input', '--output'].includes(args[i]) && args[i + 1]) {
    const key = args[i].slice(2);
    options[key] = args[++i];
  }
  else throw new Error('Usage: node store/package.cjs --arch <x64|arm64> --input <unpacked app> --output <new folder> [--validation-only]');
}

function main() {
  const config = storeConfig(process.env, options);
  if (process.platform !== 'win32') throw new Error('Microsoft MakeAppx packaging requires Windows.');
  if (!['x64', 'arm64'].includes(options.arch) || !options.input || !options.output) throw new Error('Explicit architecture, input and new output are required.');
  const output = path.resolve(options.output);
  if (fs.existsSync(output)) throw new Error('Use a new output directory; never replace a Store submission package in place.');
  const input = path.resolve(options.input);
  if (output === input || input.startsWith(`${output}${path.sep}`) || output.startsWith(`${input}${path.sep}`)) {
    throw new Error('Input and output directories must be separate, not nested.');
  }
  const files = validateDesktopInput(input, options.arch);
  fs.mkdirSync(output, { recursive: true });
  const stage = path.join(output, 'content');
  for (const file of files) {
    const target = path.join(stage, 'app', ...file.relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.source, target, fs.constants.COPYFILE_EXCL);
  }
  for (const file of ['StoreLogo.png', 'Square150x150Logo.png', 'Square44x44Logo.png']) {
    const target = path.join(stage, 'Assets', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, 'store', 'assets', file), target, fs.constants.COPYFILE_EXCL);
  }
  fs.writeFileSync(path.join(stage, 'AppxManifest.xml'), manifest(config, options.arch));
  const name = `${config.validationOnly ? 'VALIDATION-ONLY' : 'Hackathon-Facilitator-Store'}-${config.version}-${options.arch}.msix`;
  const packageFile = path.join(output, name);
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'make-msix.ps1'), '-InputDirectory', stage, '-PackagePath', packageFile],
  { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('MakeAppx validation failed. Do not submit or distribute this output.');
  const sha256 = createHash('sha256').update(fs.readFileSync(packageFile)).digest('hex');
  const record = {
    version: config.version, arch: options.arch, identityName: config.name,
    validationOnly: config.validationOnly, unsigned: true, storeSubmitted: false, storeAccepted: false,
    sha256, inputFiles: files.length, packageName: name,
    capabilities: ['runFullTrust'],
    notice: config.validationOnly ? 'Test identity; never submit or install as a public release.' :
      'For Partner Center submission only. It is not a signed standalone installer; Store certification is still required.',
  };
  fs.writeFileSync(path.join(output, 'package-report.json'), JSON.stringify(record, null, 2) + '\n');
  fs.writeFileSync(`${packageFile}.sha256`, `${sha256}  ${name}\n`);
  console.log(JSON.stringify(record, null, 2));
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
