import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiTestDatabase } from "./ai-database";

const state = vi.hoisted(() => ({
  userId: "", db: null as unknown, afterAccess: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  get prisma() { return state.db; },
  parseJsonField: (raw: string | null, fallback: unknown) => {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  },
  ConcurrencyConflictError: class extends Error {
    constructor(entity: string) { super(`${entity} changed. Reload before retrying.`); }
  },
}));
vi.mock("@/lib/auth", async () => {
  const { membershipRoleSchema, ROLE_RANK } = await import("@/lib/schemas");
  class AccessDeniedError extends Error {}
  return {
    AccessDeniedError,
    requireUser: async () => ({ id: state.userId }),
    assertAccess: async (userId: string, hackathonId: string, minimum: keyof typeof ROLE_RANK) => {
      const membership = await (state.db as PrismaClient).membership.findUnique({
        where: { userId_hackathonId: { userId, hackathonId } },
      });
      const role = membershipRoleSchema.safeParse(membership?.role);
      if (!role.success || ROLE_RANK[role.data] < ROLE_RANK[minimum]) throw new AccessDeniedError("Access denied");
      const hook = state.afterAccess;
      state.afterAccess = undefined;
      await hook?.();
      return role.data;
    },
  };
});

import { archiveHackathon, removeMember, updateHackathon } from "@/lib/actions/hackathon";
import { assignTeamMember, createUseCase, deleteUseCase, duplicateUseCase, removeTeamMember, updateUseCase } from "@/lib/actions/usecase";
import { createContact, deleteContact, updateContact } from "@/lib/actions/contact";
import { closeUseCase, saveHandoff } from "@/lib/actions/handoff";
import { saveRunbookCheck } from "@/lib/actions/runbook";
import { assertWorkspaceWriteAccess } from "@/lib/actions/guard";
import { isRunbookItemComplete, missingRunbookChecks } from "@/lib/domain/runbook";
import { getRunbookTemplate, readRunbook } from "@/lib/runbook";

const databasePath = path.join(process.cwd(), "tests", "unit", `.ai-workflow-${randomUUID()}.db`);
const { template } = getRunbookTemplate();
const completeCheck = { status: "Done", owner: "Named reviewer", dueDate: "2026-10-01", evidence: "Approved synthetic exercise reference" };
const completeHandoff = {
  businessOwner: "Process owner", portfolioDecision: "CustomerLed", nextMilestone: "Pilot review", nextMilestoneDate: "2026-11-01",
};
let db: PrismaClient;
let ownerId: string;
let contributorId: string;
let hackathonId: string;

async function createCase(status = "Draft") {
  return db.useCase.create({ data: { hackathonId, code: randomUUID(), title: "Synthetic reviewed case", status } });
}
async function completeRunbook() {
  await db.runbookCheck.createMany({
    data: template.checks.map((check) => ({
      hackathonId, templateId: check.id, templateVersion: template.version,
      ...completeCheck, dueDate: new Date(completeCheck.dueDate), updatedBy: ownerId,
    })),
  });
}
async function event() {
  return db.hackathon.findUniqueOrThrow({ where: { id: hackathonId } });
}
async function storedCase(id: string) {
  return db.useCase.findUniqueOrThrow({ where: { id } });
}

beforeAll(async () => {
  createAiTestDatabase(databasePath);
  db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  state.db = db;
  ownerId = (await db.user.create({ data: { name: "Test owner", email: "workflow-owner@example.com" } })).id;
  contributorId = (await db.user.create({ data: { name: "Test contributor", email: "workflow-contributor@example.com" } })).id;
}, 60_000);

beforeEach(async () => {
  state.userId = ownerId;
  state.afterAccess = undefined;
  hackathonId = (await db.hackathon.create({ data: {
    name: "Workflow review", customer: "Synthetic customer",
    memberships: { create: [{ userId: ownerId, role: "Owner" }, { userId: contributorId, role: "Contributor" }] },
  } })).id;
});

afterAll(async () => {
  if (db) await db.$disconnect();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    if (existsSync(databasePath + suffix)) rmSync(databasePath + suffix);
  }
});

