'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows') {
  throw new Error('This modifying installer test is restricted to disposable Windows CI runners.');
}
const { _electron: electron, expect } = require('../e2e-harness/node_modules/@playwright/test');
const [phase, directory, expectedVersion = '0.3.0'] = process.argv.slice(2);
if (!['first', 'reinstalled'].includes(phase) || !path.isAbsolute(directory || '')) {
  throw new Error('Usage: node e2e-installed.cjs <first|reinstalled> <absolute CI test directory>');
}
const qa = path.resolve(directory);
const relative = path.relative(path.resolve(process.env.RUNNER_TEMP), qa);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Test output must be inside RUNNER_TEMP.');
const executablePath = path.join(qa, 'installed', 'Hackathon Facilitator.exe');
const stateFile = path.join(qa, 'workflow-state.json');
const reportPath = path.join(qa, `desktop-${phase}.json`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let instance;
let page;
let mainWindowId;
const errors = [];
const checks = [];
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const requireCheck = (name, condition) => {
  if (!condition) throw new Error(name);
  checks.push(name);
};

async function launch() {
  instance = await electron.launch({ executablePath, env, timeout: 120000 });
  page = await instance.firstWindow({ timeout: 120000 });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForURL(/\/usecases$/, { timeout: 120000 });
  await expect(page.getByRole('heading', { name: 'Use case board', exact: true })).toBeVisible();
  await expect(page.getByText('Local desktop preview.', { exact: true })).toBeVisible();
  const details = await instance.evaluate(({ app, BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const prefs = w.webContents.getLastWebPreferences();
    return {
      userData: app.getPath('userData'), version: app.getVersion(), mainPid: process.pid, windowId: w.id,
      sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation,
      nodeIntegration: prefs.nodeIntegration, windowCount: BrowserWindow.getAllWindows().length,
    };
  });
  mainWindowId = details.windowId;
  requireCheck('packaged renderer isolation', details.sandbox && details.contextIsolation && !details.nodeIntegration);
  requireCheck('installed version', details.version === expectedVersion);
  const expectedProfile = path.join(process.env.APPDATA, 'Hackathon Facilitator');
  requireCheck('per-user data location', details.userData.toLowerCase() === expectedProfile.toLowerCase());
  const origin = new URL(page.url()).origin;
  requireCheck('anonymous backend access denied', (await fetch(`${origin}/api/desktop-health`)).status === 403);
  const children = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `@(Get-CimInstance Win32_Process -Filter "ParentProcessId=${details.mainPid}" | Select-Object -ExpandProperty ExecutablePath) | ConvertTo-Json -Compress`],
  { encoding: 'utf8' }) || '[]');
  const images = Array.isArray(children) ? children : [children];
  const bundledNode = path.join(qa, 'installed', 'resources', 'backend', 'node', 'node.exe');
  fs.writeFileSync(path.join(qa, `runtime-images-${phase}.json`), JSON.stringify({
    images, bundledNode, launcherPid: instance.process().pid, electronPid: details.mainPid,
  }, null, 2));
  const canonical = file => fs.realpathSync.native(file).toLowerCase();
  requireCheck('backend uses bundled Node rather than a system Node installation', images.some(image =>
    image && fs.existsSync(image) && canonical(image) === canonical(bundledNode)));
  return { origin, profile: details.userData };
}

async function quit(origin) {
  await instance.close();
  instance = undefined;
  await expect.poll(async () => {
    try { await fetch(`${origin}/api/desktop-health`, { signal: AbortSignal.timeout(1000) }); return false; }
    catch { return true; }
  }, { timeout: 15000 }).toBe(true);
  checks.push('Quit stops the owned backend');
}

