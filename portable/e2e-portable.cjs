'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('../desktop/e2e-harness/node_modules/@playwright/test');

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows') {
  throw new Error('This modifying portable-app test is restricted to disposable Windows CI runners.');
}

const [phase, directory, lockPath] = process.argv.slice(2);
if (!['first', 'restarted'].includes(phase) || !path.isAbsolute(directory || '') || !path.isAbsolute(lockPath || '')) {
  throw new Error('Usage: node portable/e2e-portable.cjs <first|restarted> <absolute-test-directory> <absolute-lock-file>');
}

const qa = path.resolve(directory);
const relative = path.relative(path.resolve(process.env.RUNNER_TEMP), qa);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Test output must be inside RUNNER_TEMP.');
const stateFile = path.join(qa, 'portable-workflow-state.json');
const reportPath = path.join(qa, `portable-${phase}.json`);
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (!/^http:\/\/127\.0\.0\.1:\d+\/_hf_launch\/[a-f0-9]{64}$/.test(lock.launchUrl || '')) {
  throw new Error('Portable launch URL is missing or invalid.');
}

const checks = [];
const errors = [];
let browser;
let page;
const requireCheck = (name, condition) => {
  if (!condition) throw new Error(name);
  checks.push(name);
};

async function main() {
  requireCheck('anonymous portable gateway access denied', (await fetch(lock.origin)).status === 403);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(lock.launchUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForURL(/\/usecases$/, { timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Use case board', exact: true })).toBeVisible();
  await expect(page.getByText('Local desktop preview.', { exact: true })).toBeVisible();
  checks.push('full original application opens through the protected local browser gateway');

  if (phase === 'restarted') {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    await page.goto(lock.origin + saved.caseUrl);
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByLabel('Next action', { exact: true })).toHaveValue(saved.nextAction);
    await expect(drawer.getByLabel(/^CAF submission reference\s*\*?$/)).toHaveValue('CI-CAF-REFERENCE');
    await expect(drawer.getByLabel('Progress stage', { exact: true })).toHaveValue('InProduction');
    checks.push('saved full-app workspace survives stop and restart');
  } else {
    await expect(page.getByRole('article')).toHaveCount(6);
    checks.push('first launch contains only the six fictional seed cases');

    await page.goto(`${lock.origin}/hackathons/new`);
    await page.getByLabel(/^Hackathon name\s*\*?$/).fill('CI portable workflow');
    await page.getByLabel(/^Customer\s*\*?$/).fill('Synthetic test organization');
    await page.getByRole('button', { name: 'Create hackathon', exact: true }).click();
    await page.waitForURL(/\/usecases$/);
    const workspaceUrl = new URL(page.url()).pathname.replace(/\/usecases$/, '');

    await page.goto(lock.origin + workspaceUrl + '/usecases/new');
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
    await expect(page.getByRole('button', { name: 'Regenerate', exact: true })).toBeVisible({ timeout: 90_000 });
    checks.push('full app creates and evaluates a case and saves a mock build guide');

    await page.goto(lock.origin + workspaceUrl + '/usecases');
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
    const nextAction = 'Review synthetic pilot scope after restart';
    await drawer.getByLabel('Next action', { exact: true }).fill(nextAction);
    await drawer.getByLabel('Next action date', { exact: true }).fill('2027-10-12');
    await drawer.getByRole('button', { name: 'Save exit package', exact: true }).click();
    await expect(drawer.getByText('Exit package saved.', { exact: true })).toBeVisible();
    await drawer.getByRole('link', { name: 'Handoff overview', exact: true }).click();
    await expect(drawer.getByLabel('Next action', { exact: true })).toHaveValue(nextAction);
    checks.push('production and CAF evidence guards plus shared handoff synchronization');
    fs.writeFileSync(stateFile, JSON.stringify({ caseUrl: `${workspaceUrl}/usecases?case=${caseId}`, nextAction }, null, 2));

    await page.goto(lock.origin + workspaceUrl + '/runbook');
    const readiness = page.locator('details').filter({ hasText: 'Sample data and knowledge permissions verified' });
    await readiness.locator('summary').click();
    await readiness.getByLabel('Accountable owner', { exact: true }).fill('CI data owner');
    await readiness.getByLabel('Evidence, decision reference or blocker', { exact: true }).fill('Fictional evidence is pending, not approved.');
    await readiness.getByLabel('Status', { exact: true }).selectOption('Blocked');
    await readiness.getByRole('button', { name: 'Save check', exact: true }).click();
    await expect(readiness.getByText('Saved.', { exact: true })).toBeVisible();
    await page.reload();
    await readiness.locator('summary').click();
    await expect(readiness.getByLabel('Status', { exact: true })).toHaveValue('Blocked');
    checks.push('readiness blockers persist without becoming approvals');

    await page.goto(lock.origin + workspaceUrl + '/exports');
    const previewPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open print-ready view', exact: true }).first().click();
    const preview = await previewPromise;
    await preview.waitForLoadState('domcontentloaded');
    await expect(preview.locator('body')).toContainText('CI portable workflow');
    await preview.close();
    checks.push('print-ready full-app export opens in a separate browser page');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download Excel-compatible CSV', exact: true }).click();
    const download = await downloadPromise;
    const csvPath = path.join(qa, 'portable-portfolio.csv');
    await download.saveAs(csvPath);
    requireCheck('CSV export contains the saved workflow', fs.readFileSync(csvPath, 'utf8').includes('CI-CAF-REFERENCE'));

    const workspaceId = workspaceUrl.split('/').at(-1);
    await page.goto(`${lock.origin}/dashboard?hackathon=${encodeURIComponent(workspaceId)}`);
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
    checks.push('dashboard remains available in the full application');
  }

  requireCheck('no browser page errors', errors.length === 0);
  await page.screenshot({ path: path.join(qa, `portable-${phase}.png`), fullPage: true });
  const report = { phase, status: 'passed', architecture: process.arch, checks };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async error => {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(qa, `portable-failure-${phase}.png`), fullPage: true }).catch(() => {});
  fs.writeFileSync(reportPath, JSON.stringify({ phase, status: 'failed', completedChecks: checks, error: error.message, pageErrors: errors }, null, 2));
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
});
