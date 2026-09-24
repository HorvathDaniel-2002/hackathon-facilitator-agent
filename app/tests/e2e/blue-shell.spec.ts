import { test, expect } from "./fixtures";

test("the application opens on Kanban and Dashboard remains an explicit selectable view", async ({ page, workspace }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/hackathons\/[^/]+\/usecases$/);
  await expect(page.getByRole("heading", { name: "Use case board", exact: true })).toBeVisible();
  await page.goto(`/board?hackathon=${workspace.hackathon.id}`);
  await expect(page).toHaveURL(new RegExp(`/hackathons/${workspace.hackathon.id}/usecases$`));
  const nav = page.getByRole("navigation", { name: "Main", exact: true });
  await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?hackathon=${workspace.hackathon.id}$`));
  await expect(page.getByRole("heading", { name: "Portfolio overview", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Use cases", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/hackathons/${workspace.hackathon.id}/usecases$`));
  await page.getByRole("link", { name: "Hackathon Facilitator", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/hackathons/${workspace.hackathon.id}/usecases$`));
});

test("blue theme and creator credit appear across board, dashboard, contacts and handoff", async ({ page, workspace }) => {
  const prefix = `/hackathons/${workspace.hackathon.id}`;
  for (const route of [`${prefix}/usecases`, `/dashboard?hackathon=${workspace.hackathon.id}`, `${prefix}/contacts`, `${prefix}/handoff`]) {
    await page.goto(route);
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("Created by Daniel Horvath");
    await expect(footer.getByRole("link", { name: "dahorvath@microsoft.com", exact: true }))
      .toHaveAttribute("href", "mailto:dahorvath@microsoft.com");
    const palette = await page.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim(),
      family: getComputedStyle(document.body).fontFamily,
    }));
    expect(palette.accent).toBe("#1559b7");
    expect(palette.family).toContain("Segoe UI");
  }
});

test("board landing rejects an inaccessible workspace instead of silently choosing a different one", async ({ page }) => {
  const response = await page.goto("/board?hackathon=not-my-workspace");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Use case board", exact: true })).toHaveCount(0);
});
