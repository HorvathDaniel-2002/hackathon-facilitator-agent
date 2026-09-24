import { test, expect, casePath, signIn, baseURL, evaluateInBrowser } from "./fixtures";
import type { PrismaClient } from "@prisma/client";
import type { GateResult } from "../../src/lib/schemas";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { runbookTemplateSchema } from "../../src/lib/domain/runbook";

async function databaseSnapshot(db: PrismaClient) {
  const tables = await db.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `;
  return Promise.all(tables.map(async ({ name }) => ({
    table: name,
    rows: await db.$queryRawUnsafe(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`),
  })));
}

test("invalid demo cookie recovers through the browser without changing any workspace data", async ({ page, context, db, workspace }) => {
  await signIn(context, "stale-synthetic-user-does-not-exist");
  await context.addCookies([{ name: "synthetic_recovery_sentinel", value: "keep", url: baseURL }]);
  const before = await databaseSnapshot(db);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Development sign-in unavailable", exact: true })).toBeVisible();
  await expect(page.getByText(workspace.hackathon.name, { exact: true })).toHaveCount(0);
  const restore = page.getByRole("button", { name: "Restore default demo sign-in", exact: true });
  await restore.focus();
  const responsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/dev-session/reset" && response.request().method() === "POST");
  await page.keyboard.press("Enter");
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  await expect(page).toHaveURL(/\/hackathons\/[^/]+\/usecases$/);
  await expect(page.getByRole("heading", { name: "Use-case board", exact: true, level: 1 })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === "hf_session")).toBeUndefined();
  expect(cookies.find((cookie) => cookie.name === "synthetic_recovery_sentinel")?.value).toBe("keep");
  expect(await databaseSnapshot(db)).toEqual(before);
});

test("cross-origin demo reset returns 403 without clearing sign-in or changing data", async ({ context, db, workspace }) => {
  const before = await databaseSnapshot(db);
  const response = await context.request.post("/api/dev-session/reset", {
    headers: { Origin: "https://untrusted.example.test", "Sec-Fetch-Site": "cross-site" },
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({
    error: "Demo session reset is allowed only in local development from this application.",
  });
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect((await context.cookies()).find((cookie) => cookie.name === "hf_session")?.value).toBe(workspace.owner.id);
  expect(await databaseSnapshot(db)).toEqual(before);
});

test("@ai Viewer can inspect persisted evaluation history by keyboard without mutation controls", async ({ page, context, db, workspace }) => {
  const first = await evaluateInBrowser(page, workspace, db);
  const firstGates = JSON.parse(first.gateResults) as GateResult[];
  await db.evaluation.update({
    where: { id: first.id },
    data: {
      rationale: "Historical synthetic rationale, preserved independently of the current version.",
      model: "historic-synthetic-model",
      methodologyVersion: "historic-synthetic-methodology",
      gateResults: JSON.stringify(firstGates.map((gate, index) => index === 0
        ? { ...gate, pass: false, reason: "Historical synthetic owner evidence was missing." }
        : gate)),
    },
  });
  await page.getByRole("button", { name: "Re-evaluate", exact: true }).click();
  await expect.poll(() => db.evaluation.count({ where: { useCaseId: workspace.useCase.id } })).toBe(2);
  const latest = await db.evaluation.findFirstOrThrow({ where: { useCaseId: workspace.useCase.id }, orderBy: { version: "desc" } });
  await db.evaluation.update({
    where: { id: latest.id },
    data: { rationale: "Latest synthetic rationale, distinct from historical evidence." },
  });
  await signIn(context, workspace.viewer.id);
  const before = await databaseSnapshot(db);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(casePath(workspace));
  const evaluator = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Copilot Studio fit evaluator", exact: true }),
  });
  const history = evaluator.getByRole("button", { name: "Show evaluation history", exact: true });
  await expect(history).toHaveAttribute("aria-expanded", "false");
  await history.focus();
  await page.keyboard.press("Enter");
  await expect(history).toHaveAttribute("aria-expanded", "true");
  const previousVersion = evaluator.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^v1\s*·/ }) });
  await previousVersion.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(previousVersion).toContainText("Historical synthetic rationale, preserved independently of the current version.");
  await expect(previousVersion).toContainText("Recorded model: historic-synthetic-model · methodology: historic-synthetic-methodology");
  await expect(previousVersion.getByText(/Historical synthetic owner evidence was missing/)).toBeVisible();
  const currentVersion = evaluator.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^v2\s*·/ }) });
  await currentVersion.locator("summary").click();
  await expect(currentVersion).toContainText("Latest synthetic rationale, distinct from historical evidence.");
  await expect(currentVersion).toContainText(`Recorded model: ${latest.model} · methodology: ${latest.methodologyVersion}`);
  await expect(page.getByRole("button", { name: /^(Run evaluator|Re-evaluate|Override|Save override|Revert to model output)$/ })).toHaveCount(0);
  await history.click();
  await expect(history).toHaveAttribute("aria-expanded", "false");
  await expect(previousVersion).toHaveCount(0);
  expect(await databaseSnapshot(db)).toEqual(before);
});