describe("final-state protection", () => {
  it.each(["Closed", "Archived"])("rejects content mutations and rolls back lock writes in a %s event", async (status) => {
    const uc = await createCase();
    const contact = await db.contact.create({ data: { hackathonId, name: "Test member", roleType: "BusinessOwner" } });
    await db.teamMember.create({ data: { useCaseId: uc.id, contactId: contact.id, party: "Customer" } });
    await db.handoff.create({ data: { useCaseId: uc.id, ...completeHandoff, nextMilestoneDate: new Date(completeHandoff.nextMilestoneDate) } });
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status } });
    const mutations = [
      () => createUseCase(hackathonId, { title: "New case" }),
      () => duplicateUseCase(hackathonId, uc.id),
      () => updateUseCase(hackathonId, uc.id, { title: "Changed history" }, 0),
      () => deleteUseCase(hackathonId, uc.id, 0),
      () => assignTeamMember(hackathonId, uc.id, contact.id, "Partner", "Changed responsibility", 0),
      () => removeTeamMember(hackathonId, uc.id, contact.id, 0),
      () => createContact(hackathonId, { name: "New member", roleType: "IT" }),
      () => updateContact(hackathonId, contact.id, { name: "Changed member" }, 0),
      () => deleteContact(hackathonId, contact.id, 0),
      () => saveHandoff(hackathonId, uc.id, { businessOwner: "Replacement owner" }, 0),
      () => closeUseCase(hackathonId, uc.id, 0, 0),
      () => saveRunbookCheck(hackathonId, "demo-readout", { ...completeCheck, status: "Blocked" }, 0),
    ];
    for (const mutate of mutations) expect(await mutate()).toMatchObject({ ok: false, code: "validation" });
    expect(await event()).toMatchObject({ status, version: 0 });
    expect(await storedCase(uc.id)).toMatchObject({ title: uc.title, status: "Draft", version: 0 });
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ name: contact.name, version: 0 });
    expect(await db.handoff.findUnique({ where: { useCaseId: uc.id } })).toMatchObject({ businessOwner: completeHandoff.businessOwner, version: 0 });
    expect(await db.runbookCheck.count({ where: { hackathonId, templateVersion: template.version } })).toBe(template.checks.length);
  });

  it("keeps eligible follow-up checks usable without rewriting closed readiness evidence", async () => {
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Closed" } });
    expect(await saveRunbookCheck(hackathonId, "sponsor-charter", completeCheck, -1)).toMatchObject({ ok: false, code: "validation" });
    expect(await saveRunbookCheck(hackathonId, "value-checkin", completeCheck, -1)).toMatchObject({ ok: true });
    expect((await event()).status).toBe("Closed");
  });

  it("records measured outcomes and follow-up progress after closure without rewriting the exit decision", async () => {
    const uc = await createCase("Closed");
    await db.handoff.create({ data: {
      useCaseId: uc.id, ...completeHandoff, nextMilestoneDate: new Date(completeHandoff.nextMilestoneDate),
      whatWasBuilt: "Recorded demonstration", demoOrBlocker: "Synthetic demo reference",
    } });
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Closed" } });
    expect(await saveHandoff(hackathonId, uc.id, {
      ...completeHandoff, whatWasBuilt: "Recorded demonstration", demoOrBlocker: "Synthetic demo reference",
      outcomeDemonstrated: "Pilot measurement: six hours saved", gaps: "Needs a larger sample",
      nextMilestone: "30-day value review", nextMilestoneDate: "2026-12-01",
    }, 0)).toMatchObject({ ok: true, data: { version: 1 } });
    expect(await db.handoff.findUnique({ where: { useCaseId: uc.id } })).toMatchObject({
      outcomeDemonstrated: "Pilot measurement: six hours saved", nextMilestone: "30-day value review",
    });
    expect(await saveHandoff(hackathonId, uc.id, { portfolioDecision: "Stop" }, 1)).toMatchObject({ ok: false, code: "validation" });
    expect(await saveHandoff(hackathonId, uc.id, { whatWasBuilt: "Different prototype" }, 1)).toMatchObject({ ok: false, code: "validation" });
    expect(await saveHandoff(hackathonId, uc.id, { nextMilestoneDate: "" }, 1)).toMatchObject({ ok: false, code: "validation" });
    expect(await db.runbookCheck.count({ where: { hackathonId, templateVersion: template.version } })).toBe(template.checks.length);
    expect(await event()).toMatchObject({ status: "Closed" });
  });

  it("restores only through Planning and still permits access revocation while archived", async () => {
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Archived" } });
    expect(await updateHackathon(hackathonId, { name: "Changed while archived" }, 0)).toMatchObject({ ok: false });
    expect(await updateHackathon(hackathonId, { status: "Running" }, 0)).toMatchObject({ ok: false });
    state.userId = contributorId;
    expect(await updateHackathon(hackathonId, { status: "Planning" }, 0)).toMatchObject({ ok: false });
    state.userId = ownerId;
    expect(await removeMember(hackathonId, contributorId)).toMatchObject({ ok: true });
    expect(await updateHackathon(hackathonId, { status: "Planning" }, (await event()).version)).toMatchObject({ ok: true });
    const runbook = await readRunbook(hackathonId);
    expect(missingRunbookChecks(runbook.items, template.version, "Start")).not.toHaveLength(0);
    expect(await createUseCase(hackathonId, { title: "New restored case" })).toMatchObject({ ok: true });
  });

  it("cannot restart a closed event or reuse closure evidence after reopening its case", async () => {
    const uc = await createCase("Closed");
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Closed" } });
    expect(await updateHackathon(hackathonId, { status: "Running" }, 0)).toMatchObject({ ok: false });
    expect(await updateHackathon(hackathonId, { status: "Planning" }, 0)).toMatchObject({ ok: true });
    expect(await updateUseCase(hackathonId, uc.id, { title: "Unreviewed scope" }, 0)).toMatchObject({ ok: false });
    expect(await updateUseCase(hackathonId, uc.id, { status: "Draft" }, 0)).toMatchObject({ ok: true });
    const runbook = await readRunbook(hackathonId);
    expect(missingRunbookChecks(runbook.items, template.version, "Close")).toHaveLength(template.checks.filter((check) => check.gate === "Close").length);
  });

  it("protects a closed case's team against indirect contact mutations", async () => {
    const uc = await createCase("Closed");
    const contact = await db.contact.create({ data: { hackathonId, name: "Original owner", roleType: "BusinessOwner" } });
    await db.teamMember.create({ data: { useCaseId: uc.id, contactId: contact.id, party: "Customer" } });
    expect(await assignTeamMember(hackathonId, uc.id, contact.id, "Partner", "", 0)).toMatchObject({ ok: false, code: "validation" });
    expect(await removeTeamMember(hackathonId, uc.id, contact.id, 0)).toMatchObject({ ok: false, code: "validation" });
    expect(await updateContact(hackathonId, contact.id, { roleType: "IT" }, 0)).toMatchObject({ ok: false, code: "validation" });
    expect(await deleteContact(hackathonId, contact.id, 0)).toMatchObject({ ok: false, code: "validation" });
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ roleType: "BusinessOwner", version: 0 });
  });
});