(async () => {
  const { origin, profile } = await launch();
  if (phase === 'reinstalled') {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    await page.goto(origin + saved.caseUrl);
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByLabel('Next action', { exact: true })).toHaveValue(saved.nextAction);
    await expect(drawer.getByLabel(/^CAF submission reference\s*\*?$/)).toHaveValue('CI-CAF-REFERENCE');
    await expect(drawer.getByLabel('Progress stage', { exact: true })).toHaveValue('InProduction');
    checks.push('saved workflow survives reinstall and relaunch');
    await quit(origin);
  } else {
    await expect(page.getByRole('article')).toHaveCount(6);
    checks.push('first launch contains only the six fictional seed cases');
    await page.goto(`${origin}/hackathons/new`);
    await page.getByLabel(/^Hackathon name\s*\*?$/).fill('CI desktop workflow');
    await page.getByLabel(/^Customer\s*\*?$/).fill('Synthetic test organization');
    await page.getByRole('button', { name: 'Create hackathon', exact: true }).click();
    await page.waitForURL(/\/usecases$/);
    const workspaceUrl = new URL(page.url()).pathname.replace(/\/usecases$/, '');
    await page.goto(origin + workspaceUrl + '/usecases/new');
    await page.getByLabel(/^Title\s*\*?$/).fill('Synthetic policy assistant');
    await page.getByLabel('Business owner', { exact: true }).fill('CI process owner');
    await page.getByLabel('Description', { exact: true }).fill('Read-only assistant for an invented policy library.');
    await page.getByLabel('Data sources', { exact: true }).fill('Synthetic policy documents only.');
    await page.getByRole('button', { name: 'Create use case', exact: true }).click();
    await page.waitForURL(/\/usecases\/(?!new$)[^/]+$/);
    const caseId = new URL(page.url()).pathname.split('/').at(-1);
    await page.getByRole('button', { name: 'Run evaluator', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Re-evaluate', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Generate guide', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Regenerate', exact: true })).toBeVisible({ timeout: 90000 });
    checks.push('installed app creates and evaluates a case and saves a mock build guide');

    await page.goto(origin + workspaceUrl + '/usecases');
    await page.getByLabel('Group by', { exact: true }).selectOption('route');
    await page.getByRole('button', { name: /^Open handoff for UC-01:/ }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel('Progress stage', { exact: true }).selectOption('InProduction');
    await drawer.getByRole('button', { name: 'Save exit package', exact: true }).click();
    await expect(drawer.getByRole('alert')).toContainText(/evidence|reference/i);
    await drawer.getByLabel(/^Production evidence \/ reference\s*\*?$/).fill('CI-PRODUCTION-REFERENCE: fictional test only');
    await drawer.getByLabel('Delivery route', { exact: true }).selectOption('CAF');
    await drawer.getByLabel('CAF submission status', { exact: true }).selectOption('Submitted');
    await drawer.getByRole('button', { name: 'Save exit package', exact: true }).click();
    await expect(drawer.getByRole('alert')).toContainText(/CAF submission reference/i);
    await drawer.getByLabel(/^CAF submission reference\s*\*?$/).fill('CI-CAF-REFERENCE');
    const nextAction = 'Review synthetic pilot scope after reinstall';
    await drawer.getByLabel('Next action', { exact: true }).fill(nextAction);
    await drawer.getByLabel('Next action date', { exact: true }).fill('2027-10-12');
    await drawer.getByRole('button', { name: 'Save exit package', exact: true }).click();
    await expect(drawer.getByText('Exit package saved.', { exact: true })).toBeVisible();
    await drawer.getByRole('link', { name: 'Handoff overview', exact: true }).click();
    await expect(drawer.getByLabel('Next action', { exact: true })).toHaveValue(nextAction);
    checks.push('production and CAF evidence guards plus shared handoff synchronization');
    fs.writeFileSync(stateFile, JSON.stringify({ caseUrl: `${workspaceUrl}/usecases?case=${caseId}`, nextAction }, null, 2));

    await page.goto(origin + workspaceUrl + '/runbook');
    const check = page.locator('details').filter({ hasText: 'Sample data and knowledge permissions verified' });
    await check.locator('summary').click();
    await check.getByLabel('Accountable owner', { exact: true }).fill('CI data owner');
    await check.getByLabel('Evidence, decision reference or blocker', { exact: true }).fill('Fictional evidence is pending, not approved.');
    await check.getByLabel('Status', { exact: true }).selectOption('Blocked');
    await check.getByRole('button', { name: 'Save check', exact: true }).click();
    await expect(check.getByText('Saved.', { exact: true })).toBeVisible();
    await page.reload();
    await check.locator('summary').click();
    await expect(check.getByLabel('Status', { exact: true })).toHaveValue('Blocked');
    checks.push('readiness blockers persist without becoming approvals');

    await page.goto(origin + workspaceUrl + '/exports');
    const previewPromise = instance.waitForEvent('window');
    await page.getByRole('link', { name: 'Open print-ready view', exact: true }).first().click();
    const preview = await previewPromise;
    await preview.waitForLoadState('domcontentloaded');
    await expect(preview.locator('body')).toContainText('CI desktop workflow');
    const preferences = await instance.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map(w => w.webContents.getLastWebPreferences()).every(p =>
        p.sandbox && p.contextIsolation && !p.nodeIntegration));
    requireCheck('print-ready export opens in an isolated child window', preferences);
    await preview.close();
    await expect.poll(() => instance.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).length)).toBe(1);
    const csvPath = path.join(qa, 'portfolio.csv');
    await instance.evaluate(({ BrowserWindow }, { output, windowId }) => {
      globalThis.__hfTestDownload = null;
      BrowserWindow.fromId(windowId).webContents.session.once('will-download', (event, item) => {
        if (event.defaultPrevented) { globalThis.__hfTestDownload = { state: 'cancelled' }; return; }
        item.setSavePath(output);
        item.once('done', (_done, state) => { globalThis.__hfTestDownload = { state }; });
      });
    }, { output: csvPath, windowId: mainWindowId });
    await page.getByRole('link', { name: 'Download Excel-compatible CSV', exact: true }).click();
    await expect.poll(() => instance.evaluate(() => globalThis.__hfTestDownload?.state), { timeout: 30000 }).toBe('completed');
    requireCheck('CSV export contains the saved workflow', fs.readFileSync(csvPath, 'utf8').includes('CI-CAF-REFERENCE'));

    await instance.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).close(), mainWindowId);
    await expect.poll(() => instance.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.isVisible(), mainWindowId)).toBe(false);
    requireCheck('closing to tray leaves backend running', (await fetch(`${origin}/api/desktop-health`)).status === 403);
    const second = spawn(executablePath, [], { env, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { second.kill(); reject(new Error('Second instance did not exit')); }, 15000);
      second.once('error', reject);
      second.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Second instance exited ${code}`)); });
    });
    await expect.poll(() => instance.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.isVisible(), mainWindowId)).toBe(true);
    checks.push('tray hide and single-instance restore work in installed app');
    await page.screenshot({ path: path.join(qa, 'installed-desktop.png') });
    await quit(origin);
    fs.writeFileSync(path.join(qa, 'data-before-reinstall.json'), JSON.stringify({
      database: hash(path.join(profile, 'data', 'workspace.db')),
      marker: hash(path.join(profile, 'data', 'workspace.schema.json')),
    }, null, 2));
  }
  requireCheck('no renderer errors', errors.length === 0);
  const report = {
    phase, status: 'passed', architecture: process.arch, checks,
    saveDialogApproval: 'Test harness selected a temporary export path; interactive save dialog itself is not automated.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(async error => {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(qa, `failure-${phase}.png`) }).catch(() => {});
  fs.writeFileSync(reportPath, JSON.stringify({ phase, status: 'failed', completedChecks: checks, error: error.message, rendererErrors: errors }, null, 2));
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (instance) await instance.close();
});
