'use strict';
const { chromium, firefox, expect } = require(process.env.PLAYWRIGHT_MODULE || '../../desktop/e2e-harness/node_modules/@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const evidence = process.env.HF_BROWSER_EVIDENCE || fs.mkdtempSync(path.join(os.tmpdir(), 'hf-browser-evidence-'));
fs.mkdirSync(evidence, { recursive: true });
const results = [], failures = [], requests = [], errors = [];
let server, browser, testPage;
async function check(name, work) {
  await work();
  results.push(name); console.log(`PASS ${name}`);
}
const confirmNext = page => page.once('dialog', d => d.accept());
async function startServer() {
  if (process.env.HF_BROWSER_URL) return process.env.HF_BROWSER_URL;
  server = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Static server did not start')), 10000);
    server.once('error', reject);
    server.stdout.once('data', data => { clearTimeout(timer); resolve(data.toString().trim()); });
  });
}
async function main() {
  const url = await startServer();
  browser = await (process.env.BROWSER === 'firefox' ? firefox : chromium).launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true, colorScheme: 'light' });
  const page = await context.newPage();
  testPage = page;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  await page.goto(url);
  await check('no-install onboarding and explicitly fictional sample', async () => {
    await expect(page.getByRole('button', { name: 'Try fictional sample' })).toBeVisible();
    await page.getByRole('button', { name: 'Try fictional sample' }).click();
    await expect(page.getByRole('heading', { name: 'Kanban', exact: true })).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(3);
    await expect(page.getByText('Contoso workshop · fictional sample', { exact: true })).toBeVisible();
  });
  await check('all six lanes fit desktop without horizontal/page scrolling', async () => {
    for (const width of [1280, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        lanes: Array.from(document.querySelectorAll('.lane')).map(lane => ({ x: lane.getBoundingClientRect().x, right: lane.getBoundingClientRect().right })),
      }));
      assert.ok(layout.width <= width, `Horizontal overflow at ${width}`);
      assert.ok(layout.height <= 901, `Page scroll at ${width}: ${layout.height}`);
      assert.equal(layout.lanes.length, 6);
      assert.ok(layout.lanes.every(lane => lane.x >= 0 && lane.right <= width));
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.screenshot({ path: path.join(evidence, 'browser-desktop.png'), fullPage: true });
  });
  await check('new use case persists after reload', async () => {
    await page.getByRole('button', { name: '+ New use case', exact: true }).click();
    await page.getByLabel('Title *', { exact: true }).fill('Synthetic review workflow');
    await page.getByLabel('Problem to solve', { exact: true }).fill('Review synthetic workshop notes.');
    await page.getByLabel('Business owner', { exact: true }).fill('Example owner');
    await page.getByLabel('Next action', { exact: true }).fill('Review the demo together.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Synthetic review workflow', exact: true })).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(4);
  });
  await check('production and CAF guards preserve draft until evidence supplied', async () => {
    await page.getByRole('button', { name: 'Synthetic review workflow', exact: true }).click();
    await page.getByLabel('Progress', { exact: true }).selectOption('In production');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#form-error')).toContainText('production evidence');
    await page.getByLabel('Production evidence / reference').fill('Synthetic approval reference');
    await page.getByLabel('CAF status').selectOption('Submitted');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#form-error')).toContainText('CAF submission reference');
    await page.getByLabel('CAF submission reference').fill('Synthetic CAF record');
    await page.getByLabel('Delivery route', { exact: true }).selectOption('CAF');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('region', { name: 'In production', exact: true }).getByRole('button', { name: 'Synthetic review workflow' })).toBeVisible();
  });
  await check('handoff and Kanban edit exactly the same record', async () => {
    await page.getByRole('button', { name: 'Handoffs', exact: true }).click();
    await page.getByRole('button', { name: 'Synthetic review workflow' }).click();
    await expect(page.getByLabel('Next action', { exact: true })).toHaveValue('Review the demo together.');
    await page.getByLabel('Next action', { exact: true }).fill('Follow up after the workshop.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('cell', { name: 'Follow up after the workshop.' })).toBeVisible();
    await page.getByRole('button', { name: 'Kanban', exact: true }).click();
    await expect(page.getByText('Follow up after the workshop.', { exact: true })).toBeVisible();
  });
  await check('route grouping, search, filter and drag preserve independent status', async () => {
    await page.getByLabel('Group by').selectOption('Delivery route');
    await expect(page.locator('.lane')).toHaveCount(5);
    await expect(page.getByRole('region', { name: 'CAF', exact: true }).getByText('In production', { exact: true })).toBeVisible();
    await page.getByLabel('Find a use case').fill('synthetic review');
    await expect(page.locator('.card')).toHaveCount(1);
    await page.getByLabel('Filter delivery route').selectOption('Copilot Studio');
    await expect(page.locator('.card')).toHaveCount(0);
    await page.getByLabel('Find a use case').fill('');
    await page.getByLabel('Filter delivery route').selectOption('All routes');
    await page.getByLabel('Group by').selectOption('Progress');
    const card = page.locator('.card').filter({ hasText: 'Workshop support assistant' });
    await card.dragTo(page.getByRole('region', { name: 'Pilot', exact: true }));
    await expect(page.getByRole('region', { name: 'Pilot', exact: true }).getByRole('button', { name: 'Workshop support assistant', exact: true })).toBeVisible();
  });
  await check('readiness requires review evidence and survives a reopen', async () => {
    await page.getByRole('button', { name: 'Readiness', exact: true }).click();
    await page.getByRole('button', { name: 'Review check', exact: true }).first().click();
    await page.getByLabel('Reviewed / completed').check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#form-error')).toContainText('owner, evidence');
    await page.getByLabel('Review owner').fill('Example reviewer');
    await page.getByLabel('Evidence / reference', { exact: true }).fill('Synthetic workshop notes');
    await page.getByLabel('Review date').fill('2026-09-28');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Recorded', { exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByText('1/6', { exact: true })).toBeVisible();
  });
  let backupFile;
  await check('JSON backup includes handoffs and readiness; CSV downloads', async () => {
    await page.getByRole('button', { name: 'Data & help', exact: true }).click();
    let event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON backup', exact: true }).click();
    const download = await event;
    backupFile = path.join(evidence, 'synthetic-backup.json');
    await download.saveAs(backupFile);
    const saved = JSON.parse(fs.readFileSync(backupFile));
    assert.equal(saved.workspace.cases.length, 4);
    assert.equal(saved.workspace.checks[0].done, true);
    assert.equal(saved.workspace.cases[3].nextAction, 'Follow up after the workshop.');
    event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export portfolio CSV' }).click();
    await (await event).saveAs(path.join(evidence, 'synthetic-portfolio.csv'));
    assert.match(fs.readFileSync(path.join(evidence, 'synthetic-portfolio.csv'), 'utf8'), /Synthetic review workflow/);
  });
  await check('invalid backup cannot replace data; replacement needs consent and restores exact records', async () => {
    await page.getByLabel('Select browser backup').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await expect(page.locator('#notice')).toContainText('Invalid backup');
    confirmNext(page);
    await page.getByRole('button', { name: 'Start a new empty workspace' }).click();
    await expect(page.getByText('My hackathon', { exact: true })).toBeVisible();
    confirmNext(page);
    await page.getByLabel('Select browser backup').setInputFiles(backupFile);
    await expect(page.getByText('Contoso workshop · fictional sample', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Kanban', exact: true }).click();
    await expect(page.locator('.card')).toHaveCount(4);
  });
  await check('multi-tab conflict never silently overwrites and offers draft recovery', async () => {
    await page.getByRole('button', { name: 'Synthetic review workflow', exact: true }).click();
    await page.getByLabel('Title *', { exact: true }).fill('Unsaved first-tab draft');
    const other = await context.newPage();
    await other.goto(url);
    await other.getByRole('button', { name: 'Synthetic review workflow', exact: true }).click();
    await other.getByLabel('Title *', { exact: true }).fill('Saved second-tab title');
    await other.getByRole('button', { name: 'Save changes' }).click();
    await expect(other.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#form-error')).toContainText('Another tab changed');
    await expect(page.getByLabel('Title *', { exact: true })).toHaveValue('Unsaved first-tab draft');
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download unsaved draft' }).click();
    await (await event).saveAs(path.join(evidence, 'unsaved-draft.json'));
    confirmNext(page);
    await page.getByRole('button', { name: 'Reload saved', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved second-tab title', exact: true })).toBeVisible();
    await other.close();
  });
  await check('failed local save preserves the form and previously saved data', async () => {
    await page.getByRole('button', { name: 'Saved second-tab title', exact: true }).click();
    await page.getByLabel('Title *', { exact: true }).fill('Quota draft');
    await page.evaluate(() => {
      window.originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = () => { throw new DOMException('Storage quota exhausted', 'QuotaExceededError'); };
    });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#form-error')).toContainText('No changes were saved');
    await expect(page.getByLabel('Title *', { exact: true })).toHaveValue('Quota draft');
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalPut; });
    confirmNext(page);
    await page.getByRole('button', { name: 'Reload saved', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved second-tab title', exact: true })).toBeVisible();
  });
  await check('untrusted titles render as text; cancelling edits and deletion preserves data', async () => {
    await page.getByRole('button', { name: 'Saved second-tab title', exact: true }).click();
    const title = '<img src=x onerror=alert(1)>';
    await page.getByLabel('Title *', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    await page.getByRole('button', { name: title, exact: true }).click();
    await page.getByLabel('Title *', { exact: true }).fill('Discard me');
    page.once('dialog', d => d.dismiss());
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    confirmNext(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: title, exact: true }).click();
    page.once('dialog', d => d.dismiss());
    await page.getByRole('button', { name: 'Delete use case' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  });
  await check('tablet/mobile have no page overflow and card form stays usable', async () => {
    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
      await page.getByRole('button', { name: '+ New use case', exact: true }).click();
      const box = await page.getByRole('dialog').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(evidence, 'browser-mobile.png'), fullPage: true });
  });
  await check('loaded app can save with network offline and sends no workspace requests', async () => {
    await context.setOffline(true);
    await page.getByRole('button', { name: '+ New use case', exact: true }).click();
    await page.getByLabel('Title *', { exact: true }).fill('Offline local edit');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Offline local edit', exact: true })).toBeVisible();
    await context.setOffline(false);
    assert.ok(requests.every(r => r.method === 'GET' && new URL(r.url).origin === new URL(url).origin));
    assert.deepEqual(errors, []);
  });
  await check('renaming long workspace names, confirmed deletion and dark mode stay usable', async () => {
    await page.getByRole('button', { name: 'Data & help', exact: true }).click();
    await page.getByRole('button', { name: 'Rename workspace', exact: true }).click();
    await page.getByLabel('Name *', { exact: true }).fill('Workshop'.repeat(15));
    await page.getByRole('button', { name: 'Save changes' }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Kanban', exact: true }).click();
    await page.getByRole('button', { name: 'Offline local edit', exact: true }).click();
    confirmNext(page);
    await page.getByRole('button', { name: 'Delete use case' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Offline local edit', exact: true })).toHaveCount(0);
    await page.goto(`${url}?scoutTheme=dark`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.card')).toHaveCount(4);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: path.join(evidence, 'browser-dark.png'), fullPage: true });
    await page.goto(`${url}?scoutTheme=light`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
  await check('new browser profile has no workspace or account shared from another profile', async () => {
    const fresh = await browser.newContext();
    const p = await fresh.newPage();
    await p.goto(url);
    await p.getByRole('button', { name: 'Create empty workspace' }).click();
    await expect(p.getByRole('heading', { name: 'Kanban', exact: true })).toBeVisible();
    await expect(p.locator('.card')).toHaveCount(0);
    await p.reload();
    await expect(p.getByRole('heading', { name: 'Kanban', exact: true })).toBeVisible();
    await expect(p.locator('.card')).toHaveCount(0);
    await fresh.close();
  });
  await check('blocked storage reports failure instead of pretending to save', async () => {
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
    const p = await blocked.newPage();
    await p.goto(url);
    await expect(p.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible();
    await expect(p.getByRole('alert')).toContainText('local database storage');
    await blocked.close();
  });
  await check('corrupt stored format is never reset on startup', async () => {
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('hackathon-facilitator-browser-v1', 1);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({ schema: 999, revision: 1, workspace: { name: 'Keep me' } }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = reject;
      };
    }));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('not been reset or replaced');
  });
  await context.close();
}
main().catch(async error => {
  failures.push(error.stack); console.error(error); process.exitCode = 1;
  if (testPage && !testPage.isClosed()) {
    await testPage.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true });
    fs.writeFileSync(path.join(evidence, 'failure.txt'), await testPage.locator('body').innerText());
  }
}).finally(async () => {
  await browser?.close();
  server?.kill();
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ browser: process.env.BROWSER || 'chromium', passed: results.length, results, failures, errors }, null, 2));
  console.log(`Evidence: ${evidence}`);
});
