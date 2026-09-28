'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../package.json');
const { universalConfiguration } = require('../scripts/build-universal.cjs');

test('NSIS uses ZIP without differential 7z filters so ARM64 binaries are extracted', () => {
  assert.equal(config.build.nsis.useZip, true);
  assert.equal(config.build.nsis.differentialPackage, false);
});
test('desktop installation remains per-user, data-preserving and explicitly unsigned', () => {
  assert.equal(config.build.nsis.perMachine, false);
  assert.equal(config.build.nsis.allowElevation, false);
  assert.equal(config.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.build.nsis.createStartMenuShortcut, true);
  assert.equal(config.build.nsis.createDesktopShortcut, true);
  assert.equal(config.build.nsis.runAfterFinish, true);
  assert.equal(config.build.win.signExecutable, false);
});
test('one-click installation has no directory wizard and still starts the full app', () => {
  assert.equal(config.build.nsis.oneClick, true);
  assert.equal(config.build.nsis.allowToChangeInstallationDirectory, false);
  assert.equal(config.build.nsis.runAfterFinish, true);
  assert.equal(config.build.appId, 'com.danielhorvath.hackathonfacilitator');
  assert.equal(config.productName, 'Hackathon Facilitator');
});
test('one offline installer embeds both native payloads without changing app files or identity', () => {
  const universal = universalConfiguration(config);
  assert.equal(universal.nsis.artifactName, 'Hackathon-Facilitator-Setup-${version}.${ext}');
  assert.equal(universal.extraResources[0].from, 'payload-${arch}');
  assert.equal(universal.extraResources[0].to, 'backend');
  assert.equal(universal.nsis.packElevateHelper, false);
  assert.equal(universal.directories.output, 'dist-oneclick');
  assert.deepEqual(universal.files, config.build.files);
  assert.equal(universal.appId, config.build.appId);
  assert.equal(universal.nsis.useZip, true);
  assert.equal(universal.nsis.deleteAppDataOnUninstall, false);
});
