import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiTestDatabase } from "./ai-database";

const state = vi.hoisted(() => ({ userId: "", db: null as unknown, revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.userId }), set: vi.fn() }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("@/lib/db", () => ({
  get prisma() { return state.db; },
  parseJsonField: (raw: string | null, fallback: unknown) => raw ? JSON.parse(raw) : fallback,
  ConcurrencyConflictError: class extends Error {
    constructor(entity: string) { super(`${entity} changed. Reload and try again.`); }
  },
}));
import { saveHandoff } from "@/lib/actions/handoff";
import { handoffDraft, initialProgressStage } from "@/lib/kanban";

const databasePath = path.join(process.cwd(), "tests", "unit", `.ai-kanban-${randomUUID()}.db`);
let db: PrismaClient;
let owner: string, viewer: string, event: string, useCase: string;

beforeAll(async () => {
  createAiTestDatabase(databasePath);
  db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  state.db = db;
  owner = (await db.user.create({ data: { email: "facilitator@example.com", name: "Dana Reyes", globalRole: "Admin" } })).id;
  viewer = (await db.user.create({ data: { email: "sponsor@example.com", name: "Priya Raman" } })).id;
}, 60000);
beforeEach(async () => {
  state.userId = owner;
  state.revalidate.mockClear();
  event = (await db.hackathon.create({ data: {
    name: "Kanban workspace", customer: "Fictional company",
    memberships: { create: [{ userId: owner, role: "Owner" }, { userId: viewer, role: "Viewer" }] },
  } })).id;
  useCase = (await db.useCase.create({ data: {
    hackathonId: event, code: "UC-01", title: "Fictional case", businessOwner: "Process owner",
  } })).id;
});
afterAll(async () => {
  if (db) await db.$disconnect();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    if (existsSync(databasePath + suffix)) rmSync(databasePath + suffix);
  }
});

