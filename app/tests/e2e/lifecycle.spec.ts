import { test, expect, casePath, evaluateInBrowser, signIn, baseURL } from "./fixtures";

test("@smoke create and edit a workspace through settings", async ({ page, db, workspace }) => {
  const name = `${workspace.hackathon.name} created in browser`;
  await page.goto("/hackathons/new");
  await page.getByLabel("Hackathon name").fill(name);
  await page.getByLabel(/^Customer\s*\*?$/).fill("Synthetic browser customer");
  await expect(page.getByLabel("Business objective")).toHaveCount(0);
  await expect(page.getByLabel("Start date")).toHaveCount(0);
  await page.getByRole("button", { name: "Create hackathon", exact: true }).click();
  await expect(page).toHaveURL(/\/hackathons\/[^/]+\/usecases$/);
  const id = new URL(page.url()).pathname.split("/")[2];
  expect((await db.hackathon.findUniqueOrThrow({ where: { id } })).name).toBe(name);
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel(/^Name\s*\*?$/).fill(`${name} revised`);
  await page.getByLabel(/^Customer\s*\*?$/).fill("Revised synthetic customer");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit workspace settings", exact: true })).toBeHidden();
  await page.reload();
  await expect(page.getByText(`${name} revised`, { exact: true }).first()).toBeVisible();
  expect(await db.hackathon.findUniqueOrThrow({ where: { id } })).toMatchObject({
    name: `${name} revised`, customer: "Revised synthetic customer", version: 1,
  });
});

test("@smoke create and edit a use case with manual impact unset", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases/new`);
  await page.getByLabel(/^Title\s*\*?$/).fill("Browser-created synthetic case");
  await page.getByRole("button", { name: "Create use case", exact: true }).click();
  await expect(page).toHaveURL(/\/usecases\/(?!new$)[^/]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const created = await db.useCase.findUniqueOrThrow({ where: { id } });
  expect(created.manualImpact).toBeNull();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByLabel(/^Title\s*\*?$/).fill("Revised synthetic intake");
  await page.getByLabel("Business owner", { exact: true }).fill("Browser owner");
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page).toHaveURL(new RegExp(`/usecases/${id}$`));
  await page.reload();
  await expect(page.getByText("Browser owner", { exact: true })).toBeVisible();
  expect(await db.useCase.findUniqueOrThrow({ where: { id } })).toMatchObject({
    title: "Revised synthetic intake", businessOwner: "Browser owner", manualImpact: null,
  });
});

test("@smoke contacts can be created and deleted in the UI", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/contacts`);
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await page.getByLabel(/^Name\s*\*?$/).fill("Browser contact");
  await page.getByLabel("Email", { exact: true }).fill("browser@example.test");
  await page.getByLabel(/^Role\s*\*?$/).selectOption("Mentor");
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByText("Browser contact", { exact: true })).toBeVisible();
  const contact = await db.contact.findFirstOrThrow({
    where: { hackathonId: workspace.hackathon.id, name: "Browser contact" },
  });
  expect(contact).toMatchObject({ email: "browser@example.test", roleType: "Mentor" });
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /^(Remove|Delete) Browser contact$/ }).click();
  await expect(page.getByText("Browser contact", { exact: true })).toBeHidden();
  expect(await db.contact.findUnique({ where: { id: contact.id } })).toBeNull();
});