describe("scope-bound runbook evidence", () => {
  it("saves an unfinished runbook owner on a fresh workspace without completion evidence", async () => {
    expect(await saveRunbookCheck(hackathonId, "sponsor-charter", {
      status: "NotStarted", owner: "Facilitator", dueDate: "", evidence: "",
    }, -1)).toMatchObject({ ok: true });
    expect(await db.runbookCheck.findUnique({
      where: { hackathonId_templateId: { hackathonId, templateId: "sponsor-charter" } },
    })).toMatchObject({ status: "NotStarted", owner: "Facilitator", dueDate: null, evidence: "", version: 0 });
  });

  it.each([
    { name: "Different workspace" }, { customer: "Different customer" },
  ])("requires evidence review after a workspace identity change: %j", async (change) => {
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Ready" } });
    expect(await updateHackathon(hackathonId, change, 0)).toMatchObject({ ok: true });
    expect(await event()).toMatchObject({ status: "Planning", version: 1 });
    const saved = await db.runbookCheck.findMany({ where: { hackathonId } });
    expect(saved.every((row) => row.templateVersion === "" && row.version === 1 && row.evidence === completeCheck.evidence &&
      row.dueDate?.toISOString().slice(0, 10) === completeCheck.dueDate)).toBe(true);
    expect(await updateHackathon(hackathonId, { status: "Running" }, 1)).toMatchObject({ ok: false });
    expect(await saveRunbookCheck(hackathonId, template.checks[0].id, completeCheck, 0)).toMatchObject({ ok: false, code: "conflict" });
  });

  it("does not invalidate evidence for unchanged workspace settings", async () => {
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Ready" } });
    expect(await updateHackathon(hackathonId, { name: "Workflow review", customer: "Synthetic customer" }, 0)).toMatchObject({ ok: true });
    expect(await event()).toMatchObject({ status: "Ready" });
    expect(await db.runbookCheck.count({ where: { hackathonId, templateVersion: template.version, version: 0 } })).toBe(template.checks.length);
  });

  it("rejects changing workspace identity and entering Running using old evidence in one request", async () => {
    await completeRunbook();
    expect(await updateHackathon(hackathonId, { customer: "Other customer", status: "Running" }, 0)).toMatchObject({ ok: false });
    expect(await event()).toMatchObject({ customer: "Synthetic customer", version: 0 });
    expect(await db.runbookCheck.count({ where: { hackathonId, templateVersion: template.version } })).toBe(template.checks.length);
  });

  it("invalidates participant evidence and Ready status when the build team changes", async () => {
    const uc = await createCase();
    const contact = await db.contact.create({ data: { hackathonId, name: "New participant", roleType: "IT" } });
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Ready" } });
    expect(await assignTeamMember(hackathonId, uc.id, contact.id, "Customer", "Builder", 0)).toMatchObject({ ok: true });
    expect(await event()).toMatchObject({ status: "Planning" });
    expect(await db.runbookCheck.findUnique({ where: { hackathonId_templateId: { hackathonId, templateId: "environment-access" } } })).toMatchObject({ templateVersion: "", version: 1 });
  });

  it("keeps evidence current for an unchanged team assignment and unrelated contact corrections", async () => {
    const uc = await createCase();
    const contact = await db.contact.create({ data: { hackathonId, name: "Current participant", roleType: "IT" } });
    const unrelated = await db.contact.create({ data: { hackathonId, name: "Unassigned contact", roleType: "Mentor" } });
    await db.teamMember.create({ data: { useCaseId: uc.id, contactId: contact.id, party: "Customer", responsibility: "Builder" } });
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Ready" } });
    expect(await assignTeamMember(hackathonId, uc.id, contact.id, "Customer", "Builder", 0)).toMatchObject({ ok: true });
    expect(await updateContact(hackathonId, unrelated.id, { name: "Corrected contact name" }, 0)).toMatchObject({ ok: true });
    expect(await event()).toMatchObject({ status: "Ready" });
    expect(await db.runbookCheck.count({ where: { hackathonId, templateVersion: template.version, version: 0 } })).toBe(template.checks.length);
  });

  it("demotes Ready when a start check is reopened", async () => {
    await completeRunbook();
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Ready" } });
    expect(await saveRunbookCheck(hackathonId, "environment-access", { ...completeCheck, status: "Blocked" }, 0)).toMatchObject({ ok: true });
    expect(await event()).toMatchObject({ status: "Planning" });
  });

  it("leaves new checks undated and never fills a missing saved completion date", async () => {
    expect((await readRunbook(hackathonId)).items).toHaveLength(21);
    expect((await readRunbook(hackathonId)).items.every((check) => check.dueDate === "")).toBe(true);
    await db.runbookCheck.create({ data: {
      hackathonId, templateId: "sponsor-charter", templateVersion: template.version,
      status: "Done", owner: "Reviewer", evidence: "Legacy reference", updatedBy: ownerId, dueDate: null,
    } });
    const runbook = await readRunbook(hackathonId);
    const item = runbook.items.find((row) => row.id === "sponsor-charter")!;
    expect(item.dueDate).toBe("");
    expect(isRunbookItemComplete(item, template.version)).toBe(false);
  });

  it.each([
    { owner: " \t " }, { evidence: " \n " }, { dueDate: "2026-02-30" }, { dueDate: "not a date" },
  ])("rejects corrupted persisted completion evidence: %j", (corruption) => {
    expect(isRunbookItemComplete({
      ...template.checks[0], ...completeCheck, version: 0, templateVersion: template.version,
      updatedBy: ownerId, updatedAt: null, ...corruption,
    }, template.version)).toBe(false);
  });
});

