import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { baseURL, verifyDatabaseOwner } from "./isolation.mts";

type Workspace = Awaited<ReturnType<typeof createWorkspace>>;
type Fixture = {
  db: PrismaClient;
  workspace: Workspace;
};

export async function signIn(context: BrowserContext, userId: string) {
  await context.addCookies([{ name: "hf_session", value: userId, url: baseURL }]);
}

async function createWorkspace(db: PrismaClient) {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "facilitator@example.com" } });
  const contributor = await db.user.findUniqueOrThrow({ where: { email: "co-facilitator@example.com" } });
  const viewer = await db.user.findUniqueOrThrow({ where: { email: "sponsor@example.com" } });
  const unique = randomUUID().slice(0, 8);
  const hackathon = await db.hackathon.create({
    data: {
      name: `E2E workspace ${unique}`,
      customer: `Synthetic customer ${unique}`,
      memberships: {
        create: [
          { userId: owner.id, role: "Owner" },
          { userId: contributor.id, role: "Contributor" },
          { userId: viewer.id, role: "Viewer" },
        ],
      },
    },
  });
  const useCase = await db.useCase.create({
    data: {
      hackathonId: hackathon.id,
      code: "E2E-01",
      title: `Synthetic policy assistant ${unique}`,
      description: "A Teams knowledge assistant answering policy questions using SharePoint.",
      businessOwner: "Synthetic business owner",
      targetUser: "Internal service team",
      currentProcess: "Search the sample policy library manually for ten minutes.",
      painPoints: "Slow and inconsistent answers",
      desiredOutcome: "Read-only grounded answers with citations",
      dataSources: "Synthetic SharePoint policy library and anonymized CSV sample records",
      sampleDataApproved: true,
      processOwnerConfirmed: true,
      systemsConnectors: "SharePoint, Teams",
      agentOutput: "Read-only answer with source citation; no writes",
      humanApprovalPoint: "A person reviews the read-only answer.",
      successMetric: "Reduce answer time by 40 percent",
      reusePotential: "Reuse the knowledge pattern across departments",
      smallestSlice: "Answer one policy question from synthetic documents with a citation",
      productionVision: "An authenticated, monitored knowledge service",
      constraints: "Synthetic data only",
    },
  });
  const contact = await db.contact.create({
    data: { hackathonId: hackathon.id, name: "Synthetic business owner", roleType: "BusinessOwner" },
  });
  await db.contact.create({
    data: { hackathonId: hackathon.id, name: "Synthetic sponsor", roleType: "Sponsor" },
  });
  await db.teamMember.create({
    data: { useCaseId: useCase.id, contactId: contact.id, party: "Customer" },
  });
  return { owner, contributor, viewer, hackathon, useCase, contact };
}

export const test = base.extend<Fixture>({
  db: async ({}, provide) => {
    const { databaseURL } = verifyDatabaseOwner();
    const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseURL }) });
    await provide(db);
    await db.$disconnect();
  },
  workspace: async ({ db, context }, provide) => {
    const workspace = await createWorkspace(db);
    await signIn(context, workspace.owner.id);
    await provide(workspace);
  },
});

export { expect, baseURL };

export function casePath(workspace: Workspace) {
  return `/hackathons/${workspace.hackathon.id}/usecases/${workspace.useCase.id}`;
}

export async function evaluateInBrowser(page: Page, workspace: Workspace, db: PrismaClient) {
  await page.goto(casePath(workspace));
  await page.getByRole("button", { name: "Run evaluator", exact: true }).click();
  await expect(page.getByRole("button", { name: "Re-evaluate", exact: true })).toBeVisible();
  await expect.poll(() => db.evaluation.count({ where: { useCaseId: workspace.useCase.id } })).toBe(1);
  return db.evaluation.findFirstOrThrow({ where: { useCaseId: workspace.useCase.id } });
}
