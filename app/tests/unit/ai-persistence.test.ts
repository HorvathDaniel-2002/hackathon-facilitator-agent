import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createAiTestDatabase } from "./ai-database";

const lifecycle = vi.hoisted(() => ({ userId: "ai-test-user", jobs: [] as Array<() => Promise<unknown>> }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: lifecycle.userId }),
  assertAccess: async () => "Contributor",
  AccessDeniedError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (job: () => Promise<unknown>) => lifecycle.jobs.push(job) }));

const databasePath = path.join(process.cwd(), "tests", "unit", `.ai-persistence-${randomUUID()}.db`);
let db: PrismaClient;
let actions: typeof import("@/lib/actions/evaluation");
let route: typeof import("@/app/api/build-guide/route");

beforeAll(async () => {
  createAiTestDatabase(databasePath);
  db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  vi.doMock("@/lib/db", async () => ({
    ...await vi.importActual<typeof import("@/lib/db")>("@/lib/db"), prisma: db,
  }));
  actions = await import("@/lib/actions/evaluation");
  route = await import("@/app/api/build-guide/route");
}, 60_000);
beforeEach(async () => {
  lifecycle.jobs.length = 0;
  await db.aiUsage.deleteMany();
  await db.hackathon.deleteMany();
  vi.stubEnv("AI_DAILY_CALL_BUDGET", "100");
  vi.stubEnv("AI_MAX_CONCURRENT_CALLS", "8");
  vi.stubEnv("AI_MAX_CONCURRENT_PER_USER", "2");
});
afterAll(async () => {
  await Promise.all(lifecycle.jobs.map((job) => job()));
  await db?.$disconnect();
  vi.unstubAllEnvs();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(databasePath + suffix, { force: true });
});

async function fixture() {
  await db.user.upsert({
    where: { id: lifecycle.userId }, update: {},
    create: { id: lifecycle.userId, name: "AI test user", email: "ai-test@example.invalid" },
  });
  const hackathon = await db.hackathon.create({ data: {
    name: "AI test workspace", customer: "Synthetic",
    memberships: { create: { userId: lifecycle.userId, role: "Contributor" } },
  } });
  const useCase = await db.useCase.create({ data: {
    hackathonId: hackathon.id, code: "UC-01", title: "Policy knowledge helper",
    description: "Answer policy questions in Teams with SharePoint.",
    businessOwner: "Synthetic owner", dataSources: "Synthetic policy sample",
    sampleDataApproved: true, processOwnerConfirmed: true,
    smallestSlice: "Answer one policy question", successMetric: "Minutes saved per question",
    humanApprovalPoint: "Human reviews read-only answer.", agentOutput: "Read-only response",
  } });
  const contact = await db.contact.create({ data: {
    hackathonId: hackathon.id, name: "Synthetic owner", roleType: "BusinessOwner",
  } });
  await db.teamMember.create({ data: { useCaseId: useCase.id, contactId: contact.id, party: "Customer" } });
  return { hackathon, useCase, contact };
}
const guideRequest = (hackathonId: string, useCaseId: string) => new Request("http://localhost/api/build-guide", {
  method: "POST",
  headers: { origin: "http://localhost", "content-type": "application/json" },
  body: JSON.stringify({ hackathonId, useCaseId }),
});

