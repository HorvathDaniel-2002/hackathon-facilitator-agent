import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "", db: null as unknown, writes: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: state.writes }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.userId }), set: vi.fn() }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("@/lib/db", () => ({
  get prisma() { return state.db; },
  parseJsonField: (raw: string | null, fallback: unknown) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
  ConcurrencyConflictError: class extends Error {
    constructor(entity: string) { super(`${entity} was changed. Reload to see the latest version.`); }
  },
}));

import { createHackathon, inviteMember, removeMember, updateHackathon } from "@/lib/actions/hackathon";
import { assignTeamMember, createUseCase, deleteUseCase, duplicateUseCase, removeTeamMember, updateUseCase } from "@/lib/actions/usecase";
import { createContact, deleteContact, updateContact } from "@/lib/actions/contact";
import { closeUseCase, saveHandoff, suggestNextEngagement } from "@/lib/actions/handoff";
import { getMethodology } from "@/lib/methodology";
import { getRunbookTemplate } from "@/lib/runbook";
import { evaluationSnapshot, gateFactsFromUseCase } from "@/lib/ai/provenance";
import { createAiTestDatabase } from "./ai-database";

const databasePath = path.join(process.cwd(), "tests", "unit", `.ai-lifecycle-${randomUUID()}.db`);
let db: PrismaClient;
let ownerId: string;
let viewerId: string;
let contributorId: string;
let hackathonId: string;
let otherHackathonId: string;

async function useCase(title = "A scoped use case") {
  const result = await createUseCase(hackathonId, { title });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return db.useCase.findUniqueOrThrow({ where: { id: result.data.id } });
}
async function completeRunbook(gate: "Start" | "Close") {
  const { template } = getRunbookTemplate();
  for (const check of template.checks.filter((check) => check.gate === gate)) {
    const data = {
      hackathonId, templateId: check.id, templateVersion: template.version,
      status: "Done", owner: "Named reviewer", dueDate: new Date("2026-09-09"),
      evidence: "Reviewed with approved synthetic test data", updatedBy: ownerId,
    };
    await db.runbookCheck.upsert({
      where: { hackathonId_templateId: { hackathonId, templateId: check.id } },
      create: data, update: data,
    });
  }
}
async function closeCurrent(hackathon: string, useCaseId: string) {
  const current = await db.useCase.findUnique({ where: { id: useCaseId } });
  const handoff = await db.handoff.findUnique({ where: { useCaseId } });
  return closeUseCase(hackathon, useCaseId, current?.version ?? 0, handoff?.version ?? 0);
}
async function updateEvent(status: string) {
  const event = await db.hackathon.findUniqueOrThrow({ where: { id: hackathonId } });
  return updateHackathon(hackathonId, { status }, event.version);
}

beforeAll(async () => {
  // Never use the configured application database: the CLI and adapter receive
  // the same unique, test-owned file, and only that exact file is removed.
  createAiTestDatabase(databasePath);
  db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  state.db = db;
  const owner = await db.user.create({ data: { email: "facilitator@example.com", name: "Dana Reyes", globalRole: "Admin" } });
  const viewer = await db.user.create({ data: { email: "sponsor@example.com", name: "Priya Raman" } });
  const contributor = await db.user.create({ data: { email: "co-facilitator@example.com", name: "Mikael Berg" } });
  ownerId = owner.id;
  viewerId = viewer.id;
  contributorId = contributor.id;
}, 60000);

beforeEach(async () => {
  state.userId = ownerId;
  const hackathon = await db.hackathon.create({
    data: {
      name: "Lifecycle test", customer: "Fictional test",
      memberships: { create: [
        { userId: ownerId, role: "Owner" }, { userId: viewerId, role: "Viewer" }, { userId: contributorId, role: "Contributor" },
      ] },
    },
  });
  hackathonId = hackathon.id;
  const other = await db.hackathon.create({ data: { name: "Other workspace", customer: "Fictional test" } });
  otherHackathonId = other.id;
  state.writes.mockClear();
});

