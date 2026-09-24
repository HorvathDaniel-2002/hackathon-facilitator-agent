import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { test, expect, signIn } from "./fixtures";

const template = parse(fs.readFileSync(path.join(process.cwd(), "methodology", "runbook.yaml"), "utf8")) as {
  version: string;
  checks: Array<{ id: string; title: string; gate: string }>;
};

test("full event lifecycle requires evidence, per-case handoff and closure checks before Closed", async ({ page, db, workspace }) => {
  test.setTimeout(180_000);
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Ready");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit workspace settings" }).getByRole("alert"))
    .toContainText(/required start checks|Cannot mark event Ready/);
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Planning");

  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  const firstRequired = template.checks.find((check) => check.gate === "Start")!;
  const firstPanel = page.locator("details").filter({ hasText: firstRequired.title });
  await firstPanel.locator("summary").click();
  await firstPanel.getByLabel("Status", { exact: true }).selectOption("Done");
  await firstPanel.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(firstPanel.getByRole("alert")).toBeVisible();
  expect(await db.runbookCheck.count({ where: { hackathonId: workspace.hackathon.id } })).toBe(0);
  await page.reload();

  const required = template.checks.filter((check) => check.gate === "Start");
  for (const check of required) {
    const panel = page.locator("details").filter({ hasText: check.title });
    await panel.locator("summary").click();
    await panel.getByLabel("Accountable owner", { exact: true }).fill("Synthetic readiness owner");
    await panel.getByLabel("Due / confirmation date", { exact: true }).fill("2027-10-03");
    await panel.getByLabel("Evidence, decision reference or blocker", { exact: true })
      .fill(`Synthetic approval reference for ${check.id}; no real customer data.`);
    await panel.getByLabel("Status", { exact: true }).selectOption("Done");
    await panel.getByRole("button", { name: "Save check", exact: true }).click();
    await expect.poll(async () => (await db.runbookCheck.findUnique({
      where: { hackathonId_templateId: { hackathonId: workspace.hackathon.id, templateId: check.id } },
    }))?.status).toBe("Done");
  }
  await page.reload();
  await expect(page.getByText("0 start checks remaining", { exact: true })).toBeVisible();
  const saved = await db.runbookCheck.findMany({ where: { hackathonId: workspace.hackathon.id } });
  expect(saved).toHaveLength(required.length);
  expect(saved.every((check) => check.templateVersion === template.version && check.owner === "Synthetic readiness owner")).toBe(true);

  for (const status of ["Ready", "Running"]) {
    await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Status", { exact: true }).selectOption(status);
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit workspace settings" })).toBeHidden();
    expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe(status);
  }

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Closed");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit workspace settings" }).getByRole("alert")).toBeVisible();
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Running");

  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  for (const check of template.checks.filter((entry) => entry.gate === "Close")) {
    const panel = page.locator("details").filter({ hasText: check.title });
    await panel.locator("summary").click();
    await panel.getByLabel("Accountable owner", { exact: true }).fill("Synthetic closure owner");
    await panel.getByLabel("Due / confirmation date", { exact: true }).fill("2027-10-06");
    await panel.getByLabel("Evidence, decision reference or blocker", { exact: true })
      .fill(`Synthetic demonstration, decision and cleanup evidence for ${check.id}.`);
    await panel.getByLabel("Status", { exact: true }).selectOption("Done");
    await panel.getByRole("button", { name: "Save check", exact: true }).click();
    await expect.poll(async () => (await db.runbookCheck.findUnique({
      where: { hackathonId_templateId: { hackathonId: workspace.hackathon.id, templateId: check.id } },
    }))?.status).toBe("Done");
  }
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Closed");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit workspace settings" }).getByRole("alert")).toBeVisible();
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Running");

  await page.goto(`/hackathons/${workspace.hackathon.id}/handoff?case=${workspace.useCase.id}`);
  await page.getByLabel("What was built", { exact: true }).fill("Synthetic read-only proof of value");
  await page.getByLabel("Business owner", { exact: true }).fill("Synthetic business owner");
  await page.getByLabel("Technical owner", { exact: true }).fill("Synthetic technical owner");
  await page.getByLabel("Delivery owner", { exact: true }).fill("Synthetic delivery owner");
  await page.getByLabel("Portfolio decision", { exact: true }).selectOption("CustomerLed");
  await page.getByLabel(/^Next action\s*\*?$/).fill("Review pilot scope and measured value");
  await page.getByLabel(/^Next action date\s*\*?$/).fill("2027-10-12");
  await page.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(page.getByText("Exit package saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close use case", exact: true }).click();
  await expect(page.getByText("Use case closed.", { exact: true })).toBeVisible();
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Closed");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit workspace settings" }).getByRole("alert")).toBeVisible();
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Running");
  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  for (const check of template.checks.filter((entry) => entry.gate === "Close")) {
    const panel = page.locator("details").filter({ hasText: check.title });
    await panel.locator("summary").click();
    await expect(panel.getByRole("alert")).toContainText(/scope or methodology changed/i);
    await panel.getByLabel("Evidence, decision reference or blocker", { exact: true })
      .fill(`Reviewed final saved handoff and case closure: ${check.id}.`);
    await panel.getByRole("button", { name: "Save check", exact: true }).click();
    await expect.poll(async () => (await db.runbookCheck.findUnique({
      where: { hackathonId_templateId: { hackathonId: workspace.hackathon.id, templateId: check.id } },
    }))?.templateVersion).toBe(template.version);
  }
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Closed");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit workspace settings" })).toBeHidden();
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Closed");
  const readout = await page.request.get(`/api/export?hackathonId=${workspace.hackathon.id}&kind=readout`);
  expect(readout.status()).toBe(200);
  const text = await readout.text();
  expect(text).toContain("Workspace status: Closed");
  expect(text).toContain("Synthetic read-only proof of value");
  expect(text).toContain("2027-10-12");
});

test("Viewer can inspect runbook evidence but cannot change attestations", async ({ page, context, workspace }) => {
  await signIn(context, workspace.viewer.id);
  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  await expect(page.getByRole("heading", { name: "Facilitator runbook", exact: true, level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save check", exact: true })).toHaveCount(0);
  const panel = page.locator("details").first();
  await panel.locator("summary").click();
  await expect(panel.getByLabel("Status", { exact: true })).toBeDisabled();
  await expect(panel.getByLabel("Accountable owner", { exact: true })).toBeDisabled();
  await expect(panel.getByLabel("Evidence, decision reference or blocker", { exact: true })).toBeDisabled();
});