describe("AI persistence with real Prisma and isolated SQLite", () => {
  it.each(["Closed", "Archived"])("does not generate or override artifacts in a %s event", async (status) => {
    const { hackathon, useCase } = await fixture();
    expect((await actions.evaluateUseCaseAction(hackathon.id, useCase.id)).ok).toBe(true);
    const evaluation = await db.evaluation.findFirstOrThrow({ where: { useCaseId: useCase.id } });
    const calls = await db.aiUsage.count();
    await db.hackathon.update({ where: { id: hackathon.id }, data: { status } });
    expect((await actions.evaluateUseCaseAction(hackathon.id, useCase.id)).ok).toBe(false);
    expect((await actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, { rationale: "Attempted edit", reason: "Test" }, null)).ok).toBe(false);
    expect((await actions.clearOverride(hackathon.id, useCase.id, evaluation.id, null)).ok).toBe(false);
    const response = await route.POST(guideRequest(hackathon.id, useCase.id));
    expect(response.status).toBe(409);
    expect(await db.aiUsage.count()).toBe(calls);
    expect(await db.evaluation.count()).toBe(1);
    expect(await db.evaluationOverride.count()).toBe(0);
    expect(await db.buildGuide.count()).toBe(0);
  });
  it("rechecks actual stored membership even when the outer request was previously authorized", async () => {
    const { hackathon, useCase } = await fixture();
    await db.membership.updateMany({ where: { hackathonId: hackathon.id }, data: { role: "Viewer" } });
    const result = await actions.evaluateUseCaseAction(hackathon.id, useCase.id);
    expect(result.ok).toBe(false);
    const response = await route.POST(guideRequest(hackathon.id, useCase.id));
    expect(response.status).toBe(403);
    expect(await db.aiUsage.count()).toBe(0);
  });
  it("evaluates, qualifies, generates and saves provenance/usage atomically", async () => {
    const { hackathon, useCase } = await fixture();
    const result = await actions.evaluateUseCaseAction(hackathon.id, useCase.id);
    expect(result.ok).toBe(true);
    const evaluation = await db.evaluation.findFirstOrThrow({ where: { useCaseId: useCase.id } });
    expect(evaluation.rubricSnapshot).toContain("weights");
    expect(evaluation.useCaseSnapshot).toContain("sourceVersion");
    expect((await db.useCase.findUniqueOrThrow({ where: { id: useCase.id } })).status).toBe("Qualified");
    const response = await route.POST(guideRequest(hackathon.id, useCase.id));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("## Production scaling");
    await Promise.all(lifecycle.jobs.map((job) => job()));
    expect(await db.buildGuide.count({ where: { useCaseId: useCase.id } })).toBe(1);
    const guide = await db.buildGuide.findFirstOrThrow();
    expect(guide.status).toBe("complete");
    expect(guide.evaluationId).toBe(evaluation.id);
    expect(guide.inputSnapshot).toContain("evaluationVersion");
    expect(await db.aiUsage.count({ where: { status: "ok" } })).toBe(2);
    expect(await db.aiUsage.count({ where: { status: "reserved" } })).toBe(0);
  });
  it("keeps missing-evidence drafts unqualified", async () => {
    const { hackathon, useCase } = await fixture();
    await db.useCase.update({ where: { id: useCase.id }, data: { sampleDataApproved: false } });
    expect((await actions.evaluateUseCaseAction(hackathon.id, useCase.id)).ok).toBe(true);
    expect((await db.useCase.findUniqueOrThrow({ where: { id: useCase.id } })).status).toBe("Draft");
  });
  it("allocates unique append-only evaluation versions under concurrency", async () => {
    const { hackathon, useCase } = await fixture();
    await db.useCase.update({ where: { id: useCase.id }, data: { status: "Qualified" } });
    const results = await Promise.all([
      actions.evaluateUseCaseAction(hackathon.id, useCase.id),
      actions.evaluateUseCaseAction(hackathon.id, useCase.id),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const evaluations = await db.evaluation.findMany({ where: { useCaseId: useCase.id }, orderBy: { version: "asc" } });
    expect(evaluations.map((evaluation) => evaluation.version)).toEqual([1, 2]);
  });
  it("refuses another workspace's override even for a valid evaluation ID", async () => {
    const first = await fixture();
    const second = await fixture();
    const result = await actions.evaluateUseCaseAction(second.hackathon.id, second.useCase.id);
    expect(result.ok).toBe(true);
    const evaluation = await db.evaluation.findFirstOrThrow({ where: { useCaseId: second.useCase.id } });
    await db.evaluationOverride.create({ data: {
      evaluationId: evaluation.id, overriddenFields: '["rationale"]', rationale: "Human review",
      reason: "New evidence", overriddenBy: lifecycle.userId,
    } });
    expect((await actions.clearOverride(first.hackathon.id, first.useCase.id, evaluation.id, 0)).ok).toBe(false);
    expect(await db.evaluationOverride.count({ where: { evaluationId: evaluation.id } })).toBe(1);
  });
  it("preserves omitted human override fields and rejects empty mutations", async () => {
    const { hackathon, useCase } = await fixture();
    expect((await actions.evaluateUseCaseAction(hackathon.id, useCase.id)).ok).toBe(true);
    const evaluation = await db.evaluation.findFirstOrThrow({ where: { useCaseId: useCase.id } });
    const valueScore = evaluation.valueScore === 5 ? 4 : 5;
    expect((await actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, {
      valueScore, reason: "Measured value is different.",
    }, null)).ok).toBe(true);
    expect((await actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, {
      recommendedPlatform: "Hybrid", reason: "Specialist processing is deferred.",
    }, 0)).ok).toBe(true);
    expect(await db.evaluationOverride.findUniqueOrThrow({ where: { evaluationId: evaluation.id } }))
      .toMatchObject({ valueScore, recommendedPlatform: "Hybrid" });
    expect((await actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, {}, 1)).ok).toBe(false);
    expect((await actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, {
      valueScore: evaluation.valueScore, reason: "Restore original value.",
    }, 1)).ok).toBe(true);
    expect(await db.evaluationOverride.findUniqueOrThrow({ where: { evaluationId: evaluation.id } }))
      .toMatchObject({ valueScore: null, recommendedPlatform: "Hybrid" });
  });
  it("rejects concurrent and stale overrides without losing the winning edit, including after clear", async () => {
    const { hackathon, useCase } = await fixture();
    await actions.evaluateUseCaseAction(hackathon.id, useCase.id);
    const evaluation = await db.evaluation.findFirstOrThrow({ where: { useCaseId: useCase.id } });
    const score = evaluation.valueScore === 5 ? 4 : 5;
    const results = await Promise.all([
      actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, { valueScore: score, reason: "Measured benefit" }, null),
      actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, { recommendedPlatform: "Hybrid", reason: "Specialist requirement" }, null),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([expect.objectContaining({ code: "conflict" })]);
    const first = await db.evaluationOverride.findUniqueOrThrow({ where: { evaluationId: evaluation.id } });
    expect(first.version).toBe(0);
    const secondEdit = first.valueScore === score
      ? { recommendedPlatform: "Hybrid", reason: "Preserve measured benefit and add platform" }
      : { valueScore: score, reason: "Preserve platform and add measured benefit" };
    expect((await actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, secondEdit, 0)).ok).toBe(true);
    expect(await db.evaluationOverride.findUniqueOrThrow({ where: { evaluationId: evaluation.id } }))
      .toMatchObject({ version: 1, valueScore: score, recommendedPlatform: "Hybrid" });
    expect(await actions.clearOverride(hackathon.id, useCase.id, evaluation.id, 0)).toMatchObject({ ok: false, code: "conflict" });
    expect((await actions.clearOverride(hackathon.id, useCase.id, evaluation.id, 1)).ok).toBe(true);
    expect(await db.evaluationOverride.findUniqueOrThrow({ where: { evaluationId: evaluation.id } }))
      .toMatchObject({ version: 2, valueScore: null, recommendedPlatform: null, overriddenFields: "[]" });
    expect(await actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, secondEdit, null))
      .toMatchObject({ ok: false, code: "conflict" });
    expect(await actions.overrideEvaluation(hackathon.id, useCase.id, evaluation.id, secondEdit, 0))
      .toMatchObject({ ok: false, code: "conflict" });
  });
  it("allows status-only changes but refuses a changed canvas before guide generation", async () => {
    const { hackathon, useCase } = await fixture();
    expect((await actions.evaluateUseCaseAction(hackathon.id, useCase.id)).ok).toBe(true);
    await db.useCase.update({ where: { id: useCase.id }, data: { status: "Selected", version: { increment: 1 } } });
    const response = await route.POST(guideRequest(hackathon.id, useCase.id));
    expect(response.status).toBe(200);
    await response.text();
    await Promise.all(lifecycle.jobs.map((job) => job()));
    await db.useCase.update({ where: { id: useCase.id }, data: { title: "Changed evidence", version: { increment: 1 } } });
    const stale = await route.POST(guideRequest(hackathon.id, useCase.id));
    expect(stale.status).toBe(409);
    expect(await db.buildGuide.count()).toBe(1);
  });
});