afterAll(async () => {
  if (db) await db.$disconnect();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    if (existsSync(databasePath + suffix)) rmSync(databasePath + suffix);
  }
});

describe("workspace actions on an isolated database", () => {
  it("creates the owner relationship atomically with minimal workspace settings", async () => {
    const result = await createHackathon({ name: "Created event", customer: "Customer" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await db.membership.findUnique({ where: { userId_hackathonId: { userId: ownerId, hackathonId: result.data.id } } })).toMatchObject({ role: "Owner" });
    expect(await db.hackathon.findUnique({ where: { id: result.data.id } })).toMatchObject({ name: "Created event", customer: "Customer", status: "Planning" });
    expect(await createHackathon({ name: "Old fields", customer: "Customer", startDate: "2026-04-02" })).toMatchObject({ ok: false, code: "validation" });
    expect(await updateHackathon(hackathonId, { objective: "Retired field" }, 0)).toMatchObject({ ok: false, code: "validation" });
  });

  it.each(["Ready", "Running", "Closed", "Archived"])("cannot create an event directly in %s", async (status) => {
    expect(await createHackathon({ name: "Bypassed event", customer: "Customer", status })).toMatchObject({ ok: false, code: "validation" });
  });

  it("requires completed mandatory pre-event checks for Ready and Running", async () => {
    expect(await updateEvent("Ready")).toMatchObject({ ok: false });
    expect(await updateEvent("Running")).toMatchObject({ ok: false });
    expect(await db.hackathon.findUnique({ where: { id: hackathonId } })).toMatchObject({ status: "Planning" });
    await completeRunbook("Start");
    expect(await updateEvent("Ready")).toMatchObject({ ok: true });
    expect(await updateEvent("Running")).toMatchObject({ ok: true });
    const check = getRunbookTemplate().template.checks.find((check) => check.gate === "Start")!;
    await db.runbookCheck.update({
      where: { hackathonId_templateId: { hackathonId, templateId: check.id } },
      data: { status: "Blocked" },
    });
    expect(await updateEvent("Running")).toMatchObject({ ok: false });
  });

  it("requires closure checks and every case's complete closed handoff before closing the event", async () => {
    const uc = await useCase();
    expect(await updateEvent("Closed")).toMatchObject({ ok: false });
    await completeRunbook("Close");
    expect(await updateEvent("Closed")).toMatchObject({ ok: false, code: "validation" });
    expect(await saveHandoff(hackathonId, uc.id, {
      businessOwner: "Business owner", portfolioDecision: "Stop", nextMilestone: "Archive learning", nextMilestoneDate: "2026-09-30",
    }, null)).toMatchObject({ ok: true });
    await completeRunbook("Close");
    expect(await updateEvent("Closed")).toMatchObject({ ok: false, code: "validation" });
    expect(await closeCurrent(hackathonId, uc.id)).toMatchObject({ ok: true });
    expect(await updateEvent("Closed")).toMatchObject({ ok: true });
    expect(await createUseCase(hackathonId, { title: "Not allowed in a closed event" })).toMatchObject({ ok: false, code: "validation" });
    expect(await duplicateUseCase(hackathonId, uc.id)).toMatchObject({ ok: false, code: "validation" });
    const stored = await db.useCase.findUniqueOrThrow({ where: { id: uc.id } });
    expect(await updateUseCase(hackathonId, uc.id, { status: "Draft" }, stored.version)).toMatchObject({ ok: false, code: "validation" });
  });

  it("does not close an event containing corrupt legacy closed handoffs", async () => {
    await completeRunbook("Close");
    const uc = await useCase();
    await db.useCase.update({ where: { id: uc.id }, data: { status: "Closed" } });
    await db.handoff.create({ data: {
      useCaseId: uc.id, businessOwner: "Person", portfolioDecision: "Unknown", nextMilestone: "Next",
    } });
    expect(await updateEvent("Closed")).toMatchObject({ ok: false, code: "validation" });
  });

  it("does not start an event with selected cases lacking current all-passing gate evidence", async () => {
    await completeRunbook("Start");
    const uc = await useCase();
    await db.useCase.update({ where: { id: uc.id }, data: { status: "Selected" } });
    expect(await updateEvent("Ready")).toMatchObject({ ok: false, code: "validation" });
    expect(await updateEvent("Running")).toMatchObject({ ok: false, code: "validation" });
    expect(await db.hackathon.findUnique({ where: { id: hackathonId } })).toMatchObject({ status: "Planning" });
  });

  it("rejects Viewer writes and malformed stored roles", async () => {
    state.userId = viewerId;
    expect(await createUseCase(hackathonId, { title: "Not permitted" })).toMatchObject({ ok: false, code: "denied" });
    await db.membership.update({ where: { userId_hackathonId: { userId: viewerId, hackathonId } }, data: { role: "Superuser" } });
    expect(await createContact(hackathonId, { name: "Person", roleType: "IT" })).toMatchObject({ ok: false, code: "denied" });
    expect(await db.useCase.count({ where: { hackathonId } })).toBe(0);
  });

  it("does not grant development login to invited users", async () => {
    const result = await inviteMember(hackathonId, "new-member@example.com", "Owner");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    state.userId = result.data.userId;
    expect(await createUseCase(hackathonId, { title: "Not a seeded identity" })).toMatchObject({ ok: false, code: "denied" });
  });

  it("validates roles and cannot demote or remove the last Owner", async () => {
    expect(await inviteMember(hackathonId, "new@example.com", "Admin" as never)).toMatchObject({ ok: false, code: "validation" });
    expect(await inviteMember(hackathonId, "facilitator@example.com", "Viewer")).toMatchObject({ ok: false });
    expect(await removeMember(hackathonId, ownerId)).toMatchObject({ ok: false });
    expect(await db.membership.count({ where: { hackathonId, role: "Owner" } })).toBe(1);
    expect(await inviteMember(hackathonId, "co-facilitator@example.com", "Owner")).toMatchObject({ ok: true });
    expect(await inviteMember(hackathonId, "facilitator@example.com", "Viewer")).toMatchObject({ ok: true });
    expect(await db.membership.count({ where: { hackathonId, role: "Owner" } })).toBe(1);
  });

  it("serializes concurrent last-owner demotions", async () => {
    await inviteMember(hackathonId, "co-facilitator@example.com", "Owner");
    const results = await Promise.all([
      inviteMember(hackathonId, "facilitator@example.com", "Viewer"),
      inviteMember(hackathonId, "co-facilitator@example.com", "Viewer"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db.membership.count({ where: { hackathonId, role: "Owner" } })).toBe(1);
  });

  it("rejects zero-row deletes/removals rather than claiming success", async () => {
    const uc = await useCase();
    for (const result of [
      await deleteUseCase(hackathonId, "missing", 0),
      await deleteContact(hackathonId, "missing", 0),
      await removeMember(hackathonId, "missing"),
      await removeTeamMember(hackathonId, uc.id, "missing", uc.version),
      await closeCurrent(hackathonId, "missing"),
    ]) expect(result.ok).toBe(false);
  });

  it("rejects missing resource IDs before broadening a database operation", async () => {
    const uc = await useCase();
    expect(await deleteUseCase(hackathonId, undefined as never, 0)).toMatchObject({ ok: false, code: "validation" });
    expect(await deleteContact(undefined as never, "missing", 0)).toMatchObject({ ok: false, code: "validation" });
    expect(await updateUseCase(hackathonId, uc.id, { title: "Changed" }, -1)).toMatchObject({ ok: false, code: "validation" });
    expect(await db.useCase.count({ where: { hackathonId } })).toBe(1);
  });

  it("requires numeric versions and preserves omitted fields on partial updates", async () => {
    const uc = await useCase();
    await db.useCase.update({ where: { id: uc.id }, data: { status: "Building" } });
    expect(await updateUseCase(hackathonId, uc.id, { title: "Changed title" }, undefined as never)).toMatchObject({ ok: false, code: "validation" });
    expect(await updateUseCase(hackathonId, uc.id, { title: "Changed title" }, 0)).toMatchObject({ ok: true });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ status: "Building", version: 1 });
    expect(await updateUseCase(hackathonId, uc.id, { title: "Stale title" }, 0)).toMatchObject({ ok: false, code: "conflict" });
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Running" } });
    const h = await db.hackathon.findUniqueOrThrow({ where: { id: hackathonId } });
    expect(await updateHackathon(hackathonId, { name: "Updated workspace" }, h.version)).toMatchObject({ ok: true });
    expect(await db.hackathon.findUnique({ where: { id: hackathonId } })).toMatchObject({ customer: "Fictional test", status: "Running" });
  });

  it("accepts and persists clearing optional use-case impact and draft handoff decisions", async () => {
    const result = await createUseCase(hackathonId, { title: "No impact selected", manualImpact: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await db.useCase.findUnique({ where: { id: result.data.id } })).toMatchObject({ manualImpact: null });
    expect(await updateUseCase(hackathonId, result.data.id, { manualImpact: "High" }, 0)).toMatchObject({ ok: true });
    expect(await updateUseCase(hackathonId, result.data.id, { manualImpact: "" }, 1)).toMatchObject({ ok: true });
    expect(await db.useCase.findUnique({ where: { id: result.data.id } })).toMatchObject({ manualImpact: null });
    expect(await saveHandoff(hackathonId, result.data.id, { businessOwner: "Person", portfolioDecision: "" }, null)).toMatchObject({ ok: true });
    expect(await db.handoff.findUnique({ where: { useCaseId: result.data.id } })).toMatchObject({ portfolioDecision: null });
    expect(await closeCurrent(hackathonId, result.data.id)).toMatchObject({ ok: false });
  });

  it("prevents status bypasses in generic use-case CRUD", async () => {
    expect(await createUseCase(hackathonId, { title: "Bypassed", status: "Closed" })).toMatchObject({ ok: false, code: "validation" });
    expect(await createUseCase(hackathonId, { title: "Bypassed", status: "Qualified" })).toMatchObject({ ok: false, code: "validation" });
    const uc = await useCase();
    expect(await updateUseCase(hackathonId, uc.id, { status: "Closed" }, uc.version)).toMatchObject({ ok: false, code: "validation" });
    expect(await updateUseCase(hackathonId, uc.id, { status: "Qualified" }, uc.version)).toMatchObject({ ok: false, code: "validation" });
    expect(await updateUseCase(hackathonId, uc.id, { status: "Selected" }, uc.version)).toMatchObject({ ok: false, code: "validation" });
    expect(await updateUseCase(hackathonId, uc.id, { status: "Building" }, uc.version)).toMatchObject({ ok: false, code: "validation" });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ status: "Draft" });
  });

  it("allocates distinct codes for concurrent create and duplicate operations", async () => {
    const source = await useCase();
    const results = await Promise.all([
      createUseCase(hackathonId, { title: "Concurrent one" }),
      createUseCase(hackathonId, { title: "Concurrent two" }),
      duplicateUseCase(hackathonId, source.id),
    ]);
    expect(results.every((result) => result.ok), JSON.stringify(results)).toBe(true);
    const rows = await db.useCase.findMany({ where: { hackathonId }, orderBy: { code: "asc" } });
    expect(rows.map((row) => row.code)).toEqual(["UC-01", "UC-02", "UC-03", "UC-04"]);
    expect(rows.find((row) => row.title.endsWith("(re-scoped)"))).toMatchObject({ status: "Draft" });
  });

  it("persists explicit readiness evidence and resets it on re-scoping", async () => {
    const created = await createUseCase(hackathonId, {
      title: "Approved sample case", dataSources: "Approved synthetic sample", sampleDataApproved: true, processOwnerConfirmed: true,
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    if (!created.ok) return;
    expect(await db.useCase.findUnique({ where: { id: created.data.id } })).toMatchObject({ sampleDataApproved: true, processOwnerConfirmed: true });
    const copied = await duplicateUseCase(hackathonId, created.data.id);
    expect(copied.ok).toBe(true);
    if (!copied.ok) return;
    expect(await db.useCase.findUnique({ where: { id: copied.data.id } })).toMatchObject({ sampleDataApproved: false, processOwnerConfirmed: false });
  });

  it("invalidates approvals on source/owner changes unless explicitly reconfirmed", async () => {
    const uc = await useCase();
    expect(await updateUseCase(hackathonId, uc.id, {
      dataSources: "Approved sample A", businessOwner: "Owner A", sampleDataApproved: true, processOwnerConfirmed: true,
    }, 0)).toMatchObject({ ok: true });
    expect(await updateUseCase(hackathonId, uc.id, { title: "Same source and owner" }, 1)).toMatchObject({ ok: true });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ sampleDataApproved: true, processOwnerConfirmed: true });
    expect(await updateUseCase(hackathonId, uc.id, { dataSources: "New sample B", businessOwner: "Owner B" }, 2)).toMatchObject({ ok: true });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ sampleDataApproved: false, processOwnerConfirmed: false });
    expect(await updateUseCase(hackathonId, uc.id, {
      dataSources: "Approved sample C", businessOwner: "Owner C", sampleDataApproved: true, processOwnerConfirmed: true,
    }, 3)).toMatchObject({ ok: true });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ sampleDataApproved: true, processOwnerConfirmed: true });
  });

  it("requires reconfirmation after adding or removing an assigned process owner", async () => {
    const uc = await useCase();
    await db.useCase.update({ where: { id: uc.id }, data: { processOwnerConfirmed: true } });
    const contact = await db.contact.create({ data: { hackathonId, name: "Assigned owner", roleType: "BusinessOwner" } });
    expect(await assignTeamMember(hackathonId, uc.id, contact.id, "Customer", "Process owner", 0)).toMatchObject({ ok: true });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ processOwnerConfirmed: false, version: 1 });
    expect(await updateUseCase(hackathonId, uc.id, { processOwnerConfirmed: true }, 1)).toMatchObject({ ok: true });
    expect(await removeTeamMember(hackathonId, uc.id, contact.id, 2)).toMatchObject({ ok: true });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ processOwnerConfirmed: false, version: 3 });
  });

  it.each(["role", "identity", "delete"] as const)("invalidates only linked attendance when a process-owner contact changes (%s)", async (change) => {
    const uc = await useCase();
    const unrelated = await useCase("Unrelated confirmation");
    await db.useCase.updateMany({
      where: { id: { in: [uc.id, unrelated.id] } }, data: { processOwnerConfirmed: true },
    });
    const contact = await db.contact.create({ data: { hackathonId, name: "Assigned owner", roleType: "BusinessOwner" } });
    await db.teamMember.create({ data: { useCaseId: uc.id, contactId: contact.id, party: "Customer" } });
    const result = change === "delete"
      ? await deleteContact(hackathonId, contact.id, contact.version)
      : await updateContact(hackathonId, contact.id, change === "role" ? { roleType: "IT" } : { name: "Replacement owner" }, 0);
    expect(result).toMatchObject({ ok: true });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ processOwnerConfirmed: false, version: 1 });
    expect(await db.useCase.findUnique({ where: { id: unrelated.id } })).toMatchObject({ processOwnerConfirmed: true, version: 0 });
  });

  it("rejects cross-workspace references and malformed parties", async () => {
    const uc = await useCase();
    const foreign = await db.useCase.create({ data: { hackathonId: otherHackathonId, code: "UC-01", title: "Foreign" } });
    const contact = await db.contact.create({ data: { hackathonId: otherHackathonId, name: "Foreign person", roleType: "IT" } });
    expect(await assignTeamMember(hackathonId, uc.id, contact.id, "Root", "", 0)).toMatchObject({ ok: false, code: "validation" });
    expect(await assignTeamMember(hackathonId, uc.id, contact.id, "Customer", "", 0)).toMatchObject({ ok: false });
    expect(await deleteUseCase(hackathonId, foreign.id, 0)).toMatchObject({ ok: false });
    expect(await db.useCase.findUnique({ where: { id: foreign.id } })).not.toBeNull();
  });

  it("protects contacts from stale updates and preserves influence", async () => {
    const contact = await db.contact.create({ data: { hackathonId, name: "Person", roleType: "IT", influence: "High" } });
    expect(await updateContact(hackathonId, contact.id, { notes: "New note" }, 0)).toMatchObject({ ok: true });
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ influence: "High", version: 1 });
    expect(await updateContact(hackathonId, contact.id, { notes: "Stale note" }, 0)).toMatchObject({ ok: false, code: "conflict" });
  });

});

