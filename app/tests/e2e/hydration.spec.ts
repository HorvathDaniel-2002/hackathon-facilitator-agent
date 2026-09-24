import { test, expect, signIn, casePath, baseURL } from "./fixtures";

test("SSR forms cannot accept edits or native submissions before client handlers are ready", async ({ browser, workspace }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    await signIn(context, workspace.owner.id);
    const page = await context.newPage();
    await page.goto(`${casePath(workspace)}/edit`);
    // Playwright's text engine excludes noscript, even when scripting is disabled.
    await expect(page.locator("noscript")).toBeVisible();
    expect(await page.locator("noscript").textContent()).toContain("Enable JavaScript to edit this workspace.");
    await expect(page.getByLabel("Description", { exact: true })).toBeDisabled();
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await expect(page).toHaveURL(new RegExp(`${casePath(workspace)}/edit$`));
  } finally {
    await context.close();
  }
});
