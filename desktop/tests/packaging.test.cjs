'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../package.json');

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
