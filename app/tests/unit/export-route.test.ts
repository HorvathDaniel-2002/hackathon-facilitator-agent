import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Handoff } from "@prisma/client";

const harness = vi.hoisted(() => {
  class AccessDeniedError extends Error {}
  return {
    AccessDeniedError,
    requireUser: vi.fn(async () => ({ id: "viewer" })),
    assertAccess: vi.fn(async () => "Viewer"),
    event: vi.fn(async () => ({
      name: "Synthetic event", customer: "<script>Example</script>", status: "Planning",
    })),
    cases: vi.fn(async (): Promise<Array<{
      code: string; title: string; status: string; businessOwner: string; desiredOutcome: string; successMetric: string;
      evaluationIsCurrent?: boolean; handoff: Partial<Handoff> | null;
      evaluation: null | { valueScore: number; feasibilityScore: number; dataReadinessScore: number; reusabilityScore: number; weightedScore: number;
        priorityBand: string; recommendedPlatform: string; model: string; methodologyVersion: string; isEdited: boolean; gateResults: Array<{pass: boolean; label: string; reason: string}> };
    }>> => [{
      code: "UC-01", title: "=HYPERLINK(\"example\")", status: "Draft", businessOwner: "Alex",
      desiredOutcome: "Shorter handling time", successMetric: "20% reduction", evaluation: null,
      handoff: null,
    }]),
  };
});
vi.mock("@/lib/auth", () => harness);
vi.mock("@/lib/queries", () => ({
  getHackathon: harness.event, listUseCases: harness.cases,
}));
vi.mock("@/lib/runbook", () => ({
  readRunbook: vi.fn(async () => ({
    template: { notice: "Local policy, not corporate approval" },
    sources: { reviewedAt: "2026-09-09", sources: [{ title: "Organize hackathons", url: "https://learn.microsoft.com/en-us/power-platform/guidance/adoption/hackathons" }] },
    items: [],
  })),
}));
import { GET } from "@/app/api/export/route";

beforeEach(() => { vi.clearAllMocks(); });

describe("workspace exports", () => {
  it("returns an explicit sign-in error when the current session is unavailable", async () => {
    harness.requireUser.mockRejectedValueOnce(new harness.AccessDeniedError("Untrusted session details"));
    const response = await GET(new Request("http://localhost/api/export?hackathonId=event&kind=portfolio&format=csv"));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Untrusted");
    expect(harness.cases).not.toHaveBeenCalled();
  });
  it("returns a safe storage error instead of an unhandled Prisma exception", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      harness.requireUser.mockRejectedValueOnce(Object.assign(new Error("private SQL row"), { code: "P2022" }));
      const response = await GET(new Request("http://localhost/api/export?hackathonId=event&kind=portfolio&format=csv"));
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("private SQL row");
      expect(log).toHaveBeenCalledWith("Application request failed", expect.objectContaining({ code: "P2022", operation: "export-auth" }));
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    } finally { log.mockRestore(); }
  });
  it("allows a scoped viewer to export data safely", async () => {
    const response = await GET(new Request("http://localhost/api/export?hackathonId=event&kind=portfolio&format=csv"));
    expect(response.status).toBe(200);
    expect(harness.assertAccess).toHaveBeenCalledWith("viewer", "event", "Viewer");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(text).toContain("UC-01");
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain("Progress stage");
    expect(text).toContain("Delivery route");
    expect(text).toContain("CAF status");
    expect(text).toContain("Intake");
    expect(text).not.toContain("Next milestone");
  });
  it("denies foreign-workspace reads before querying the portfolio", async () => {
    harness.assertAccess.mockRejectedValueOnce(new harness.AccessDeniedError("Denied"));
    const response = await GET(new Request("http://localhost/api/export?hackathonId=foreign&kind=readout"));
    expect(response.status).toBe(404);
    expect(harness.cases).not.toHaveBeenCalled();
  });
  it.each(["csv", "markdown", "html"])("marks revoked evaluation evidence as historical in %s", async (format) => {
    harness.cases.mockResolvedValueOnce([{
      code: "UC-01", title: "Changed case", status: "Selected", businessOwner: "Alex", desiredOutcome: "", successMetric: "",
      handoff: null, evaluationIsCurrent: false,
      evaluation: { valueScore: 5, feasibilityScore: 5, dataReadinessScore: 5, reusabilityScore: 5, weightedScore: 5,
        priorityBand: "High", recommendedPlatform: "CopilotStudio", model: "mock-model", methodologyVersion: "old",
        isEdited: false, gateResults: [] },
    }]);
    const response = await GET(new Request(`http://localhost/api/export?hackathonId=event&kind=portfolio&format=${format}`));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Historical");
    expect(text).toContain("Unverified - re-evaluate");
    expect(text).not.toContain("Gates passed");
  });
  it.each(["csv", "markdown"])("exports explicit operational fields independently of assessment status in %s", async (format) => {
    harness.cases.mockResolvedValueOnce([{
      code: "UC-01", title: "Recorded delivery", status: "Closed", businessOwner: "Alex", desiredOutcome: "", successMetric: "",
      evaluation: null, handoff: {
        progressStage: "InProduction", deliveryRoute: "CAF", cafStatus: "Submitted",
        cafReference: "CAF-123", cafSubmittedOn: new Date("2026-09-10"),
        productionReference: "Approved rollout reference", nextMilestone: "Value review", nextMilestoneDate: new Date("2026-10-01"),
      },
    }]);
    const response = await GET(new Request(`http://localhost/api/export?hackathonId=event&kind=portfolio&format=${format}`));
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const value of ["Assessment status", "Closed", "In production", "CAF-123", "2026-09-10", "Approved rollout reference", "Value review"]) {
      expect(text).toContain(value);
    }
    expect(text).not.toContain("Follow-up schedule");
  });
  it.each(["", "?hackathonId=e&kind=anything", "?hackathonId=e&kind=charter", "?hackathonId=e&kind=runbook&format=csv"])("rejects an invalid export request %s", async (query) => {
    const response = await GET(new Request(`http://localhost/api/export${query}`));
    expect(response.status).toBe(400);
  });
  it.each(["csv", "markdown"])("keeps an explicitly cleared handoff owner blank in %s", async (format) => {
    harness.cases.mockResolvedValueOnce([{
      code: "UC-01", title: "Owner review", status: "Draft", businessOwner: "Former canvas owner",
      desiredOutcome: "", successMetric: "", evaluation: null, handoff: {
        businessOwner: null, progressStage: "Intake", deliveryRoute: "Unassigned", cafStatus: "NotSubmitted",
      },
    }]);
    const response = await GET(new Request(`http://localhost/api/export?hackathonId=event&kind=portfolio&format=${format}`));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("Former canvas owner");
  });
  it("produces a literal print view with no scripts and explicit sharing boundaries", async () => {
    const response = await GET(new Request("http://localhost/api/export?hackathonId=event&kind=portfolio&format=html"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await response.text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("sensitivity label");
    expect(html).toContain("learn.microsoft.com");
  });
});
