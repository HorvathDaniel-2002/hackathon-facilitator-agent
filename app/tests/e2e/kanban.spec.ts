import { test, expect, signIn } from "./fixtures";

test("stage and route are independent, persist on reload, and share the handoff record", async ({ page, db, workspace }) => {
  const boardPath = `/hackathons/${workspace.hackathon.id}/usecases`;
  await page.goto(boardPath);
  await page.getByLabel(`Move or route ${workspace.useCase.code}`, { exact: true }).click();
  const move = page.getByRole("combobox", { name: `Move ${workspace.useCase.code} to stage`, exact: true });
  await expect(move).toBeEnabled();
  for (const label of ["Intake", "Assessing", "Building", "Pilot", "In production", "Parked"]) {
    await expect(page.getByRole("region", { name: `${label} column`, exact: true })).toBeVisible();
  }
  await move.selectOption("Assessing");
  await expect.poll(async () => (await db.handoff.findUnique({ where: { useCaseId: workspace.useCase.id } }))?.progressStage).toBe("Assessing");
  await expect(page.getByRole("region", { name: "Assessing column", exact: true }).getByRole("article")).toBeVisible();
  await page.getByLabel(`Move or route ${workspace.useCase.code}`, { exact: true }).click();
  await expect(move).toHaveValue("Assessing");
  await expect(move).toBeEnabled();
  await page.getByRole("combobox", { name: `Delivery route for ${workspace.useCase.code}`, exact: true }).selectOption("CopilotCowork");
  await expect.poll(async () => (await db.handoff.findUniqueOrThrow({ where: { useCaseId: workspace.useCase.id } })).deliveryRoute).toBe("CopilotCowork");
  await expect(move).toBeEnabled();
  await page.getByLabel("Group by", { exact: true }).selectOption("route");
  await expect(page).toHaveURL(/group=route/);
  const routeColumn = page.getByRole("region", { name: "Copilot / Cowork column", exact: true });
  await expect(routeColumn.getByRole("article")).toContainText(workspace.useCase.title);
  await page.reload();
  await expect(page.getByLabel("Group by", { exact: true })).toHaveValue("route");
  await routeColumn.getByRole("button", { name: /^Open handoff for/ }).click();
  const panel = page.getByRole("dialog", { name: workspace.useCase.title, exact: true });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`case=${workspace.useCase.id}`));
  await expect(panel.getByLabel("Progress stage", { exact: true })).toHaveValue("Assessing");
  await expect(panel.getByLabel("Delivery route", { exact: true })).toHaveValue("CopilotCowork");
  await panel.getByLabel("Next action", { exact: true }).fill("Confirm the pilot sponsor");
  await panel.getByLabel("Next action date", { exact: true }).fill("2027-10-07");
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Exit package saved");
  await panel.getByRole("link", { name: "Handoff overview", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/handoff\\?case=${workspace.useCase.id}&group=route`));
  await expect(panel.getByLabel("Next action", { exact: true })).toHaveValue("Confirm the pilot sponsor");
  await panel.getByRole("link", { name: "Open on board", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/usecases\\?case=${workspace.useCase.id}&group=route`));
  await expect(panel.getByLabel("Next action date", { exact: true })).toHaveValue("2027-10-07");
  expect(await db.handoff.count({ where: { useCaseId: workspace.useCase.id } })).toBe(1);
  expect((await db.useCase.findUniqueOrThrow({ where: { id: workspace.useCase.id } })).status).toBe("Draft");
});

