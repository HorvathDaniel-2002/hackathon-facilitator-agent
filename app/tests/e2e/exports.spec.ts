import { test, expect, signIn } from "./fixtures";

test("export UI downloads Markdown and CSV with spreadsheet formulas neutralized", async ({ page, db, workspace }) => {
  await db.useCase.update({
    where: { id: workspace.useCase.id },
    data: { title: '=HYPERLINK("https://example.invalid","synthetic")', businessOwner: "+12345" },
  });
  await page.goto(`/hackathons/${workspace.hackathon.id}/exports`);
  await expect(page.getByText(/not automatically sensitivity-labeled/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Charter", exact: true })).toHaveCount(0);
  expect((await page.request.get(`/api/export?hackathonId=${workspace.hackathon.id}&kind=charter`)).status()).toBe(400);
  const portfolio = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Use-case portfolio", exact: true }),
  });
  const csvPromise = page.waitForEvent("download");
  await portfolio.getByRole("link", { name: "Download Excel-compatible CSV", exact: true }).click();
  const csv = await csvPromise;
  expect(csv.suggestedFilename()).toMatch(/^portfolio-[a-z0-9]+\.csv$/);
  const csvStream = await csv.createReadStream();
  const csvChunks: Buffer[] = [];
  for await (const chunk of csvStream!) csvChunks.push(Buffer.from(chunk));
  const text = Buffer.concat(csvChunks).toString("utf8");
  expect(text).toContain("\"'=HYPERLINK(\"\"https://example.invalid\"\",\"\"synthetic\"\")\"");
  expect(text).toContain("\"'+12345\"");
  expect(text).toContain(workspace.useCase.code);

  const mdPromise = page.waitForEvent("download");
  await portfolio.getByRole("link", { name: "Download Markdown", exact: true }).click();
  const markdown = await mdPromise;
  expect(markdown.suggestedFilename()).toMatch(/^portfolio-[a-z0-9]+\.md$/);
  const mdStream = await markdown.createReadStream();
  const mdChunks: Buffer[] = [];
  for await (const chunk of mdStream!) mdChunks.push(Buffer.from(chunk));
  expect(Buffer.concat(mdChunks).toString("utf8")).toContain("PLANNING ARTIFACT");
});

test("print-ready export renders user HTML as text and blocks cross-workspace export reads", async ({ page, context, db, workspace }) => {
  const payload = '<script>window.__e2eInjected = true</script><img src=x onerror="window.__e2eInjected=true">';
  await db.useCase.update({
    where: { id: workspace.useCase.id }, data: { desiredOutcome: payload },
  });
  await page.goto(`/hackathons/${workspace.hackathon.id}/exports`);
  const portfolio = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Use-case portfolio", exact: true }),
  });
  const popupPromise = page.waitForEvent("popup");
  await portfolio.getByRole("link", { name: "Open print-ready view", exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(await popup.evaluate(() => Object.hasOwn(window, "__e2eInjected"))).toBe(false);
  await expect(popup.locator("script, img")).toHaveCount(0);
  await expect(popup.locator("pre")).toContainText("window.");
  const artifact = await context.request.get(popup.url());
  expect(artifact.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect(artifact.headers()["x-content-type-options"]).toBe("nosniff");
  expect(artifact.headers()["cache-control"]).toContain("no-store");
  await popup.close();

  const privateWorkspace = await db.hackathon.create({
    data: { name: "Private export fixture", customer: "Synthetic private customer" },
  });
  await signIn(context, workspace.viewer.id);
  const rejected = await context.request.get(`/api/export?hackathonId=${privateWorkspace.id}&kind=portfolio&format=csv`);
  expect(rejected.status()).toBe(404);
  expect(await rejected.text()).not.toContain("Synthetic private customer");
  const readable = await context.request.get(`/api/export?hackathonId=${workspace.hackathon.id}&kind=portfolio&format=csv`);
  expect(readable.status()).toBe(200);
});
