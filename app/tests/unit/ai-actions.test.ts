import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMethodology } from "@/lib/methodology";

const state = vi.hoisted(() => ({
  user: { id: "user", name: "User", email: "user@example.test", globalRole: "User" },
  prisma: {
    $transaction: vi.fn(),
    hackathon: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    membership: { findUnique: vi.fn() },
    runbookCheck: { updateMany: vi.fn() },
    useCase: { findFirst: vi.fn(), updateMany: vi.fn() },
    contact: { findMany: vi.fn() },
    evaluation: { findFirst: vi.fn(), create: vi.fn() },
    evaluationOverride: { deleteMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    aiUsage: { count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
  evaluate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => state.user,
  assertAccess: async () => "Contributor",
  AccessDeniedError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", async (original) => ({
  ...await original<typeof import("@/lib/db")>(), prisma: state.prisma,
}));
vi.mock("@/lib/ai/evaluator", async (original) => ({
  ...await original<typeof import("@/lib/ai/evaluator")>(), evaluateUseCase: state.evaluate,
}));
import { clearOverride, evaluateUseCaseAction, overrideEvaluation } from "@/lib/actions/evaluation";

const useCase = {
  id: "case", hackathonId: "workspace", code: "UC-01", title: "Use case", version: 0,
  status: "Draft", teamMembers: [],
};
const outcome = {
  valueScore: 3, feasibilityScore: 3, dataReadinessScore: 3, reusabilityScore: 3,
  weightedScore: 3, priorityBand: "Medium", csFitBand: "Strong", recommendedPlatform: "CopilotStudio",
  confidence: .7, routingSignals: ["conversational"],
  gateResults: getMethodology().gates.gates.map((gate) => ({ gate: gate.id, label: gate.label, kind: gate.kind, pass: false })),
  rationale: "Evidence is missing", model: "mock-model", promptVersion: "1",
  methodologyVersion: getMethodology().version, rubricSnapshot: JSON.stringify(getMethodology().rubric),
  usage: { promptTokens: 0, completionTokens: 0 },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.prisma.$transaction.mockImplementation((work) => work(state.prisma));
  state.prisma.hackathon.findUniqueOrThrow.mockResolvedValue({ status: "Planning" });
  state.prisma.hackathon.updateMany.mockResolvedValue({ count: 1 });
  state.prisma.membership.findUnique.mockResolvedValue({ role: "Contributor" });
  state.prisma.runbookCheck.updateMany.mockResolvedValue({ count: 0 });
  state.prisma.useCase.findFirst.mockResolvedValue(useCase);
  state.prisma.useCase.updateMany.mockResolvedValue({ count: 1 });
  state.prisma.contact.findMany.mockResolvedValue([]);
  state.prisma.evaluation.findFirst.mockResolvedValue(null);
  state.prisma.evaluation.create.mockImplementation(({ data }) => ({ id: "evaluation", ...data }));
  state.prisma.aiUsage.count.mockResolvedValue(0);
  state.prisma.aiUsage.create.mockResolvedValue({ id: "reservation" });
  state.prisma.aiUsage.update.mockResolvedValue({});
  state.prisma.aiUsage.updateMany.mockResolvedValue({ count: 0 });
  state.prisma.evaluationOverride.updateMany.mockResolvedValue({ count: 1 });
  state.evaluate.mockResolvedValue(outcome);
});
afterEach(() => vi.restoreAllMocks());

describe("AI mutations", () => {
  it("never clears an override from another workspace or use case", async () => {
    const result = await clearOverride("workspace", "case", "other-evaluation", 0);
    expect(result.ok).toBe(false);
    expect(state.prisma.evaluation.findFirst).toHaveBeenCalledWith({
      where: { id: "other-evaluation", useCase: { id: "case", hackathonId: "workspace" } },
      include: { override: true },
    });
    expect(state.prisma.evaluationOverride.deleteMany).not.toHaveBeenCalled();
  });
  it("also scopes the deletion itself after checking membership", async () => {
    state.prisma.evaluation.findFirst.mockResolvedValue({ id: "evaluation", override: { version: 0 } });
    expect((await clearOverride("workspace", "case", "evaluation", 0)).ok).toBe(true);
    expect(state.prisma.evaluationOverride.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { evaluationId: "evaluation", version: 0, evaluation: { useCase: { id: "case", hackathonId: "workspace" } } },
      data: expect.objectContaining({ overriddenFields: "[]", version: { increment: 1 } }),
    }));
  });
  it("does not qualify an evaluated Draft with failing gates", async () => {
    const result = await evaluateUseCaseAction("workspace", "case");
    expect(result.ok).toBe(true);
    expect(state.prisma.useCase.updateMany).not.toHaveBeenCalled();
    expect(state.prisma.aiUsage.create.mock.invocationCallOrder[0]).toBeLessThan(state.evaluate.mock.invocationCallOrder[0]);
    expect(state.prisma.evaluation.create.mock.calls[0][0].data.useCaseSnapshot).toContain("sourceVersion");
  });
  it("qualifies a Draft only with passing gates and increments its version", async () => {
    state.evaluate.mockResolvedValue({ ...outcome, gateResults: outcome.gateResults.map((gate) => ({ ...gate, pass: true })) });
    expect((await evaluateUseCaseAction("workspace", "case")).ok).toBe(true);
    expect(state.prisma.useCase.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "Qualified", version: { increment: 1 } },
    }));
  });
  it("does not save stale results after a concurrent canvas update", async () => {
    state.prisma.useCase.findFirst.mockResolvedValueOnce(useCase).mockResolvedValueOnce({ ...useCase, version: 1 });
    const result = await evaluateUseCaseAction("workspace", "case");
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(state.prisma.evaluation.create).not.toHaveBeenCalled();
  });
  it("refuses to save an evaluation when access is revoked during the model call", async () => {
    state.evaluate.mockImplementation(async () => {
      state.prisma.membership.findUnique.mockResolvedValue({ role: "Viewer" });
      return outcome;
    });
    const result = await evaluateUseCaseAction("workspace", "case");
    expect(result.ok).toBe(false);
    expect(state.prisma.evaluation.create).not.toHaveBeenCalled();
    expect(state.prisma.aiUsage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "error" }),
    }));
  });
  it("sanitizes provider errors before returning or persisting them", async () => {
    state.evaluate.mockRejectedValue(new Error("secret-api-key full prompt customer data"));
    const result = await evaluateUseCaseAction("workspace", "case");
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret-api-key");
    expect(JSON.stringify(state.prisma.aiUsage.update.mock.calls)).not.toContain("customer data");
  });
  it("logs only safe reservation metadata when failure accounting cannot be persisted", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.evaluate.mockRejectedValue(new Error("private provider input"));
    state.prisma.aiUsage.update.mockRejectedValue(new Error("private database payload"));
    const result = await evaluateUseCaseAction("workspace", "case");
    expect(result).toMatchObject({ ok: false, error: "AI generation failed. Check the service configuration and retry." });
    expect(log).toHaveBeenCalledWith("AI persistence failure", {
      stage: "evaluation-accounting", jobId: "reservation",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });
  it("rejects malformed ids and override fields before mutation", async () => {
    expect((await clearOverride("workspace", "../case", "evaluation", null)).ok).toBe(false);
    expect((await overrideEvaluation("workspace", "case", "evaluation", { valueScore: Infinity }, null)).ok).toBe(false);
    expect((await overrideEvaluation("workspace", "case", "evaluation", { gateResults: [] }, null)).ok).toBe(false);
    expect(state.prisma.evaluationOverride.upsert).not.toHaveBeenCalled();
  });
  it("requires an explicit revision before any override write or clear", async () => {
    expect((await clearOverride("workspace", "case", "evaluation")).ok).toBe(false);
    expect((await overrideEvaluation("workspace", "case", "evaluation", { valueScore: 4, reason: "Human review" })).ok).toBe(false);
    expect(state.prisma.evaluation.findFirst).not.toHaveBeenCalled();
  });
});