test("@ai corrupt gate sets never qualify the dashboard and remain actionable on the case", async ({ page, db, workspace }) => {
  const evaluation = await evaluateInBrowser(page, workspace, db);
  const complete = JSON.parse(evaluation.gateResults) as GateResult[];
  expect(complete.length).toBeGreaterThan(1);
  expect(complete.every((gate) => gate.pass)).toBe(true);
  const dashboard = `/dashboard?hackathon=${workspace.hackathon.id}`;
  await page.goto(dashboard);
  const overview = page.locator("section").filter({ has: page.getByRole("heading", { name: "Portfolio overview", exact: true }) });
  await expect(overview.getByText("Qualified", { exact: true }).locator("..").getByText("1", { exact: true })).toBeVisible();
  const corruptSets: Array<{ name: string; gates: GateResult[] }> = [
    { name: "empty set", gates: [] },
    { name: "incomplete valid set", gates: [complete[0]] },
    { name: "fabricated passing gate", gates: [{ gate: "fake", label: "Fake passing gate", kind: "deterministic", pass: true }] },
    { name: "duplicate identifier", gates: complete.map((gate, index) => index === 1 ? complete[0] : gate) },
    { name: "wrong kind", gates: complete.map((gate, index) => index === 0
      ? { ...gate, kind: gate.kind === "deterministic" ? "judgement" : "deterministic" } : gate) },
  ];
  for (const corruption of corruptSets) {
    await test.step(corruption.name, async () => {
      await db.evaluation.update({ where: { id: evaluation.id }, data: { gateResults: JSON.stringify(corruption.gates) } });
      expect((await page.goto(dashboard))?.status()).toBe(200);
      await expect(overview.getByText("Qualified", { exact: true }).locator("..").getByText("0", { exact: true })).toBeVisible();
      await expect(overview.getByText("Gate blocked", { exact: true }).locator("..").getByText("1", { exact: true })).toBeVisible();
      expect((await page.goto(casePath(workspace)))?.status()).toBe(200);
      await expect(page.getByText("Evaluation gates unavailable", { exact: true })).toBeVisible();
      await expect(page.getByText("Stored gate data is invalid. Re-evaluate before qualifying this case.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Re-evaluate", exact: true })).toBeEnabled();
    });
  }
});