describe("optimistic concurrency and authorization at the write boundary", () => {
  it("shares read-only preflight checks without replacing the transactional state recheck", async () => {
    const actor = { userId: ownerId, role: "Owner" as const };
    await expect(assertWorkspaceWriteAccess(hackathonId, actor)).resolves.toEqual({ status: "Planning" });
    expect((await event()).version).toBe(0);
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Archived" } });
    await expect(db.$transaction((tx) => assertWorkspaceWriteAccess(hackathonId, actor, tx))).rejects.toMatchObject({
      __validation: { status: [expect.stringContaining("Restore the archived event")] },
    });
    await db.hackathon.update({ where: { id: hackathonId }, data: { status: "Closed" } });
    await expect(assertWorkspaceWriteAccess(hackathonId, actor)).rejects.toMatchObject({
      __validation: { status: [expect.stringContaining("Reopen the event")] },
    });
    await expect(assertWorkspaceWriteAccess(hackathonId, actor, db, { allowClosed: true })).resolves.toEqual({ status: "Closed" });
    await db.membership.update({
      where: { userId_hackathonId: { userId: ownerId, hackathonId } }, data: { role: "Viewer" },
    });
    await expect(assertWorkspaceWriteAccess(hackathonId, { userId: ownerId, role: "Viewer" }, db, { allowClosed: true })).rejects.toThrow("access changed");
  });

  it("rejects stale deletes and archives instead of destroying newer edits", async () => {
    const uc = await createCase();
    const contact = await db.contact.create({ data: { hackathonId, name: "Original contact", roleType: "IT" } });
    expect(await updateUseCase(hackathonId, uc.id, { title: "New scope" }, 0)).toMatchObject({ ok: true });
    expect(await updateContact(hackathonId, contact.id, { name: "New contact" }, 0)).toMatchObject({ ok: true });
    expect(await deleteUseCase(hackathonId, uc.id, 0)).toMatchObject({ ok: false, code: "conflict" });
    expect(await deleteContact(hackathonId, contact.id, 0)).toMatchObject({ ok: false, code: "conflict" });
    expect(await archiveHackathon(hackathonId, 0)).toMatchObject({ ok: false, code: "conflict" });
    expect(await storedCase(uc.id)).toMatchObject({ title: "New scope", version: 1 });
    expect(await archiveHackathon(hackathonId, (await event()).version)).toMatchObject({ ok: true });
  });

  it("rejects stale team edits/removals and requires versions on destructive operations", async () => {
    const uc = await createCase();
    const contact = await db.contact.create({ data: { hackathonId, name: "Team member", roleType: "IT" } });
    expect(await assignTeamMember(hackathonId, uc.id, contact.id, "Customer", "Original work", 0)).toMatchObject({ ok: true, data: { version: 1 } });
    expect(await assignTeamMember(hackathonId, uc.id, contact.id, "Partner", "Stale work", 0)).toMatchObject({ ok: false, code: "conflict" });
    expect(await removeTeamMember(hackathonId, uc.id, contact.id, 0)).toMatchObject({ ok: false, code: "conflict" });
    expect(await db.teamMember.findUnique({ where: { useCaseId_contactId: { useCaseId: uc.id, contactId: contact.id } } })).toMatchObject({ party: "Customer", responsibility: "Original work" });
    expect(await deleteUseCase(hackathonId, uc.id, undefined as never)).toMatchObject({ ok: false, code: "validation" });
    expect(await archiveHackathon(hackathonId, undefined as never)).toMatchObject({ ok: false, code: "validation" });
    expect(await saveRunbookCheck(hackathonId, "sponsor-charter", completeCheck, -2)).toMatchObject({ ok: false, code: "validation" });
  });

  it("protects new handoff content from a stale close or cascaded case delete", async () => {
    const uc = await createCase();
    expect(await saveHandoff(hackathonId, uc.id, completeHandoff, null)).toMatchObject({ ok: true, data: { version: 0, useCaseVersion: 1 } });
    expect(await saveHandoff(hackathonId, uc.id, { nextMilestone: "New agreed milestone" }, 0)).toMatchObject({ ok: true, data: { version: 1, useCaseVersion: 2 } });
    expect(await closeUseCase(hackathonId, uc.id, 1, 0)).toMatchObject({ ok: false, code: "conflict" });
    expect(await closeUseCase(hackathonId, uc.id, 2, 0)).toMatchObject({ ok: false, code: "conflict" });
    expect(await deleteUseCase(hackathonId, uc.id, 1)).toMatchObject({ ok: false, code: "conflict" });
    expect(await closeUseCase(hackathonId, uc.id, 2, 1)).toMatchObject({ ok: true });
  });

  it.each(["revoked", "demoted"] as const)("rechecks %s membership inside the transaction after the initial access check", async (change) => {
    const uc = await createCase();
    state.afterAccess = async () => {
      const where = { userId_hackathonId: { userId: ownerId, hackathonId } };
      if (change === "revoked") await db.membership.delete({ where });
      else await db.membership.update({ where, data: { role: "Contributor" } });
    };
    // updateHackathon only requires Contributor, but archiving requires its
    // originally observed Owner role; a downgrade must invalidate that decision.
    const result = change === "revoked"
      ? await deleteUseCase(hackathonId, uc.id, 0)
      : await updateHackathon(hackathonId, { status: "Archived" }, 0);
    expect(result).toMatchObject({ ok: false, code: "denied" });
    expect(await event()).toMatchObject({ status: "Planning", version: 0 });
    expect(await storedCase(uc.id)).toMatchObject({ version: 0 });
  });
});