describe("handoff closure and concurrent editing", () => {
  const complete = {
    businessOwner: "Process owner", portfolioDecision: "CustomerLed", nextMilestone: "Pilot scope review", nextMilestoneDate: "2026-09-30",
  };

  it("allows an undated handoff draft but blocks closure until its date is saved", async () => {
    const uc = await useCase();
    expect(await saveHandoff(hackathonId, uc.id, {
      businessOwner: complete.businessOwner,
      portfolioDecision: complete.portfolioDecision,
      nextMilestone: complete.nextMilestone,
    }, null)).toMatchObject({ ok: true, data: { version: 0 } });
    const undated = await closeCurrent(hackathonId, uc.id);
    expect(undated).toMatchObject({ ok: false });
    if (!undated.ok) expect(undated.error).toContain("nextMilestoneDate");
    expect(await saveHandoff(hackathonId, uc.id, { nextMilestoneDate: "2026-09-30" }, 0)).toMatchObject({ ok: true });
    expect(await closeCurrent(hackathonId, uc.id)).toMatchObject({ ok: true });
  });

  it("requires a version, prevents lost updates and protects the closure invariant", async () => {
    const uc = await useCase();
    expect(await saveHandoff(hackathonId, uc.id, complete)).toMatchObject({ ok: false, code: "validation" });
    expect(await closeCurrent(hackathonId, uc.id)).toMatchObject({ ok: false });
    expect(await saveHandoff(hackathonId, uc.id, complete, null)).toMatchObject({ ok: true, data: { version: 0 } });
    const results = await Promise.all([
      saveHandoff(hackathonId, uc.id, { gaps: "First editor" }, 0),
      saveHandoff(hackathonId, uc.id, { gaps: "Second editor" }, 0),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.code === "conflict")).toHaveLength(1);
    expect(await saveHandoff(hackathonId, uc.id, complete, null)).toMatchObject({ ok: false, code: "conflict" });
    expect(await closeCurrent(hackathonId, uc.id)).toMatchObject({ ok: true });
    expect(await saveHandoff(hackathonId, uc.id, { businessOwner: "" }, 1)).toMatchObject({ ok: false, code: "validation" });
    expect(await db.useCase.findUnique({ where: { id: uc.id } })).toMatchObject({ status: "Closed" });
  });

  it("scopes closure and rejects corrupted stored portfolio decisions", async () => {
    const uc = await db.useCase.create({ data: { hackathonId: otherHackathonId, code: "UC-01", title: "Foreign" } });
    await db.handoff.create({ data: { useCaseId: uc.id, ...complete, nextMilestoneDate: new Date(complete.nextMilestoneDate) } });
    expect(await closeCurrent(hackathonId, uc.id)).toMatchObject({ ok: false });
    expect(await saveHandoff(hackathonId, uc.id, complete, 0)).toMatchObject({ ok: false });
    expect(await suggestNextEngagement(hackathonId, uc.id, "Stop")).toMatchObject({ ok: false });
    const own = await useCase();
    await db.handoff.create({ data: { useCaseId: own.id, ...complete, nextMilestoneDate: new Date(complete.nextMilestoneDate), portfolioDecision: "Corrupt" } });
    expect(await closeCurrent(hackathonId, own.id)).toMatchObject({ ok: false });
    expect(await suggestNextEngagement(hackathonId, own.id, "Invalid" as never)).toMatchObject({ ok: false, code: "validation" });
  });

  it("uses effective overridden scores while keeping recommendations provisional", async () => {
    const uc = await useCase();
    await db.evaluation.create({ data: {
      useCaseId: uc.id, valueScore: 5, feasibilityScore: 5, dataReadinessScore: 5, reusabilityScore: 5,
      weightedScore: 5, priorityBand: "High", csFitBand: "Strong", recommendedPlatform: "CopilotStudio",
      confidence: 1, routingSignals: "[]", gateResults: "[]", rationale: "Synthetic test",
      methodologyVersion: getMethodology().version,
      override: { create: {
        overriddenFields: JSON.stringify(["valueScore", "feasibilityScore", "dataReadinessScore", "reusabilityScore"]),
        valueScore: 1, feasibilityScore: 1, dataReadinessScore: 1, reusabilityScore: 1, overriddenBy: ownerId,
      } },
    } });
    const result = await suggestNextEngagement(hackathonId, uc.id, "MicrosoftMotion");
    expect(result).toMatchObject({ ok: true, data: { route: "FastTrack", provisional: true, requiresConfirmation: true } });
    if (result.ok) expect(result.data?.rationale).toContain("Priority band: Low.");
  });

  it("retains qualification for status-only progression but rejects changed evidence", async () => {
    const uc = await useCase();
    const source = await db.useCase.findUniqueOrThrow({ where: { id: uc.id }, include: { teamMembers: { include: { contact: true } } } });
    await db.evaluation.create({ data: {
      useCaseId: uc.id, valueScore: 5, feasibilityScore: 5, dataReadinessScore: 5, reusabilityScore: 5,
      weightedScore: 5, priorityBand: "High", csFitBand: "Strong", recommendedPlatform: "CopilotStudio",
      confidence: 1, routingSignals: "[]", rationale: "Synthetic provenance test",
      gateResults: JSON.stringify(getMethodology().gates.gates.map((gate) => ({
        gate: gate.id, label: gate.label, kind: gate.kind, pass: true,
      }))),
      methodologyVersion: getMethodology().version,
      useCaseVersion: uc.version,
      useCaseSnapshot: evaluationSnapshot(source, gateFactsFromUseCase(source)),
    } });
    expect(await updateUseCase(hackathonId, uc.id, { status: "Selected" }, 0)).toMatchObject({ ok: true });
    expect(await suggestNextEngagement(hackathonId, uc.id, "MicrosoftMotion")).toMatchObject({
      ok: true, data: { route: "AIAgentsPilot", provisional: true },
    });
    expect(await updateUseCase(hackathonId, uc.id, { title: "Changed scope", status: "Building" }, 1)).toMatchObject({ ok: false, code: "validation" });
    expect(await updateUseCase(hackathonId, uc.id, { title: "Changed scope" }, 1)).toMatchObject({ ok: true });
    expect(await suggestNextEngagement(hackathonId, uc.id, "MicrosoftMotion")).toMatchObject({
      ok: true, data: { route: "FastTrack", provisional: true },
    });
    expect(await updateUseCase(hackathonId, uc.id, { status: "Building" }, 2)).toMatchObject({ ok: false, code: "validation" });
  });
});