test("contact editing and build-team assignment persist", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/contacts`);
  await page.getByRole("button", { name: `Edit ${workspace.contact.name}`, exact: true }).click();
  await page.getByLabel(/^Name\s*\*?$/).fill("Revised owner");
  await page.getByRole("button", { name: /Save contact/ }).click();
  await expect(page.getByText("Revised owner", { exact: true })).toBeVisible();
  expect((await db.contact.findUniqueOrThrow({ where: { id: workspace.contact.id } })).name).toBe("Revised owner");
  await page.goto(casePath(workspace));
  const team = page.locator("section").filter({ has: page.getByRole("heading", { name: "Build team", exact: true }) });
  await expect(team.getByText("Revised owner", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Assign contact", exact: true }).click();
  const sponsor = await db.contact.findFirstOrThrow({
    where: { hackathonId: workspace.hackathon.id, roleType: "Sponsor" },
  });
  await page.getByLabel(/^Contact\s*\*?$/).selectOption(sponsor.id);
  await page.getByLabel(/^Party\s*\*?$/).selectOption("Customer");
  await page.getByRole("button", { name: "Save assignment", exact: true }).click();
  await expect.poll(() => db.teamMember.count({ where: { useCaseId: workspace.useCase.id } })).toBe(2);
  await page.getByRole("button", { name: "Edit assignment for Synthetic sponsor", exact: true }).click();
  await page.getByLabel(/^Party\s*\*?$/).selectOption("Partner");
  await page.getByLabel("Responsibility", { exact: true }).fill("Synthetic pilot sponsor");
  await page.getByRole("button", { name: "Save assignment", exact: true }).click();
  await expect.poll(async () => (await db.teamMember.findUniqueOrThrow({
    where: { useCaseId_contactId: { useCaseId: workspace.useCase.id, contactId: sponsor.id } },
  })).party).toBe("Partner");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove assignment for Synthetic sponsor", exact: true }).click();
  await expect.poll(() => db.teamMember.count({ where: { useCaseId: workspace.useCase.id } })).toBe(1);
  expect(await db.contact.findUnique({ where: { id: sponsor.id } })).not.toBeNull();
  await page.goto(`/hackathons/${workspace.hackathon.id}/contacts`);
  await page.getByRole("button", { name: "Remove Revised owner", exact: true }).click();
  await expect.poll(() => db.teamMember.count({ where: { useCaseId: workspace.useCase.id } })).toBe(0);
});

test("@smoke retired workspace and milestone URLs open the use-case board", async ({ page, workspace }) => {
  for (const suffix of ["", "/milestones"]) {
    await page.goto(`/hackathons/${workspace.hackathon.id}${suffix}`);
    await expect(page).toHaveURL(new RegExp(`/hackathons/${workspace.hackathon.id}/usecases$`));
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^(Charter|Milestones)$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Generate plan|Add milestone/ })).toHaveCount(0);
  }
});

test("@smoke partial handoff saves without a decision and closing uses only saved fields", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/handoff?case=${workspace.useCase.id}`);
  await page.getByLabel("What was built", { exact: true }).fill("Synthetic read-only demo");
  await page.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(page.getByText("Exit package saved.", { exact: true })).toBeVisible();
  expect(await db.handoff.findUniqueOrThrow({ where: { useCaseId: workspace.useCase.id } }))
    .toMatchObject({ whatWasBuilt: "Synthetic read-only demo", portfolioDecision: null });

  await page.getByRole("button", { name: "Close use case", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /businessOwner|portfolioDecision|nextMilestone|business owner|portfolio decision|next milestone/i })).toBeVisible();
  expect((await db.useCase.findUniqueOrThrow({ where: { id: workspace.useCase.id } })).status).not.toBe("Closed");

  await page.getByLabel("Business owner", { exact: true }).fill("Saved business owner");
  await page.getByLabel("Technical owner", { exact: true }).fill("Saved technical owner");
  await page.getByLabel("Delivery owner", { exact: true }).fill("Saved delivery owner");
  await page.getByLabel("Portfolio decision", { exact: true }).selectOption("CustomerLed");
  await page.getByLabel(/^Next action\s*\*?$/).fill("Synthetic pilot review");
  await page.getByLabel(/^Next action date\s*\*?$/).fill("2027-10-12");
  await expect(page.getByRole("button", { name: "Close use case", exact: true })).toBeDisabled();
  expect((await db.useCase.findUniqueOrThrow({ where: { id: workspace.useCase.id } })).status).not.toBe("Closed");
  await page.getByRole("button", { name: "Save exit package", exact: true }).click();
  await expect(page.getByText("Exit package saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Business owner", { exact: true })).toHaveValue("Saved business owner");
  await page.getByRole("button", { name: "Close use case", exact: true }).click();
  await expect(page.getByText("Use case closed.", { exact: true })).toBeVisible();
  expect((await db.useCase.findUniqueOrThrow({ where: { id: workspace.useCase.id } })).status).toBe("Closed");
});

