import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  AccessDeniedError: class extends Error {},
  prisma: {
    $transaction: vi.fn(),
    hackathon: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    membership: { findUnique: vi.fn() },
    useCase: { findFirst: vi.fn() },
    buildGuide: { updateMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    aiUsage: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  stream: vi.fn(),
  jobs: [] as Array<() => Promise<unknown>>,
  access: vi.fn(),
  saved: new Map<string, Record<string, unknown>>(),
}));
vi.mock("next/server", () => ({ after: (job: () => Promise<unknown>) => state.jobs.push(job) }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: "user" }), assertAccess: state.access,
  AccessDeniedError: state.AccessDeniedError,
}));
vi.mock("@/lib/db", async (original) => ({
  ...await original<typeof import("@/lib/db")>(), prisma: state.prisma,
}));
vi.mock("@/lib/ai/guide", async (original) => ({
  ...await original<typeof import("@/lib/ai/guide")>(), streamBuildGuide: state.stream,
}));
import { POST } from "@/app/api/build-guide/route";
import { getMethodology } from "@/lib/methodology";
import { evaluationSnapshot, gateFactsFromUseCase } from "@/lib/ai/provenance";

const validText = "## Hackathon MVP\nBuild one approved sandbox path.\n\n## Production scaling\nReview and harden before a pilot.";
const latest = {
  id: "evaluation", version: 1, useCaseVersion: 0, useCaseId: "case",
  valueScore: 3, feasibilityScore: 3, dataReadinessScore: 3, reusabilityScore: 3,
  weightedScore: 3, priorityBand: "Medium", recommendedPlatform: "CopilotStudio", csFitBand: "Strong",
  confidence: .7, gateResults: '[{"gate":"hasBusinessOwner","label":"Owner","kind":"deterministic","pass":true}]',
  routingSignals: "[]", rationale: "Advice", source: "mock", model: "mock-model",
  promptVersion: "1", methodologyVersion: getMethodology().version, override: null, generatedAt: new Date(),
};
const useCase = {
  id: "case", hackathonId: "workspace", code: "UC-01", title: "Policy helper", version: 0,
  hackathon: { format: "2day" }, teamMembers: [],
};
const request = (body: unknown = { hackathonId: "workspace", useCaseId: "case" }, origin = "http://localhost") =>
  new Request("http://localhost/api/build-guide", {
    method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
  });
const finishJobs = async () => { await Promise.all(state.jobs.map((job) => job())); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  state.jobs.length = 0;
  state.saved.clear();
  state.prisma.hackathon.findUniqueOrThrow.mockResolvedValue({ status: "Planning" });
  state.prisma.hackathon.updateMany.mockResolvedValue({ count: 1 });
  state.prisma.membership.findUnique.mockResolvedValue({ role: "Contributor" });
  state.prisma.$transaction.mockImplementation(async (work) => {
    const snapshot = new Map([...state.saved.entries()].map(([key, value]) => [key, { ...value }]));
    try { return await work(state.prisma); }
    catch (error) { state.saved = snapshot; throw error; }
  });
  afterEach(() => vi.restoreAllMocks());
  state.prisma.useCase.findFirst.mockResolvedValue({ ...useCase, evaluations: [{
    ...latest, useCaseSnapshot: evaluationSnapshot(useCase, gateFactsFromUseCase(useCase)),
  }] });
  state.prisma.buildGuide.count.mockResolvedValue(0);
  state.prisma.buildGuide.findFirst.mockResolvedValue(null);
  state.prisma.buildGuide.create.mockImplementation(async ({ data }) => {
    const row = { id: "guide", ...data };
    state.saved.set("guide", row);
    return row;
  });
  state.prisma.buildGuide.update.mockImplementation(async ({ where, data }) => {
    const row = { ...state.saved.get(where.id), ...data };
    state.saved.set(where.id, row);
    return row;
  });
  state.prisma.aiUsage.count.mockResolvedValue(0);
  state.prisma.aiUsage.create.mockResolvedValue({ id: "reservation" });
  state.prisma.aiUsage.update.mockResolvedValue({});
  state.stream.mockImplementation(async () => (async function* () { yield validText; })());
  state.access.mockResolvedValue("Contributor");
});