describe("shared Kanban / handoff workflow", () => {
  it("stores progress and delivery independently without changing assessment/qualification state", async () => {
    expect(await saveHandoff(event, useCase, { progressStage: "Assessing", deliveryRoute: "CopilotCowork" }, null)).toMatchObject({ ok: true });
    const row = await db.handoff.findUniqueOrThrow({ where: { useCaseId: useCase } });
    expect(row).toMatchObject({ progressStage: "Assessing", deliveryRoute: "CopilotCowork", cafStatus: "NotSubmitted", businessOwner: "Process owner", workflowUpdatedBy: owner });
    expect(row.workflowUpdatedAt).toBeInstanceOf(Date);
    expect(await db.useCase.findUnique({ where: { id: useCase } })).toMatchObject({ status: "Draft", version: 1 });
    expect(state.revalidate).toHaveBeenCalledWith(`/hackathons/${event}/usecases`);
    expect(state.revalidate).toHaveBeenCalledWith(`/hackathons/${event}/handoff`);
  });

  it("requires owner and evidence before recording production, with no partial write", async () => {
    expect(await saveHandoff(event, useCase, { progressStage: "InProduction", businessOwner: "" }, null))
      .toMatchObject({ ok: false, code: "validation", fieldErrors: { businessOwner: expect.any(Array), productionReference: expect.any(Array) } });
    expect(await db.handoff.count({ where: { useCaseId: useCase } })).toBe(0);
    expect(await db.useCase.findUnique({ where: { id: useCase } })).toMatchObject({ version: 0 });
    expect(await saveHandoff(event, useCase, { progressStage: "InProduction", productionReference: "Release review DEPLOY-42" }, null)).toMatchObject({ ok: true });
    expect(await db.handoff.findUnique({ where: { useCaseId: useCase } })).toMatchObject({
      progressStage: "InProduction", productionReference: "Release review DEPLOY-42", businessOwner: "Process owner",
    });
  });

  it("recording a CAF route alone never means submitted; a submission needs owner and reference", async () => {
    expect(await saveHandoff(event, useCase, { deliveryRoute: "CAF" }, null)).toMatchObject({ ok: true });
    expect(await db.handoff.findUnique({ where: { useCaseId: useCase } })).toMatchObject({ cafStatus: "NotSubmitted" });
    expect(await saveHandoff(event, useCase, { cafStatus: "Submitted", businessOwner: " " }, 0))
      .toMatchObject({ ok: false, code: "validation", fieldErrors: { businessOwner: expect.any(Array), cafReference: expect.any(Array) } });
    expect(await saveHandoff(event, useCase, {
      cafStatus: "Submitted", cafReference: "CAF-100", cafSubmittedOn: "2026-09-24",
    }, 0)).toMatchObject({ ok: true });
    expect(await db.handoff.findUnique({ where: { useCaseId: useCase } })).toMatchObject({
      deliveryRoute: "CAF", cafStatus: "Submitted", cafReference: "CAF-100", cafSubmittedOn: new Date("2026-09-24"),
    });
  });

  it("preserves evidence across partial moves and refuses clearing required evidence", async () => {
    await saveHandoff(event, useCase, {
      progressStage: "InProduction", productionReference: "Confirmed release",
      cafStatus: "Submitted", cafReference: "CAF-100",
      nextMilestone: "Measure adoption", nextMilestoneDate: "2026-10-24",
    }, null);
    expect(await saveHandoff(event, useCase, { deliveryRoute: "CustomBuild" }, 0)).toMatchObject({ ok: true });
    expect(await saveHandoff(event, useCase, { productionReference: "" }, 1)).toMatchObject({ ok: false, code: "validation" });
    expect(await saveHandoff(event, useCase, { cafReference: "" }, 1)).toMatchObject({ ok: false, code: "validation" });
    expect(await db.handoff.findUnique({ where: { useCaseId: useCase } })).toMatchObject({
      version: 1, nextMilestone: "Measure adoption", cafReference: "CAF-100", productionReference: "Confirmed release",
    });
  });

  it("rejects stale creation and conflicting concurrent updates without clobbering", async () => {
    await saveHandoff(event, useCase, { nextMilestone: "Preserve me" }, null);
    expect(await saveHandoff(event, useCase, { progressStage: "Assessing" }, null)).toMatchObject({ ok: false, code: "conflict" });
    const results = await Promise.all([
      saveHandoff(event, useCase, { progressStage: "Building" }, 0),
      saveHandoff(event, useCase, { progressStage: "Parked" }, 0),
    ]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.find(result => !result.ok)).toMatchObject({ code: "conflict" });
    expect(await db.handoff.findUnique({ where: { useCaseId: useCase } })).toMatchObject({ nextMilestone: "Preserve me", version: 1 });
  });

  it("updates the same record from board movement and the handoff editor without losing fields", async () => {
    const created = await saveHandoff(event, useCase, {
      whatWasBuilt: "Prototype scope", portfolioDecision: "CustomerLed",
      nextMilestone: "Review sample permissions", nextMilestoneDate: "2026-10-05",
    }, null);
    expect(created).toMatchObject({ ok: true, data: { version: 0, useCaseVersion: 1 } });
    expect(await saveHandoff(event, useCase, { progressStage: "Building" }, 0))
      .toMatchObject({ ok: true, data: { version: 1, useCaseVersion: 2 } });
    expect(await saveHandoff(event, useCase, { nextMilestone: "Review pilot scope" }, 1))
      .toMatchObject({ ok: true, data: { version: 2, useCaseVersion: 3 } });
    expect(await db.handoff.count({ where: { useCaseId: useCase } })).toBe(1);
    const uc = await db.useCase.findUniqueOrThrow({ where: { id: useCase } });
    const current = await db.handoff.findUniqueOrThrow({ where: { useCaseId: useCase } });
    expect(handoffDraft(uc, current)).toMatchObject({
      progressStage: "Building", whatWasBuilt: "Prototype scope", portfolioDecision: "CustomerLed",
      nextMilestone: "Review pilot scope", nextMilestoneDate: "2026-10-05",
    });
  });

  it("treats undefined patch fields as omitted, not as cleared evidence", async () => {
    await saveHandoff(event, useCase, { progressStage: "InProduction", productionReference: "Release review" }, null);
    expect(await saveHandoff(event, useCase, {
      progressStage: undefined, productionReference: undefined, businessOwner: undefined, gaps: "Follow up",
    }, 0)).toMatchObject({ ok: true });
    expect(await db.handoff.findUnique({ where: { useCaseId: useCase } })).toMatchObject({
      progressStage: "InProduction", productionReference: "Release review", businessOwner: "Process owner", gaps: "Follow up",
    });
  });

  it("does not allow an owner to be cleared while deployment/submission is still reported", async () => {
    await saveHandoff(event, useCase, { progressStage: "InProduction", productionReference: "Release review" }, null);
    expect(await saveHandoff(event, useCase, { businessOwner: "" }, 0)).toMatchObject({ ok: false, code: "validation" });
    expect(await saveHandoff(event, useCase, { progressStage: "Parked", businessOwner: "" }, 0)).toMatchObject({ ok: true });
    expect(await db.handoff.findUnique({ where: { useCaseId: useCase } })).toMatchObject({
      progressStage: "Parked", productionReference: "Release review", businessOwner: null,
    });
    const current = await db.handoff.findUniqueOrThrow({ where: { useCaseId: useCase } });
    expect(handoffDraft({ status: "Draft", businessOwner: "Process owner" }, current).businessOwner).toBe("");
  });

  it.each([
    { progressStage: "Deployed" }, { deliveryRoute: "Guess" }, { cafStatus: "Approved" },
    { cafSubmittedOn: "2026-02-30" }, { workflowUpdatedBy: "forged" },
  ])("rejects invalid values or forged audit data: %j", async input => {
    expect(await saveHandoff(event, useCase, input, null)).toMatchObject({ ok: false, code: "validation" });
  });

  it("enforces membership, workspace scope and archived read-only behavior", async () => {
    state.userId = viewer;
    expect(await saveHandoff(event, useCase, { progressStage: "Building" }, null)).toMatchObject({ ok: false, code: "denied" });
    state.userId = owner;
    const foreign = await db.hackathon.create({ data: { name: "Other", customer: "Fictional" } });
    const other = await db.useCase.create({ data: { hackathonId: foreign.id, code: "UC-X", title: "Other case" } });
    expect(await saveHandoff(event, other.id, { progressStage: "Building" }, null)).toMatchObject({ ok: false });
    await db.hackathon.update({ where: { id: event }, data: { status: "Archived" } });
    expect(await saveHandoff(event, useCase, { progressStage: "Building" }, null)).toMatchObject({ ok: false, code: "validation" });
    expect(await db.handoff.count({ where: { useCaseId: { in: [useCase, other.id] } } })).toBe(0);
  });

  it("allows recorded follow-up on closed events but does not rewrite recorded decisions", async () => {
    await saveHandoff(event, useCase, {
      whatWasBuilt: "Recorded demo", businessOwner: "Recorded owner", portfolioDecision: "CustomerLed",
      nextMilestone: "Review pilot", nextMilestoneDate: "2026-10-10",
    }, null);
    await db.useCase.update({ where: { id: useCase }, data: { status: "Closed" } });
    await db.hackathon.update({ where: { id: event }, data: { status: "Closed" } });
    expect(await saveHandoff(event, useCase, { progressStage: "Pilot" }, 0)).toMatchObject({ ok: true });
    expect(await saveHandoff(event, useCase, { progressStage: "InProduction", productionReference: "Release evidence" }, 1)).toMatchObject({ ok: true });
    expect(await saveHandoff(event, useCase, { businessOwner: "Replacement owner" }, 2)).toMatchObject({ ok: false, code: "validation" });
    expect(await saveHandoff(event, useCase, { whatWasBuilt: "Changed demo" }, 2)).toMatchObject({ ok: false, code: "validation" });
  });

  it("does not infer advanced stages from old demo and closure statuses", () => {
    expect(initialProgressStage("Demoed")).toBe("Building");
    expect(initialProgressStage("Closed")).toBe("Assessing");
    expect(initialProgressStage("Closed", "Stop")).toBe("Parked");
    expect(handoffDraft({ status: "Draft", businessOwner: null }, null)).toMatchObject({
      progressStage: "Intake", deliveryRoute: "Unassigned", cafStatus: "NotSubmitted",
    });
  });
});