test("@ai Closed and Archived hide AI mutations but retain saved guide access", async ({ page, context, db, workspace }) => {
  await evaluateInBrowser(page, workspace, db);
  await page.getByRole("button", { name: "Generate guide", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Hackathon MVP", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeEnabled();
  await expect.poll(() => db.buildGuide.count({ where: { useCaseId: workspace.useCase.id, status: "complete" } })).toBe(1);
  const unevaluated = await db.useCase.create({
    data: { hackathonId: workspace.hackathon.id, code: "E2E-02", title: "Synthetic unevaluated frozen case" },
  });
  const mutationNames = /^(Run evaluator|Re-evaluate|Override|Save override|Revert to model output|Generate guide|Regenerate)$/;
  for (const status of ["Closed", "Archived"]) {
    await test.step(status, async () => {
      await db.hackathon.update({ where: { id: workspace.hackathon.id }, data: { status } });
      const before = await databaseSnapshot(db);
      await page.goto(casePath(workspace));
      await expect(page.getByRole("button", { name: mutationNames })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Hackathon MVP", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: ".md", exact: true })).toBeEnabled();
      await page.goto(`/hackathons/${workspace.hackathon.id}/usecases/${unevaluated.id}`);
      await expect(page.getByRole("button", { name: mutationNames })).toHaveCount(0);
      const response = await context.request.post("/api/build-guide", {
        data: { hackathonId: workspace.hackathon.id, useCaseId: workspace.useCase.id },
        headers: { Origin: baseURL },
      });
      expect(response.status()).toBe(409);
      expect((await response.json()).error).toMatch(/closed or archived/i);
      expect(await databaseSnapshot(db)).toEqual(before);
    });
  }
});

test("failed creation preserves the workspace draft and announces field errors", async ({ page, workspace }) => {
  await page.goto("/hackathons/new");
  await page.getByLabel("Hackathon name").fill("A");
  await page.getByLabel(/^Customer\s*\*?$/).fill(workspace.hackathon.customer);
  await page.getByRole("button", { name: "Create hackathon", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Name is required" })).toBeVisible();
  await expect.soft(page.getByLabel("Hackathon name")).toHaveValue("A");
  await expect.soft(page.getByLabel(/^Customer\s*\*?$/)).toHaveValue(workspace.hackathon.customer);
  await expect.soft(page.getByRole("alert").filter({ hasText: "Name is required" })).toBeVisible();
  await expect.soft(page.getByLabel("Hackathon name")).toHaveAttribute("aria-invalid", "true");
  await expect.soft(page.getByLabel("Hackathon name")).toHaveAccessibleDescription("Name is required");
  await page.getByLabel("Hackathon name").fill(`${workspace.hackathon.name} recovered`);
  await page.getByRole("button", { name: "Create hackathon", exact: true }).click();
  await expect(page).toHaveURL(/\/hackathons\/[^/]+\/usecases$/);
});

test("interrupted contact save retains the draft, blocks duplicate submits and can be retried", async ({ page, db, workspace }) => {
  const route = `/hackathons/${workspace.hackathon.id}/contacts`;
  await page.goto(route);
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.getByLabel(/^Name\s*\*?$/).fill("Interrupted synthetic contact");
  await page.getByLabel("Notes", { exact: true }).fill("Keep this draft after a transport failure.");
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route(`**${route}`, async (request) => {
    if (request.request().method() !== "POST") return request.continue();
    requests++;
    await delayed;
    await request.abort("failed");
  });
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByLabel("Notes", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await page.getByRole("form", { name: "Add contact", exact: true }).evaluate((form: HTMLFormElement) => form.requestSubmit());
  release();
  await expect(page.getByRole("alert").filter({ hasText: "request could not be confirmed" })).toBeVisible();
  expect(requests).toBe(1);
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Keep this draft after a transport failure.");
  await expect(page.getByLabel("Notes", { exact: true })).toBeEnabled();
  await page.unroute(`**${route}`);
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByText("Interrupted synthetic contact", { exact: true })).toBeVisible();
  expect(await db.contact.count({ where: { hackathonId: workspace.hackathon.id, name: "Interrupted synthetic contact" } })).toBe(1);
});

test("mobile runbook validation explains completion fields and preserves evidence", async ({ page, workspace }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  const check = page.locator("details").first();
  await check.locator("summary").focus();
  await page.keyboard.press("Enter");
  await check.getByLabel("Status", { exact: true }).selectOption("Done");
  await check.getByLabel("Evidence, decision reference or blocker", { exact: true }).fill("Synthetic decision reference retained.");
  await check.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(check.getByRole("alert")).toContainText("Completion requires");
  await expect(check.getByLabel("Accountable owner", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(check.getByLabel("Accountable owner", { exact: true })).toHaveAccessibleDescription(/Completion requires/);
  await expect(check.getByLabel("Evidence, decision reference or blocker", { exact: true })).toHaveValue("Synthetic decision reference retained.");
  await expect(check.getByRole("button", { name: "Refresh latest", exact: true })).toHaveCount(0);
  await check.getByLabel("Accountable owner", { exact: true }).fill("Synthetic accountable owner");
  await check.getByLabel("Due / confirmation date", { exact: true }).fill("2027-10-03");
  await check.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(check.getByRole("status")).toHaveText("Saved.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("runbook conflict refresh confirms discard and preserves another check's unsaved draft", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  const first = page.locator("details").first();
  const second = page.locator("details").nth(1);
  await first.locator("summary").click();
  await first.getByLabel("Accountable owner", { exact: true }).fill("Original owner");
  await first.getByLabel("Due / confirmation date", { exact: true }).fill("2027-10-03");
  await first.getByLabel("Evidence, decision reference or blocker", { exact: true }).fill("Saved synthetic approval to review after scope changes.");
  await first.getByLabel("Status", { exact: true }).selectOption("Done");
  await first.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(first.getByRole("status")).toHaveText("Saved.");
  const saved = await db.runbookCheck.findFirstOrThrow({ where: { hackathonId: workspace.hackathon.id } });
  await second.locator("summary").click();
  await second.getByLabel("Evidence, decision reference or blocker", { exact: true }).fill("Other unsaved synthetic check.");
  await first.getByLabel("Accountable owner", { exact: true }).fill("My stale unsaved owner");
  await db.runbookCheck.update({ where: { id: saved.id }, data: { owner: "Concurrent saved owner", templateVersion: "", version: { increment: 1 } } });
  await first.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(first.getByRole("alert")).toContainText(/changed by someone else/i);
  page.once("dialog", (dialog) => dialog.dismiss());
  await first.getByRole("button", { name: "Refresh latest", exact: true }).click();
  await expect(first.getByLabel("Accountable owner", { exact: true })).toHaveValue("My stale unsaved owner");
  page.once("dialog", (dialog) => dialog.accept());
  await first.getByRole("button", { name: "Refresh latest", exact: true }).click();
  await expect(first.getByLabel("Accountable owner", { exact: true })).toHaveValue("Concurrent saved owner");
  await expect(first.getByRole("alert")).toContainText("Scope or methodology changed. Review the saved evidence");
  await expect(first.getByLabel("Evidence, decision reference or blocker", { exact: true })).toHaveValue("Saved synthetic approval to review after scope changes.");
  await expect(second.getByLabel("Evidence, decision reference or blocker", { exact: true })).toHaveValue("Other unsaved synthetic check.");
  await first.getByLabel("Accountable owner", { exact: true }).fill("Merged synthetic owner");
  await first.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(first.getByRole("status")).toHaveText("Saved.");
  await expect(first.getByText(/Scope or methodology changed/)).toHaveCount(0);
  expect((await db.runbookCheck.findUniqueOrThrow({ where: { id: saved.id } })).owner).toBe("Merged synthetic owner");
});

test("canvas conflict cancel keeps unsaved changes and confirmed refresh loads the latest", async ({ page, db, workspace }) => {
  await page.goto(`${casePath(workspace)}/edit`);
  await page.getByLabel("Description", { exact: true }).fill("Unsaved synthetic canvas work.");
  await db.useCase.update({ where: { id: workspace.useCase.id }, data: { title: "Concurrent canvas title", version: { increment: 1 } } });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /changed by someone else/i })).toBeVisible();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Unsaved synthetic canvas work.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Refresh latest", exact: true }).click();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Unsaved synthetic canvas work.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Refresh latest", exact: true }).click();
  await expect(page.getByLabel(/^Title\s*\*?$/)).toHaveValue("Concurrent canvas title");
});

test("direct-entry new hackathon cancel returns to the workspace list", async ({ page, workspace }) => {
  void workspace;
  await page.goto("/hackathons/new");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/hackathons$/);
});

test("viewer runbook controls stay read-only on mobile", async ({ page, context, workspace }) => {
  await signIn(context, workspace.viewer.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  const check = page.locator("details").first();
  await check.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(check.getByLabel("Status", { exact: true })).toBeDisabled();
  await expect(check.getByLabel("Evidence, decision reference or blocker", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save check", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New use case", exact: true })).toHaveCount(0);
});

test("runbook save keeps the check open with confirmation and supports a second save", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  const check = page.locator("details").first();
  await check.locator("summary").click();
  await check.getByLabel("Accountable owner", { exact: true }).fill("Synthetic readiness owner");
  await check.getByRole("button", { name: "Save check", exact: true }).click();
  await expect.poll(() => db.runbookCheck.count({ where: { hackathonId: workspace.hackathon.id } })).toBe(1);
  await expect(check.getByRole("status")).toContainText("Saved.");
  await expect(check.getByLabel("Accountable owner", { exact: true })).toBeVisible();
  await check.getByLabel("Accountable owner", { exact: true }).fill("Revised readiness owner");
  await check.getByRole("button", { name: "Save check", exact: true }).click();
  await expect.poll(async () => (await db.runbookCheck.findFirstOrThrow({ where: { hackathonId: workspace.hackathon.id } })).owner).toBe("Revised readiness owner");
});

test("contact validation preserves values and associates its error with the name field", async ({ page, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/contacts`);
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByLabel(/^Name\s*\*?$/)).toBeFocused();
  await page.getByLabel(/^Name\s*\*?$/).fill(" ");
  await page.getByLabel("Notes", { exact: true }).fill("Synthetic notes that must survive validation.");
  await expect(page.getByRole("button", { name: `Edit ${workspace.contact.name}`, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Synthetic notes that must survive validation.");
  await expect(page.getByLabel(/^Name\s*\*?$/)).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel(/^Name\s*\*?$/).fill("Recovered contact");
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByText("Recovered contact", { exact: true })).toBeVisible();
});

test("mobile settings validation preserves the dialog draft and keyboard recovery", async ({ page, db, workspace }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  const edit = page.getByRole("button", { name: "Edit", exact: true });
  await edit.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Edit workspace settings" });
  await dialog.getByLabel(/^Customer\s*\*?$/).fill("Synthetic customer kept on error.");
  await dialog.getByLabel(/^Name\s*\*?$/).fill(" ");
  await dialog.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Name is required");
  await expect(dialog.getByLabel(/^Name\s*\*?$/)).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByLabel(/^Customer\s*\*?$/)).toHaveValue("Synthetic customer kept on error.");
  await dialog.getByLabel(/^Name\s*\*?$/).fill("Recovered workspace name");
  await dialog.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(edit).toBeFocused();
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).customer).toBe("Synthetic customer kept on error.");
});

test("contact conflict refresh updates the saved list without destroying the editing draft", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/contacts`);
  await page.getByRole("button", { name: `Edit ${workspace.contact.name}`, exact: true }).click();
  await page.getByLabel(/^Name\s*\*?$/).fill("My retained contact draft");
  await page.getByLabel("Notes", { exact: true }).fill("Keep this unsaved contact evidence.");
  await db.contact.update({ where: { id: workspace.contact.id }, data: { name: "Concurrent saved contact", version: { increment: 1 } } });
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /changed by someone else/i })).toBeVisible();
  await page.getByRole("button", { name: "Refresh latest", exact: true }).click();
  await expect(page.getByText("Concurrent saved contact", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/^Name\s*\*?$/)).toHaveValue("My retained contact draft");
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Keep this unsaved contact evidence.");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit Concurrent saved contact", exact: true }).click();
  await expect(page.getByLabel(/^Name\s*\*?$/)).toHaveValue("Concurrent saved contact");
});