describe("guide job lifecycle", () => {
  it("allocates a streaming row and reserves usage before requesting a provider", async () => {
    const response = await POST(request());
    expect(await response.text()).toBe(validText);
    await finishJobs();
    expect(state.prisma.buildGuide.create.mock.calls[0][0].data.status).toBe("streaming");
    expect(state.prisma.buildGuide.create.mock.invocationCallOrder[0]).toBeLessThan(state.stream.mock.invocationCallOrder[0]);
    expect(state.prisma.aiUsage.create.mock.invocationCallOrder[0]).toBeLessThan(state.stream.mock.invocationCallOrder[0]);
    expect(state.saved.get("guide")?.status).toBe("complete");
    expect(response.headers.get("X-Guide-Id")).toBe("guide");
    expect(state.prisma.buildGuide.create).toHaveBeenCalledTimes(1);
  });
  it("retains one failed partial row when a stream breaks", async () => {
    state.stream.mockImplementation(async () => (async function* () {
      yield "## Hackathon MVP\nPartial";
      throw new Error("private prompt and API key");
    })());
    const response = await POST(request());
    await expect(response.text()).rejects.toThrow();
    await finishJobs();
    expect(state.saved.get("guide")).toMatchObject({ status: "failed", mvpGuideMd: "## Hackathon MVP\nPartial" });
    expect(state.prisma.buildGuide.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state.saved.get("guide"))).not.toContain("API key");
  });
  it("marks invalid headings failed rather than pretending completion", async () => {
    state.stream.mockImplementation(async () => (async function* () { yield "Unstructured output"; })());
    const response = await POST(request());
    await expect(response.text()).rejects.toThrow(/sections/);
    await finishJobs();
    expect(state.saved.get("guide")?.status).toBe("failed");
    expect(state.saved.get("guide")?.mvpGuideMd).toBe("Unstructured output");
  });
  it("retains a failed job even when generation fails before its first token", async () => {
    state.stream.mockRejectedValue(new Error("upstream failed"));
    const response = await POST(request());
    await expect(response.text()).rejects.toThrow();
    await finishJobs();
    expect(state.saved.get("guide")?.status).toBe("failed");
    expect(state.prisma.buildGuide.create).toHaveBeenCalledTimes(1);
  });
  it("continues persistence after a browser cancels the response", async () => {
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    state.stream.mockImplementation(async () => (async function* () {
      yield "## Hackathon MVP\nBuild one path.\n";
      await gate;
      yield "\n## Production scaling\nReview before pilot.";
    })());
    const response = await POST(request());
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    resume();
    await finishJobs();
    expect(state.saved.get("guide")?.status).toBe("complete");
    expect(state.saved.get("guide")?.productionPlanMd).toContain("Review before pilot.");
    expect(state.prisma.buildGuide.create).toHaveBeenCalledTimes(1);
  });
  it.each(["Closed", "Archived"])("retains a failed partial job when the event becomes %s during generation", async (status) => {
    let resume!: () => void;
    const pause = new Promise<void>((resolve) => { resume = resolve; });
    state.stream.mockImplementation(async () => (async function* () {
      yield "## Hackathon MVP\nSaved partial draft.\n";
      await pause;
      yield "## Production scaling\nReview before rollout.";
    })());
    const response = await POST(request());
    const completion = response.text();
    state.prisma.hackathon.findUniqueOrThrow.mockResolvedValue({ status });
    resume();
    await expect(completion).rejects.toThrow(/closed or archived/);
    await finishJobs();
    expect(state.saved.get("guide")).toMatchObject({
      status: "failed", mvpGuideMd: "## Hackathon MVP\nSaved partial draft.",
    });
    expect(state.prisma.buildGuide.create).toHaveBeenCalledTimes(1);
  });
  it("never creates duplicate rows if post-generation usage saving fails", async () => {
    state.prisma.aiUsage.update.mockRejectedValueOnce(new Error("usage database failed"));
    const response = await POST(request());
    await expect(response.text()).rejects.toThrow();
    await finishJobs();
    expect(state.prisma.buildGuide.create).toHaveBeenCalledTimes(1);
    expect(state.saved.size).toBe(1);
    expect(state.saved.get("guide")?.status).toBe("failed");
    expect(console.error).toHaveBeenCalledWith("AI persistence failure", {
      stage: "guide-finalization", jobId: "guide",
    });
  });
  it("reports failed recovery/accounting without logging secrets or replacing the client failure", async () => {
    state.stream.mockRejectedValue(new Error("private provider prompt"));
    state.prisma.buildGuide.update.mockRejectedValue(new Error("private database query"));
    state.prisma.aiUsage.update.mockRejectedValue(new Error("private accounting payload"));
    const response = await POST(request());
    await expect(response.text()).rejects.toThrow("AI generation failed.");
    await finishJobs();
    expect(console.error).toHaveBeenCalledWith("AI persistence failure", { stage: "guide-failure", jobId: "guide" });
    expect(console.error).toHaveBeenCalledWith("AI persistence failure", { stage: "guide-accounting", jobId: "guide" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
  });
  it("rejects simultaneous regeneration for a use case already streaming", async () => {
    state.prisma.buildGuide.count.mockResolvedValue(1);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(state.stream).not.toHaveBeenCalled();
    expect(state.prisma.aiUsage.create).not.toHaveBeenCalled();
  });
  it("checks workspace access before looking up a use case", async () => {
    state.access.mockRejectedValue(new state.AccessDeniedError("private auth detail"));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("private");
    expect(state.prisma.useCase.findFirst).not.toHaveBeenCalled();
  });
  it("reports unavailable identity storage as a service failure rather than a permission denial", async () => {
    state.access.mockRejectedValue(Object.assign(new Error("private database contents"), { code: "P2022" }));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
    expect(state.prisma.useCase.findFirst).not.toHaveBeenCalled();
  });
});

describe("guide HTTP boundary", () => {
  it.each([null, {}, { hackathonId: 123, useCaseId: [] }, { hackathonId: "id", useCaseId: "../case" }])
    ("rejects malformed IDs/body %j", async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(state.prisma.useCase.findFirst).not.toHaveBeenCalled();
    });
  it("rejects malformed JSON, oversized bodies and unsafe origins", async () => {
    expect((await POST(new Request("http://localhost/api/build-guide", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{broken",
    }))).status).toBe(400);
    expect((await POST(request({ input: "x".repeat(3_000) }))).status).toBe(413);
    expect((await POST(request({}, "https://evil.example"))).status).toBe(403);
    expect(state.stream).not.toHaveBeenCalled();
  });
});
