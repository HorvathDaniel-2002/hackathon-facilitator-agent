import { test, expect, casePath } from "./fixtures";

for (const status of ["Closed", "Archived"]) {
  test(`${status} event hides case mutations and can be explicitly restored from settings`, async ({ page, db, workspace }) => {
    await db.hackathon.update({ where: { id: workspace.hackathon.id }, data: { status } });
    await page.goto(casePath(workspace));
    await expect(page.getByText(`This event is ${status.toLowerCase()}.`, { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "New use case", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Run evaluator|Generate guide|Delete use case|Duplicate \/ re-scope|Assign contact/ })).toHaveCount(0);
    await page.goto(`/hackathons/${workspace.hackathon.id}/settings`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Status", { exact: true }).selectOption("Planning");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit workspace settings" })).toBeHidden();
    expect((await db.hackathon.findUniqueOrThrow({ where: { id: workspace.hackathon.id } })).status).toBe("Planning");
    await page.goto(casePath(workspace));
    await expect(page.getByRole("button", { name: "Run evaluator", exact: true })).toBeEnabled();
    await expect(page.getByRole("link", { name: "New use case", exact: true })).toBeVisible();
  });
}