test("handoff dismissal and conflict cancellation keep unsaved package values", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/handoff?case=${workspace.useCase.id}`);
  await page.getByLabel("What was built", { exact: true }).fill("Original synthetic handoff");
  await page.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(page.getByText("Exit package saved.", { exact: true })).toBeVisible();
  await page.getByLabel("What was built", { exact: true }).fill("Unsaved revised synthetic handoff");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Close handoff panel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: workspace.useCase.title, exact: true })).toBeVisible();
  await expect(page.getByLabel("What was built", { exact: true })).toHaveValue("Unsaved revised synthetic handoff");
  await db.handoff.update({ where: { useCaseId: workspace.useCase.id }, data: { whatWasBuilt: "Concurrent saved package", version: { increment: 1 } } });
  await page.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /changed by someone else/i })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Refresh latest", exact: true }).click();
  await expect(page.getByLabel("What was built", { exact: true })).toHaveValue("Unsaved revised synthetic handoff");
  await expect(page.getByRole("button", { name: "Close use case", exact: true })).toBeDisabled();
});

test("edit route has a useful heading and search dismisses when keyboard focus leaves", async ({ page, workspace }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${casePath(workspace)}/edit`);
  await expect.soft(page.getByRole("heading", { level: 1 })).toHaveText("Edit use case");
  await expect.soft(page.getByLabel("Data sources", { exact: true })).toHaveAccessibleDescription(/Anonymized, synthetic or test data only/);
  const search = page.getByRole("searchbox");
  await search.fill(workspace.useCase.title);
  await expect(page.getByRole("link", { name: new RegExp(workspace.useCase.title) })).toBeVisible();
  await search.press("Shift+Tab");
  await expect(page.getByRole("link", { name: new RegExp(workspace.useCase.title) })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("shared controls have visible boundaries and opaque keyboard focus outlines", async ({ page, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases/new`);
  for (const control of [
    page.getByLabel(/^Title\s*\*?$/),
    page.getByLabel("Data sources", { exact: true }),
    page.getByLabel("Facilitator impact call", { exact: true }),
  ]) {
    await expect(control).toBeEnabled();
    await expect(control).toHaveCSS("border-top-color", "rgb(114, 131, 160)");
    await control.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("outline-width", "2px");
    await expect(control).toHaveCSS("outline-style", "solid");
    await expect(control).toHaveCSS("outline-color", "rgb(16, 43, 80)");
  }
});

test("Ready returns to Planning after a saved scope edit without losing attested evidence", async ({ page, db, workspace }) => {
  const template = runbookTemplateSchema.parse(parse(readFileSync(path.join(process.cwd(), "methodology", "runbook.yaml"), "utf8")));
  const startChecks = template.checks.filter((check) => check.gate === "Start");
  await db.runbookCheck.createMany({
    data: startChecks.map((check) => ({
      hackathonId: workspace.hackathon.id,
      templateId: check.id,
      templateVersion: template.version,
      status: "Done",
      owner: "Synthetic readiness owner",
      dueDate: new Date("2027-10-03T00:00:00.000Z"),
      evidence: `Synthetic attestation retained for ${check.id}.`,
      updatedBy: workspace.owner.id,
    })),
  });
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Ready");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit workspace settings" })).toBeHidden();
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Ready");
  await page.goto(`${casePath(workspace)}/edit`);
  await page.getByLabel("Description", { exact: true }).fill("Changed synthetic scope requires renewed readiness review.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}${casePath(workspace)}`);
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Planning");
  const checks = await db.runbookCheck.findMany({ where: { hackathonId: workspace.hackathon.id } });
  expect(checks).toHaveLength(startChecks.length);
  for (const check of checks) {
    expect(check).toMatchObject({
      templateVersion: "", status: "Done", version: 1,
      evidence: `Synthetic attestation retained for ${check.templateId}.`,
    });
  }
  await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
  await expect(page.getByText(`${startChecks.length} start checks remaining`, { exact: true })).toBeVisible();
  const first = page.locator("details").first();
  await first.locator("summary").click();
  await expect(first.getByRole("alert")).toContainText("Scope or methodology changed. Review the saved evidence");
});

test("Closed allows post-event follow-up while Archived requires restore before editing", async ({ page, db, workspace }) => {
  await db.hackathon.update({ where: { id: workspace.hackathon.id }, data: { status: "Closed" } });
  await db.useCase.update({ where: { id: workspace.useCase.id }, data: { status: "Closed" } });
  await db.handoff.create({
    data: {
      useCaseId: workspace.useCase.id, whatWasBuilt: "Synthetic completed demonstration",
      businessOwner: "Synthetic business owner", portfolioDecision: "CustomerLed",
      nextMilestone: "Synthetic pilot follow-up", nextMilestoneDate: new Date("2027-10-12T00:00:00.000Z"),
    },
  });
  await page.goto(`/hackathons/${workspace.hackathon.id}/handoff?case=${workspace.useCase.id}`);
  for (const label of ["What was built", "Demo or blocker", "Business owner"]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("readonly", "");
  }
  await expect(page.getByLabel("Portfolio decision", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Outcome demonstrated", { exact: true })).toBeEnabled();
  await page.getByLabel("Outcome demonstrated", { exact: true }).fill("Synthetic measured follow-up: saved 20 minutes per case in the pilot week.");
  await page.getByLabel("Technical owner", { exact: true }).fill("Synthetic follow-up technical owner");
  await page.getByLabel("Next action", { exact: true }).fill("Review actual pilot value");
  await page.getByLabel("Next action date", { exact: true }).fill("2027-10-19");
  await page.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(page.getByText("Exit package saved.", { exact: true })).toBeVisible();
  expect(await db.handoff.findUniqueOrThrow({ where: { useCaseId: workspace.useCase.id } })).toMatchObject({
    whatWasBuilt: "Synthetic completed demonstration", businessOwner: "Synthetic business owner",
    portfolioDecision: "CustomerLed", technicalOwner: "Synthetic follow-up technical owner",
    outcomeDemonstrated: "Synthetic measured follow-up: saved 20 minutes per case in the pilot week.",
    nextMilestone: "Review actual pilot value", nextMilestoneDate: new Date("2027-10-19T00:00:00.000Z"),
  });
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Closed");
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Archived");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit workspace settings" })).toBeHidden();
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Archived");
  await page.goto(`/hackathons/${workspace.hackathon.id}/handoff?case=${workspace.useCase.id}`);
  await expect(page.getByLabel("Outcome demonstrated", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save exit package", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog").getByText("This event is archived.", { exact: false })).toBeVisible();
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("Planning");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit workspace settings" })).toBeHidden();
  expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Planning");
  await page.goto(`${casePath(workspace)}/edit`);
  await page.getByLabel("Description", { exact: true }).fill("Recovered synthetic scope after reopening.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Reopen.*use case/i })).toBeVisible();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Recovered synthetic scope after reopening.");
  await page.getByLabel("Status", { exact: true }).selectOption("Draft");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}${casePath(workspace)}`);
  expect(await db.useCase.findUniqueOrThrow({ where: { id: workspace.useCase.id } })).toMatchObject({
    status: "Draft", description: "Recovered synthetic scope after reopening.",
  });
});

test("frozen workspace controls are consistent while Closed follow-up remains editable", async ({ page, context, db, workspace }) => {
  const template = runbookTemplateSchema.parse(parse(readFileSync(path.join(process.cwd(), "methodology", "runbook.yaml"), "utf8")));
  const followUp = template.checks.find((check) => check.stage === "Follow-up" && check.gate === "None")!;
  for (const status of ["Closed", "Archived"]) {
    await test.step(status, async () => {
      await db.hackathon.update({ where: { id: workspace.hackathon.id }, data: { status } });
      await page.goto(`/hackathons/${workspace.hackathon.id}/contacts`);
      await expect(page.getByRole("link", { name: "New use case", exact: true })).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: `${status} workspace:` })).toBeVisible();
      await expect(page.getByRole("button", { name: /^(Add contact|Edit |Remove )/ })).toHaveCount(0);
      await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
      await expect(page.getByRole("link", { name: "New use case", exact: true })).toHaveCount(0);
      await expect(page.locator('a[href$="/edit"]')).toHaveCount(0);
      await page.goto(`/hackathons/${workspace.hackathon.id}/usecases/new`);
      await expect(page.getByRole("heading", { name: "Use case creation paused", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open settings", exact: true })).toHaveAttribute("href", `/hackathons/${workspace.hackathon.id}/settings`);
      await expect(page.getByRole("button", { name: "Create use case", exact: true })).toHaveCount(0);
      await page.goto(`${casePath(workspace)}/edit`);
      await expect(page.getByRole("heading", { name: "Use case editing paused", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open settings", exact: true })).toHaveAttribute("href", `/hackathons/${workspace.hackathon.id}/settings`);
      await expect(page.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(0);
      await page.goto(`/hackathons/${workspace.hackathon.id}/runbook`);
      const startCheck = page.locator("details").first();
      await startCheck.locator("summary").click();
      await expect(startCheck.getByLabel("Status", { exact: true })).toBeDisabled();
      await expect(startCheck.getByRole("button", { name: "Save check", exact: true })).toHaveCount(0);
      const followUpCheck = page.locator("details").filter({ hasText: followUp.title });
      await followUpCheck.locator("summary").click();
      if (status === "Closed") {
        await expect(followUpCheck.getByLabel("Evidence, decision reference or blocker", { exact: true })).toBeEnabled();
        await followUpCheck.getByLabel("Evidence, decision reference or blocker", { exact: true }).fill("Actual synthetic post-event follow-up.");
        await followUpCheck.getByRole("button", { name: "Save check", exact: true }).click();
        await expect(followUpCheck.getByRole("status")).toHaveText("Saved.");
      } else {
        await expect(followUpCheck.getByLabel("Evidence, decision reference or blocker", { exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Save check", exact: true })).toHaveCount(0);
      }
      await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
      await expect(page.getByRole("button", { name: "Invite", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Edit workspace settings" });
      await expect(settings.getByLabel(/^Name\s*\*?$/)).toHaveAttribute("readonly", "");
      await expect(settings.getByRole("button", { name: "Save settings", exact: true })).toBeDisabled();
      await settings.getByLabel("Status", { exact: true }).selectOption("Planning");
      await expect(settings.getByLabel(/^Name\s*\*?$/)).not.toHaveAttribute("readonly", "");
      await settings.getByRole("button", { name: "Cancel", exact: true }).click();
    });
  }
  await signIn(context, workspace.contributor.id);
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
});
