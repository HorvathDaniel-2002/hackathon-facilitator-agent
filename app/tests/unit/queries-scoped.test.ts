import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertAccess: vi.fn(),
  hackathons: vi.fn(),
  hackathon: vi.fn(),
  useCases: vi.fn(),
  useCase: vi.fn(),
  contacts: vi.fn(),
  snapshotMatches: vi.fn(),
  effective: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: mocks.requireUser,
  assertAccess: mocks.assertAccess,
  AccessDeniedError: class AccessDeniedError extends Error {},
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    hackathon: { findMany: mocks.hackathons, findFirst: mocks.hackathon },
    useCase: { findMany: mocks.useCases, findFirst: mocks.useCase },
    contact: { findMany: mocks.contacts },
  },
  parseJsonField: (_raw: string, fallback: unknown) => fallback,
}));
vi.mock("@/lib/methodology", () => ({ getMethodology: () => ({ rubric: {} }) }));
vi.mock("@/lib/domain/evaluation", () => ({ toEffectiveEvaluation: mocks.effective }));
vi.mock("@/lib/ai/provenance", () => ({
  gateFactsFromUseCase: () => ({}),
  matchesEvaluationSnapshot: mocks.snapshotMatches,
}));

import { AccessDeniedError } from "@/lib/auth";
import {
  buildSearchIndex, getHackathon, getUseCase, listContacts, listHackathons, listUseCases, summarizePortfolio,
} from "@/lib/queries";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "signed-in" });
  mocks.assertAccess.mockResolvedValue("Viewer");
  mocks.hackathons.mockResolvedValue([]);
  mocks.hackathon.mockResolvedValue(null);
  mocks.useCases.mockResolvedValue([]);
  mocks.useCase.mockResolvedValue(null);
  mocks.contacts.mockResolvedValue([]);
  mocks.snapshotMatches.mockReturnValue(true);
});

it("orders workspaces without event dates and links search results to the board", async () => {
  await listHackathons("signed-in");
  expect(mocks.hackathons.mock.calls[0][0].orderBy).toEqual([{ status: "asc" }, { name: "asc" }, { id: "asc" }]);
  expect(mocks.hackathons.mock.calls[0][0].include._count.select).toEqual({ useCases: true, contacts: true });
  mocks.hackathons.mockResolvedValueOnce([{ id: "workspace", name: "Workspace", customer: "Customer", useCases: [], contacts: [] }]);
  expect(await buildSearchIndex("signed-in")).toEqual([expect.objectContaining({ href: "/hackathons/workspace/usecases" })]);
});

describe("read helper identity and workspace scoping", () => {
  it.each([listHackathons, buildSearchIndex])("rejects caller-supplied impersonation before fetching data", async (read) => {
    await expect(read("another-user")).rejects.toBeInstanceOf(AccessDeniedError);
    expect(mocks.hackathons).not.toHaveBeenCalled();
  });

  it.each([listHackathons, buildSearchIndex])("restricts cross-workspace indexes to valid memberships of the signed-in user", async (read) => {
    await read("signed-in");
    expect(mocks.hackathons).toHaveBeenCalledWith(expect.objectContaining({
      where: { memberships: { some: { userId: "signed-in", role: { in: ["Owner", "Contributor", "Viewer"] } } } },
    }));
  });

  it("never includes private identity fields in workspace membership data", async () => {
    await listHackathons("signed-in");
    expect(mocks.hackathons.mock.calls[0][0].include.memberships.include.user).toEqual({
      select: { id: true, name: true, email: true },
    });
  });

  it("filters legacy foreign-workspace team relations in both directions", async () => {
    await listUseCases("workspace");
    await getUseCase("workspace", "case");
    await listContacts("workspace");
    for (const query of [mocks.useCases, mocks.useCase]) {
      expect(query.mock.calls[0][0].include.teamMembers.where).toEqual({
        contact: { hackathonId: "workspace" },
      });
      expect(query.mock.calls[0][0].include.teamMembers.include.contact).toBe(true);
    }
    expect(mocks.contacts.mock.calls[0][0].include.teamMembers.where).toEqual({
      useCase: { hackathonId: "workspace" },
    });
  });

  const workspaceReads = [
    ["use cases", () => listUseCases("workspace"), mocks.useCases],
    ["use case detail", () => getUseCase("workspace", "case"), mocks.useCase],
    ["contacts", () => listContacts("workspace"), mocks.contacts],
  ] as const;

  it.each(workspaceReads)("checks identity and membership for %s", async (_name, read, query) => {
    await read();
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(mocks.assertAccess).toHaveBeenCalledWith("signed-in", "workspace");
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ hackathonId: "workspace" }),
    }));
  });

  it.each(workspaceReads)("blocks %s before querying unauthorized rows", async (_name, read, query) => {
    mocks.assertAccess.mockRejectedValue(new AccessDeniedError());
    await expect(read()).rejects.toBeInstanceOf(AccessDeniedError);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns no workspace for inaccessible IDs while refusing impersonation", async () => {
    await expect(getHackathon("another-user", "workspace")).rejects.toBeInstanceOf(AccessDeniedError);
    mocks.assertAccess.mockRejectedValue(new AccessDeniedError());
    expect(await getHackathon("signed-in", "workspace")).toBeNull();
    expect(mocks.hackathon).not.toHaveBeenCalled();
  });

  it("does not disguise storage failures as access denial", async () => {
    mocks.assertAccess.mockRejectedValue(new Error("Storage unavailable"));
    await expect(getHackathon("signed-in", "workspace")).rejects.toThrow("Storage unavailable");
  });

  it("retains historical evaluations but excludes stale evidence from current portfolio rollups", async () => {
    const evaluation = {
      id: "evaluation", weightedScore: 4, priorityBand: "High", recommendedPlatform: "CopilotStudio",
      gateResults: [{ gate: "owner", pass: true }],
    };
    mocks.effective.mockReturnValue(evaluation);
    mocks.useCases.mockResolvedValue([
      { id: "current", status: "Draft", evaluations: [{ useCaseSnapshot: "current" }], teamMembers: [], handoff: null },
      { id: "stale", status: "Draft", evaluations: [{ useCaseSnapshot: "old" }], teamMembers: [], handoff: null },
    ]);
    mocks.snapshotMatches.mockImplementation((snapshot) => snapshot === "current");
    const cases = await listUseCases("workspace");
    expect(cases[1].evaluation).toEqual(evaluation);
    expect(cases[1].evaluationIsCurrent).toBe(false);
    expect(summarizePortfolio(cases)).toMatchObject({
      total: 2, evaluated: 1, staleEvaluations: 1, qualified: 1, averageScore: 4,
    });
  });
  it("uses the shared handoff owner without resurrecting a cleared owner in dashboard totals", async () => {
    mocks.useCases.mockResolvedValue([
      { id: "intake", status: "Draft", businessOwner: "Canvas owner", evaluations: [], teamMembers: [], handoff: null },
      { id: "cleared", status: "Draft", businessOwner: "Old owner", evaluations: [], teamMembers: [], handoff: { businessOwner: null } },
      { id: "assigned", status: "Draft", businessOwner: null, evaluations: [], teamMembers: [], handoff: { businessOwner: "Handoff owner" } },
    ]);
    const cases = await listUseCases("workspace");
    expect(summarizePortfolio(cases)).toMatchObject({ total: 3, withOwner: 2 });
  });
});
