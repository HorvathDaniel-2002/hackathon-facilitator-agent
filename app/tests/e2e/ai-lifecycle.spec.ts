import { test, expect, casePath, evaluateInBrowser, baseURL } from "./fixtures";

test("@ai @smoke evaluator click persists rubric scores and human override can reset", async ({ page, db, workspace }) => {
  const evaluation = await evaluateInBrowser(page, workspace, db);
  const weighted = Math.round((
    evaluation.valueScore * 0.4 + evaluation.feasibilityScore * 0.3 +
    evaluation.dataReadinessScore * 0.2 + evaluation.reusabilityScore * 0.1
  ) * 10) / 10;
  expect(evaluation.weightedScore).toBe(weighted);
  expect(evaluation.model).toMatch(/mock/i);
  expect(evaluation.methodologyVersion).toBeTruthy();
  expect(evaluation.promptVersion).toBeTruthy();
  const gates = JSON.parse(evaluation.gateResults) as Array<{ kind: string; pass: boolean }>;
  expect(gates.filter((gate) => gate.kind === "deterministic").every((gate) => gate.pass)).toBe(true);

  await page.getByRole("button", { name: "Override", exact: true }).click();
  const newValue = evaluation.valueScore === 5 ? 1 : 5;
  await page.getByLabel("Value", { exact: true }).fill(String(newValue));
  await page.getByLabel("Platform", { exact: true }).selectOption("AzureAI");
  await page.getByLabel("Why are you overriding?", { exact: true }).fill("Synthetic sponsor validated a different impact.");
  await page.getByRole("button", { name: "Save override", exact: true }).click();
  await expect(page.getByText("Human-edited", { exact: true })).toBeVisible();
  await page.reload();
  expect(await db.evaluationOverride.findUniqueOrThrow({ where: { evaluationId: evaluation.id } })).toMatchObject({
    valueScore: newValue,
    recommendedPlatform: "AzureAI",
    reason: "Synthetic sponsor validated a different impact.",
  });
  const original = await db.evaluation.findUniqueOrThrow({ where: { id: evaluation.id } });
  expect(original).toEqual(evaluation);
  await page.getByRole("button", { name: "Override", exact: true }).click();
  await expect(page.getByLabel("Value", { exact: true })).toHaveValue(String(newValue));
  await page.getByRole("button", { name: "Revert to model output", exact: true }).click();
  await expect(page.getByText("Human-edited", { exact: true })).toBeHidden();
  expect(await db.evaluationOverride.findUnique({ where: { evaluationId: evaluation.id } }))
    .toMatchObject({ version: 1, overriddenFields: "[]", valueScore: null, recommendedPlatform: null });
  await page.reload();
  await page.getByRole("button", { name: "Re-evaluate", exact: true }).click();
  await expect.poll(() => db.evaluation.count({ where: { useCaseId: workspace.useCase.id } })).toBe(2);
  const versions = await db.evaluation.findMany({
    where: { useCaseId: workspace.useCase.id }, orderBy: { version: "asc" },
  });
  expect(versions.map((version) => version.version)).toEqual([1, 2]);
  expect(versions[1].weightedScore).toBe(evaluation.weightedScore);
});