test("production and CAF submission require a named owner and reference, without inferred deployment", async ({ page, db, workspace }) => {
  await db.useCase.update({ where: { id: workspace.useCase.id }, data: { businessOwner: null } });
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
  await page.getByLabel(`Move or route ${workspace.useCase.code}`, { exact: true }).click();
  await page.getByRole("combobox", { name: `Move ${workspace.useCase.code} to stage`, exact: true }).selectOption("InProduction");
  const panel = page.getByRole("dialog", { name: workspace.useCase.title, exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Progress stage", { exact: true })).toHaveValue("InProduction");
  expect(await db.handoff.findUnique({ where: { useCaseId: workspace.useCase.id } })).toBeNull();
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("business owner");
  await expect(panel.getByLabel(/^Production evidence \/ reference\s*\*?$/)).toHaveAttribute("aria-invalid", "true");
  await panel.getByLabel(/^Business owner\s*\*?$/).fill("Synthetic accountable owner");
  await panel.getByLabel(/^Production evidence \/ reference\s*\*?$/).fill("ROLL-2027-101, approved external rollout");
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Exit package saved");
  const production = await db.handoff.findUniqueOrThrow({ where: { useCaseId: workspace.useCase.id } });
  expect(production).toMatchObject({
    progressStage: "InProduction", productionReference: "ROLL-2027-101, approved external rollout",
    businessOwner: "Synthetic accountable owner", cafStatus: "NotSubmitted", deliveryRoute: "Unassigned",
  });
  await panel.getByLabel("Delivery route", { exact: true }).selectOption("CAF");
  await panel.getByLabel("CAF submission status", { exact: true }).selectOption("Submitted");
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("CAF submission reference");
  expect((await db.handoff.findUniqueOrThrow({ where: { useCaseId: workspace.useCase.id } })).cafStatus).toBe("NotSubmitted");
  await panel.getByLabel(/^CAF submission reference\s*\*?$/).fill("CAF-EXT-2027-42");
  await panel.getByLabel("CAF submitted on", { exact: true }).fill("2027-10-08");
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Exit package saved");
  await panel.getByRole("button", { name: "Close handoff panel", exact: true }).click();
  await expect(page.getByRole("region", { name: "In production column", exact: true })).toContainText("Submitted to CAF");
  expect((await db.useCase.findUniqueOrThrow({ where: { id: workspace.useCase.id } })).status).toBe("Draft");
  await page.reload();
  await expect(page.getByRole("region", { name: "In production column", exact: true })).toContainText("Submitted to CAF");
});

test("drawer traps focus, guards unsaved Escape and returns focus to the card", async ({ page, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
  const trigger = page.getByRole("button", { name: /^Open handoff for/ });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: workspace.useCase.title, exact: true });
  await panel.getByRole("button", { name: "Close handoff panel", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(await panel.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await panel.getByLabel("Next action", { exact: true }).fill("Unsaved action stays here");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Next action", { exact: true })).toHaveValue("Unsaved action stays here");
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).not.toHaveURL(/[?&]case=/);
});

test("native card dragging records a stage only after the server accepts it", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
  const card = page.getByRole("article", { name: `${workspace.useCase.code}: ${workspace.useCase.title}`, exact: true });
  await expect(card).toHaveAttribute("draggable", "true");
  await card.dragTo(page.getByRole("region", { name: "Assessing column", exact: true }));
  await expect.poll(async () => (await db.handoff.findUnique({ where: { useCaseId: workspace.useCase.id } }))?.progressStage).toBe("Assessing");
  await expect(page.getByRole("region", { name: "Assessing column", exact: true }).getByRole("article")).toBeVisible();
});

test("browser Back preserves a dirty drawer unless its discard warning is accepted", async ({ page, db, workspace }) => {
  const boardPath = `/hackathons/${workspace.hackathon.id}/usecases?group=route`;
  await page.goto(boardPath);
  const trigger = page.getByRole("button", { name: /^Open handoff for/ });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: workspace.useCase.title, exact: true });
  await panel.getByLabel("Next action", { exact: true }).fill("Keep this draft on browser Back");
  await expect(panel.getByText("Unsaved changes", { exact: true })).toBeVisible();
  const openUrl = page.url();
  const warning = page.waitForEvent("dialog");
  await page.evaluate(() => window.history.back());
  await (await warning).dismiss();
  await expect(page).toHaveURL(openUrl);
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Next action", { exact: true })).toHaveValue("Keep this draft on browser Back");
  expect(await db.handoff.findUnique({ where: { useCaseId: workspace.useCase.id } })).toBeNull();
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${boardPath.replace("?", "\\?")}$`));
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.goForward();
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Next action", { exact: true })).toHaveValue("");
});

test("browsers without traversal cancellation recover an unsaved handoff on reopening", async ({ page, db, workspace }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "navigation", { configurable: true, value: undefined });
  });
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
  const trigger = page.getByRole("button", { name: /^Open handoff for/ });
  await trigger.click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Next action", { exact: true }).fill("Recover the unsaved next action");
  await expect(panel.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(panel).toBeHidden();
  await trigger.click();
  await expect(panel.getByLabel("Next action", { exact: true })).toHaveValue("Recover the unsaved next action");
  await expect(panel.getByRole("status")).toContainText("Recovered your unsaved handoff draft");
  expect(await db.handoff.findUnique({ where: { useCaseId: workspace.useCase.id } })).toBeNull();
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Exit package saved.");
});

test("closure checks the saved exit package and engagement proposals never select a delivery route", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/handoff?case=${workspace.useCase.id}`);
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Exit package saved");
  await panel.getByRole("button", { name: "Close use case", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText(/required|Cannot close/i);
  await panel.getByLabel("Portfolio decision", { exact: true }).selectOption("CustomerLed");
  await panel.getByLabel("Next action", { exact: true }).fill("Confirm delivery ownership");
  await panel.getByLabel("Next action date", { exact: true }).fill("2027-10-09");
  await expect(panel.getByRole("button", { name: "Close use case", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Suggest", exact: true }).click();
  await expect(panel.getByText("A proposal, not a decision or entitlement.", { exact: false })).toBeVisible();
  await expect(panel.getByLabel("Delivery route", { exact: true })).toHaveValue("Unassigned");
  await expect(panel.getByLabel("CAF submission status", { exact: true })).toHaveValue("NotSubmitted");
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Exit package saved");
  await panel.getByRole("button", { name: "Close use case", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Use case closed");
  await expect(panel.getByLabel("Progress stage", { exact: true })).toHaveValue("Intake");
  expect((await db.useCase.findUniqueOrThrow({ where: { id: workspace.useCase.id } })).status).toBe("Closed");
});

test("stale handoff saves keep the draft and stale board moves never relocate a card", async ({ page, context, db, workspace }) => {
  await db.handoff.create({ data: { useCaseId: workspace.useCase.id, businessOwner: "Synthetic owner", progressStage: "Assessing" } });
  const other = await context.newPage();
  const staleBoard = await context.newPage();
  const boardPath = `/hackathons/${workspace.hackathon.id}/usecases`;
  try {
    await page.goto(`${boardPath}?case=${workspace.useCase.id}`);
    await other.goto(`${boardPath}?case=${workspace.useCase.id}`);
    await staleBoard.goto(boardPath);
    const firstPanel = page.getByRole("dialog");
    const stalePanel = other.getByRole("dialog");
    await firstPanel.getByLabel("Next action", { exact: true }).fill("Newer saved action");
    await firstPanel.getByRole("button", { name: "Save exit package", exact: true }).click();
    await expect(firstPanel.getByRole("status")).toContainText("Exit package saved");
    await stalePanel.getByLabel("Next action", { exact: true }).fill("Keep my unsaved action");
    await stalePanel.getByRole("button", { name: "Save exit package", exact: true }).click();
    await expect(stalePanel.getByRole("alert")).toContainText(/changed|latest|conflict/i);
    await expect(stalePanel.getByLabel("Next action", { exact: true })).toHaveValue("Keep my unsaved action");
    await staleBoard.getByLabel(`Move or route ${workspace.useCase.code}`, { exact: true }).click();
    await staleBoard.getByRole("combobox", { name: `Move ${workspace.useCase.code} to stage`, exact: true }).selectOption("Building");
    await expect(staleBoard.getByRole("alert").filter({ hasText: /changed|latest|conflict/i })).toBeVisible();
    await expect(staleBoard.getByRole("region", { name: "Assessing column", exact: true }).getByRole("article")).toBeVisible();
    expect(await db.handoff.findUniqueOrThrow({ where: { useCaseId: workspace.useCase.id } })).toMatchObject({
      nextMilestone: "Newer saved action", progressStage: "Assessing",
    });
    other.once("dialog", (dialog) => dialog.accept());
    await stalePanel.getByRole("button", { name: "Refresh latest", exact: true }).click();
    await expect(stalePanel.getByLabel("Next action", { exact: true })).toHaveValue("Newer saved action");
  } finally {
    await other.close();
    await staleBoard.close();
  }
});

test("unknown and foreign deep links never fall back to another use case", async ({ page, db, workspace }) => {
  const foreignEvent = await db.hackathon.create({ data: { name: "Foreign synthetic event", customer: "Other customer" } });
  const foreignCase = await db.useCase.create({
    data: { hackathonId: foreignEvent.id, code: "FOREIGN-01", title: "Do not expose this foreign card" },
  });
  for (const path of ["usecases", "handoff"]) {
    for (const id of ["unknown-case", foreignCase.id]) {
      await page.goto(`/hackathons/${workspace.hackathon.id}/${path}?case=${id}&group=route`);
      await expect(page.getByRole("alert").filter({ hasText: "Use case not found in this workspace" })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByText(foreignCase.title, { exact: true })).toHaveCount(0);
    }
  }
});

test("viewer and archived workspaces can read, but cannot mutate the shared handoff", async ({ page, context, db, workspace }) => {
  await signIn(context, workspace.viewer.id);
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
  await expect(page.getByRole("combobox", { name: `Move ${workspace.useCase.code} to stage`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Open handoff for/ }).click();
  await expect(page.getByRole("dialog").getByLabel("Progress stage", { exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Save exit package", exact: true })).toHaveCount(0);
  await signIn(context, workspace.owner.id);
  await db.hackathon.update({ where: { id: workspace.hackathon.id }, data: { status: "Archived" } });
  await page.goto(`/hackathons/${workspace.hackathon.id}/handoff?case=${workspace.useCase.id}`);
  await expect(page.getByRole("dialog").getByLabel("Next action", { exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Save exit package", exact: true })).toHaveCount(0);
  expect(await db.handoff.findUnique({ where: { useCaseId: workspace.useCase.id } })).toBeNull();
});

test("closed event protects recorded fields but allows evidence-backed follow-up", async ({ page, db, workspace }) => {
  await db.handoff.create({ data: {
    useCaseId: workspace.useCase.id, businessOwner: "Synthetic recorded owner", portfolioDecision: "CustomerLed",
    whatWasBuilt: "Recorded demo", demoOrBlocker: "Recorded demo link", nextMilestone: "Follow up", nextMilestoneDate: new Date("2027-10-06"),
    progressStage: "Building",
  } });
  await db.useCase.update({ where: { id: workspace.useCase.id }, data: { status: "Closed" } });
  await db.hackathon.update({ where: { id: workspace.hackathon.id }, data: { status: "Closed" } });
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases?case=${workspace.useCase.id}`);
  const panel = page.getByRole("dialog");
  await expect(panel.getByLabel("Business owner", { exact: true })).toHaveAttribute("readonly", "");
  await expect(panel.getByLabel("What was built", { exact: true })).toHaveAttribute("readonly", "");
  await expect(panel.getByLabel("Demo or blocker", { exact: true })).toHaveAttribute("readonly", "");
  await expect(panel.getByLabel("Portfolio decision", { exact: true })).toBeDisabled();
  await panel.getByLabel("Progress stage", { exact: true }).selectOption("Pilot");
  await panel.getByLabel("Outcome demonstrated", { exact: true }).fill("Follow-up: response time reduced in an external pilot.");
  await panel.getByLabel("Next action", { exact: true }).fill("Review pilot results");
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Exit package saved");
  expect(await db.handoff.findUniqueOrThrow({ where: { useCaseId: workspace.useCase.id } })).toMatchObject({
    businessOwner: "Synthetic recorded owner", portfolioDecision: "CustomerLed", whatWasBuilt: "Recorded demo",
    progressStage: "Pilot", nextMilestone: "Review pilot results",
  });
});

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`all desktop headers fit without horizontal scrolling at ${viewport.width}x${viewport.height}`, async ({ page, db, workspace }, testInfo) => {
    const stages = ["Intake", "Assessing", "Building", "Pilot", "InProduction", "Parked"];
    const routes = ["Unassigned", "CopilotCowork", "CopilotStudio", "CustomBuild", "CAF"];
    await db.useCase.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        hackathonId: workspace.hackathon.id, code: `LAYOUT-${index + 1}`,
        title: `Synthetic department workflow assistant with a descriptive title ${index + 1}`,
        businessOwner: "Synthetic department accountable owner",
      })),
    });
    const useCases = await db.useCase.findMany({ where: { hackathonId: workspace.hackathon.id }, orderBy: { code: "asc" } });
    await db.handoff.createMany({
      data: useCases.map((useCase, index) => ({
        useCaseId: useCase.id, progressStage: stages[index % stages.length], deliveryRoute: routes[index % routes.length],
        businessOwner: "Synthetic department accountable owner",
        nextMilestone: "Confirm the next external delivery review and accountable delivery team",
        nextMilestoneDate: new Date("2027-10-09"), productionReference: "EXTERNAL-ROLLOUT-101",
      })),
    });
    await page.setViewportSize(viewport);
    await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
    for (const group of ["progress", "route"]) {
      await page.getByLabel("Group by", { exact: true }).selectOption(group);
      const board = page.getByRole("region", { name: `Kanban board grouped by ${group === "route" ? "delivery route" : "progress"}`, exact: true });
      const headers = board.getByRole("heading", { level: 3 });
      await expect(headers).toHaveCount(group === "route" ? 5 : 6);
      expect(await board.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const boxes = await headers.evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(viewport.width);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeLessThan(350);
        expect(box.bottom).toBeLessThanOrEqual(viewport.height);
      }
      expect(Math.max(...boxes.map((box) => box.top)) - Math.min(...boxes.map((box) => box.top))).toBeLessThan(2);
      for (const header of await headers.all()) await expect(header).toBeInViewport({ ratio: 1 });
      await expect(board.getByRole("article")).toHaveCount(11);
      const lists = board.getByRole("list");
      for (const list of await lists.all()) {
        const metrics = await list.evaluate((element) => ({
          top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom,
          overflowY: getComputedStyle(element).overflowY, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        }));
        expect(metrics.bottom).toBeLessThanOrEqual(viewport.height);
        expect(metrics.overflowY).toBe("auto");
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      }
      await testInfo.attach(`${group}-${viewport.width}`, { body: await page.screenshot(), contentType: "image/png" });
    }
  });
}

for (const width of [640, 768, 1024]) {
  test(`tablet columns wrap into visible rows without horizontal overflow at ${width}px`, async ({ page, workspace }) => {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
    const board = page.getByRole("region", { name: "Kanban board grouped by progress", exact: true });
    await expect(board.getByRole("heading", { level: 3 })).toHaveCount(6);
    const grid = board.locator(":scope > div");
    expect(await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(width < 768 ? 2 : 3);
    expect(await board.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("phone shows every stage vertically without horizontal overflow and keeps the drawer usable", async ({ page, workspace }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
  const board = page.getByRole("region", { name: "Kanban board grouped by progress", exact: true });
  await expect(board).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await board.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const stage of ["Intake", "Assessing", "Building", "Pilot", "In production", "Parked"]) {
    const heading = board.getByRole("heading", { name: stage, exact: true });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeInViewport({ ratio: 1 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /^Open handoff for/ }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await panel.getByLabel("Next action", { exact: true }).fill("Mobile follow-up");
  await panel.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Exit package saved");
});
