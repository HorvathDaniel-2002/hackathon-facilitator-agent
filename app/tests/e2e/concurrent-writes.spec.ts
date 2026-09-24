import { test, expect, evaluateInBrowser } from "./fixtures";

test("@ai duplicate creates a clean draft and deleting it preserves the source", async ({ page, db, workspace }) => {
  await evaluateInBrowser(page, workspace, db);
  await page.getByRole("button", { name: "Duplicate / re-scope", exact: true }).click();
  await expect(page).toHaveURL(/\/usecases\/[^/]+\/edit$/);
  const copyId = new URL(page.url()).pathname.split("/").at(-2)!;
  expect(copyId).not.toBe(workspace.useCase.id);
  const copy = await db.useCase.findUniqueOrThrow({
    where: { id: copyId }, include: { evaluations: true, buildGuides: true, handoff: true, teamMembers: true },
  });
  expect(copy.title).toBe(`${workspace.useCase.title} (re-scoped)`);
  expect(copy.description).toBe(workspace.useCase.description);
  expect(copy).toMatchObject({
    status: "Draft", sampleDataApproved: false, processOwnerConfirmed: false,
    evaluations: [], buildGuides: [], handoff: null, teamMembers: [],
  });
  await page.goto(`/hackathons/${workspace.hackathon.id}/usecases/${copyId}`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete use case", exact: true }).click();
  expect(await db.useCase.findUnique({ where: { id: copyId } })).not.toBeNull();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete use case", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/hackathons/${workspace.hackathon.id}/usecases$`));
  expect(await db.useCase.findUnique({ where: { id: copyId } })).toBeNull();
  expect(await db.useCase.findUnique({ where: { id: workspace.useCase.id } })).not.toBeNull();
  expect(await db.evaluation.count({ where: { useCaseId: workspace.useCase.id } })).toBe(1);
});

test("stale contact edit reports conflict and preserves the newer saved record", async ({ page, context, db, workspace }) => {
  const other = await context.newPage();
  const route = `/hackathons/${workspace.hackathon.id}/contacts`;
  await page.goto(route);
  await other.goto(route);
  for (const tab of [page, other]) {
    await tab.getByRole("button", { name: `Edit ${workspace.contact.name}`, exact: true }).click();
  }
  await page.getByLabel(/^Name\s*\*?$/).fill("Newer saved contact");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page.getByText("Newer saved contact", { exact: true })).toBeVisible();
  await other.getByLabel(/^Name\s*\*?$/).fill("Stale unsaved contact");
  await other.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: /changed by someone else/i })).toBeVisible();
  await expect(other.getByLabel(/^Name\s*\*?$/)).toHaveValue("Stale unsaved contact");
  expect((await db.contact.findUniqueOrThrow({ where: { id: workspace.contact.id } })).name).toBe("Newer saved contact");
  await other.getByRole("button", { name: "Refresh latest", exact: true }).click();
  await expect(other.getByText("Newer saved contact", { exact: true })).toBeVisible();
  await other.close();
});