test("@ai @smoke guide streams from UI, persists two versions and downloads the selected Markdown", async ({ page, db, workspace }) => {
  await evaluateInBrowser(page, workspace, db);
  const guideResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/build-guide") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Generate guide", exact: true }).first().click();
  const response = await guideResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  await expect(page.getByRole("heading", { name: "Hackathon MVP", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Production scaling", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeEnabled();
  await expect.poll(() => db.buildGuide.count({
    where: { useCaseId: workspace.useCase.id, status: "complete" },
  })).toBe(1);
  const first = await db.buildGuide.findFirstOrThrow({ where: { useCaseId: workspace.useCase.id } });
  expect(first.mvpGuideMd).toContain("## Hackathon MVP");
  expect(first.productionPlanMd).toContain("## Production scaling");
  expect(first.model).toMatch(/mock/i);
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.getByRole("button", { name: /^v2(?: · complete)?$/ })).toBeVisible();
  await page.getByRole("button", { name: /^v1(?: · complete)?$/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: ".md", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${workspace.useCase.code}-build-guide-v1.md`);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8")).toBe([first.mvpGuideMd, first.productionPlanMd].join("\n\n"));
  const usage = await db.aiUsage.findMany({
    where: { useCaseId: workspace.useCase.id, operation: "build-guide" },
  });
  expect(usage).toHaveLength(2);
  expect(usage.every((entry) => entry.status === "ok" && entry.latencyMs >= 0)).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: /^v1(?: · complete)?$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^v2(?: · complete)?$/ })).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Revised synthetic scenario");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText(/Saved guides remain available as historical drafts/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^v1(?: · complete)?$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^v2(?: · complete)?$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hackathon MVP", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeDisabled();
  expect(await db.buildGuide.count({ where: { useCaseId: workspace.useCase.id } })).toBe(2);
});

test("@ai concurrent override forms cannot overwrite a newer saved assessment", async ({ page, context, db, workspace }) => {
  const evaluation = await evaluateInBrowser(page, workspace, db);
  const other = await context.newPage();
  await other.goto(casePath(workspace));
  for (const tab of [page, other]) {
    await tab.getByRole("button", { name: "Override", exact: true }).click();
    await tab.getByLabel("Why are you overriding?", { exact: true }).fill("Synthetic evidence from two reviewers.");
  }
  const newValue = evaluation.valueScore === 5 ? 4 : 5;
  await page.getByLabel("Value", { exact: true }).fill(String(newValue));
  await page.getByRole("button", { name: "Save override", exact: true }).click();
  await expect(page.getByText("Human-edited", { exact: true })).toBeVisible();
  await other.getByLabel("Platform", { exact: true }).selectOption("AzureAI");
  await other.getByRole("button", { name: "Save override", exact: true }).click();
  await expect(other.getByText(/This evaluation override was changed by someone else/)).toBeVisible();
  const saved = await db.evaluationOverride.findUniqueOrThrow({ where: { evaluationId: evaluation.id } });
  expect(saved.valueScore).toBe(newValue);
  expect(saved.recommendedPlatform).toBeNull();
  expect(saved.version).toBe(0);
  await expect(other.getByLabel("Platform", { exact: true })).toHaveValue("AzureAI");
  await other.close();
});
test("@ai rejects malformed and cross-workspace guide requests without writes", async ({ context, db, workspace }) => {
  const before = await db.buildGuide.count();
  const badJson = await context.request.post("/api/build-guide", {
    headers: { "Content-Type": "application/json", Origin: baseURL }, data: "{",
  });
  expect(badJson.status()).toBe(400);
  for (const data of [{}, { hackathonId: workspace.hackathon.id, useCaseId: 4 }]) {
    expect((await context.request.post("/api/build-guide", { data, headers: { Origin: baseURL } })).status()).toBe(400);
  }
  const wrongParent = await context.request.post("/api/build-guide", {
    data: { hackathonId: workspace.hackathon.id, useCaseId: "not-an-owned-case" },
    headers: { Origin: baseURL },
  });
  expect(wrongParent.status()).toBe(404);
  expect(await db.buildGuide.count()).toBe(before);
});

test("@ai failed qualification facts stay blocked after an evaluator UI click", async ({ page, db, workspace }) => {
  await db.useCase.update({
    where: { id: workspace.useCase.id },
    data: { businessOwner: null, dataSources: "", smallestSlice: "   ", humanApprovalPoint: "" },
  });
  const evaluation = await evaluateInBrowser(page, workspace, db);
  const failed = (JSON.parse(evaluation.gateResults) as Array<{
    gate: string; pass: boolean; reason?: string; remedy?: string;
  }>).filter((gate) => !gate.pass);
  expect(failed.map((gate) => gate.gate)).toContain("hasSampleData");
  expect(failed.some((gate) => ["hasSmallestSlice", "canDemoOnePath"].includes(gate.gate))).toBe(true);
  expect(failed.every((gate) => gate.reason && gate.remedy)).toBe(true);
  await page.goto(casePath(workspace));
  await expect(page.getByText(/Qualification gates/)).toBeVisible();
});