test("Viewer sees no workspace mutations and guide API refuses writes", async ({ page, context, db, workspace }) => {
  await signIn(context, workspace.viewer.id);
  await page.goto(casePath(workspace));
  await expect(page.getByRole("button", { name: /Run evaluator|Generate guide|Override/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  await expect.soft(page.getByRole("link", { name: "New use case", exact: true })).toHaveCount(0);
  const result = await context.request.post("/api/build-guide", {
    data: { hackathonId: workspace.hackathon.id, useCaseId: workspace.useCase.id },
    headers: { Origin: baseURL },
  });
  expect(result.status()).toBe(403);
  expect(await db.buildGuide.count({ where: { useCaseId: workspace.useCase.id } })).toBe(0);
  for (const [section, forbidden] of [
    ["contacts", /Add contact|Remove |Edit /],
    ["settings", /^(Edit|Invite)$/],
    [`handoff?case=${workspace.useCase.id}`, /Save exit package|Close use case/],
  ] as const) {
    await page.goto(`/hackathons/${workspace.hackathon.id}/${section}`);
    await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
  }
});

test("non-members cannot read another workspace, its use cases or search entries", async ({ page, context, db, workspace }) => {
  const secret = await db.hackathon.create({
    data: {
      name: `Private-${workspace.hackathon.id}`, customer: "Private synthetic customer",
      useCases: { create: { code: "SECRET-01", title: "Private synthetic invention" } },
      memberships: { create: { userId: workspace.owner.id, role: "Owner" } },
    },
    include: { useCases: true },
  });
  await signIn(context, workspace.viewer.id);
  for (const route of [
    `/hackathons/${secret.id}`,
    `/hackathons/${secret.id}/contacts`,
    `/hackathons/${secret.id}/usecases/${secret.useCases[0].id}`,
    `/hackathons/${workspace.hackathon.id}/usecases/${secret.useCases[0].id}`,
  ]) {
    const response = await page.goto(route);
    expect.soft(response?.status(), route).toBe(404);
    await expect(page.getByText(secret.name, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Private synthetic invention", { exact: true })).toHaveCount(0);
  }
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases`);
  const search = page.getByRole("searchbox");
  await search.fill("Private synthetic invention");
  await expect(page.getByText("No matches", { exact: true })).toBeVisible();
});

test("switching workspace keeps dashboard links and sidebar on the chosen workspace", async ({ page, db, workspace }) => {
  const other = await db.hackathon.create({
    data: {
      name: `Second-${workspace.hackathon.id}`, customer: "Second synthetic customer",
      memberships: { create: { userId: workspace.owner.id, role: "Owner" } },
    },
  });
  await page.goto(`/hackathons/${other.id}`);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Use cases", exact: true }))
    .toHaveAttribute("href", `/hackathons/${other.id}/usecases`);
  await page.getByRole("link", { name: "Switch hackathon", exact: true }).click();
  await page.getByRole("link").filter({ hasText: workspace.hackathon.name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/hackathons/${workspace.hackathon.id}/usecases$`));
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Use cases", exact: true }))
    .toHaveAttribute("href", `/hackathons/${workspace.hackathon.id}/usecases`);
  await expect(page.getByRole("link", { name: "All use cases", exact: true }))
    .toHaveAttribute("href", `/hackathons/${workspace.hackathon.id}/usecases`);
});

test("@smoke search supports keyboard navigation, escape and empty results", async ({ page, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  const search = page.getByRole("searchbox");
  await search.fill(workspace.useCase.title);
  await expect(page.getByRole("link", { name: new RegExp(workspace.useCase.title) })).toBeVisible();
  await search.press("Escape");
  await expect(page.getByRole("link", { name: new RegExp(workspace.useCase.title) })).toBeHidden();
  await search.fill("no-such-synthetic-e2e-item");
  await expect(page.getByText("No matches", { exact: true })).toBeVisible();
  await search.fill(workspace.useCase.title);
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${casePath(workspace)}$`));
});

test("settings keeps membership management and last-owner protection", async ({ page, db, workspace }) => {
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByLabel(`Role for ${workspace.owner.name}`, { exact: true }).selectOption("Viewer");
  await expect(page.getByRole("alert").filter({ hasText: "at least one Owner" })).toBeVisible();
  expect(await db.membership.count({ where: { hackathonId: workspace.hackathon.id, role: "Owner" } })).toBe(1);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await page.getByLabel(/^Email\s*\*?$/).fill("synthetic-new-member@example.test");
  await page.getByLabel("Role", { exact: true }).selectOption("Viewer");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText(/No email was sent/)).toBeVisible();
  const member = await db.user.findUniqueOrThrow({ where: { email: "synthetic-new-member@example.test" } });
  expect(await db.membership.findUnique({
    where: { userId_hackathonId: { userId: member.id, hackathonId: workspace.hackathon.id } },
  })).toMatchObject({ role: "Viewer" });
  await page.getByRole("button", { name: `Remove ${member.name}`, exact: true }).click();
  await expect.poll(() => db.membership.count({ where: { hackathonId: workspace.hackathon.id, userId: member.id } })).toBe(0);
});

test("mobile settings dialog blocks background focus, closes on Escape and has no page overflow", async ({ page, workspace }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect.soft(width.document, "mobile page must not overflow horizontally").toBeLessThanOrEqual(width.viewport + 1);
  const edit = page.getByRole("button", { name: "Edit", exact: true });
  await edit.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Edit workspace settings" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      id: document.activeElement?.id,
      hasFocus: document.hasFocus(),
    }));
    const inDialog = await dialog.evaluate((element) => element.contains(document.activeElement));
    // Native modal dialogs allow moving to browser chrome, but never to the
    // inactive page behind the dialog. The next Tab must return to the modal.
    expect(inDialog || (focus.tag === "BODY" && !focus.hasFocus), JSON.stringify(focus)).toBe(true);
    if (!inDialog) {
      await page.keyboard.press("Tab");
      await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(edit).toBeFocused();
});

test("malformed stored gate JSON never crashes the use-case UI", async ({ page, db, workspace }) => {
  const evaluation = await evaluateInBrowser(page, workspace, db);
  for (const gateResults of ["null", '{"pass":true}', "[null]", '[{"gate":"fake","pass":"false"}]']) {
    await db.evaluation.update({ where: { id: evaluation.id }, data: { gateResults } });
    const response = await page.reload();
    expect.soft(response?.status(), gateResults).toBe(200);
    await expect(page.getByRole("heading", { name: "Copilot Studio fit evaluator", exact: true })).toBeVisible();
  }
});
