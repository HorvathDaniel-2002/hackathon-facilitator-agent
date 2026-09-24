import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUseCase: vi.fn(), getUserRole: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: "user" }),
  getUserRole: mocks.getUserRole,
  canEdit: (role: string) => role === "Owner" || role === "Contributor",
}));
vi.mock("@/lib/queries", () => ({
  getHackathon: async () => ({ id: "workspace" }),
  getUseCase: mocks.getUseCase,
  listContacts: async () => [],
}));
vi.mock("@/lib/ai/provider", () => ({ AI_PROVIDER: "mock" }));
vi.mock("@/components/build-guide-panel", () => ({ BuildGuidePanel: () => null }));
vi.mock("@/components/evaluator-panel", () => ({ EvaluatorPanel: () => null }));
vi.mock("@/components/usecase-team-panel", () => ({ UseCaseTeamPanel: () => null }));
vi.mock("@/components/usecase-actions", () => ({ UseCaseActions: () => null }));
vi.mock("@/components/usecase-confirmations", () => ({ UseCaseConfirmations: () => null }));

import { BuildGuidePanel } from "@/components/build-guide-panel";
import UseCaseDetailPage from "@/app/(app)/hackathons/[id]/usecases/[ucId]/page";

function guideProps(node: ReactNode): Record<string, unknown> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === BuildGuidePanel) return child.props;
    const found = guideProps(child.props.children);
    if (found) return found;
  }
}

const guides = [
  { id: "guide-2", version: 2, mvpGuideMd: "Second retained guide" },
  { id: "guide-1", version: 1, mvpGuideMd: "First retained guide" },
];

beforeEach(() => {
  mocks.getUserRole.mockResolvedValue("Owner");
  mocks.getUseCase.mockResolvedValue({
    id: "case", code: "UC-01", title: "Synthetic case", status: "Draft", version: 3,
    evaluation: { recommendedPlatform: "CopilotStudio" }, evaluationIsCurrent: false,
    evaluationHistory: [], buildGuides: guides, teamMembers: [], handoff: null,
    sampleDataApproved: false, processOwnerConfirmed: false,
  });
});

describe("historical guide visibility after canvas edits", () => {
  it("keeps evaluation existence and all saved versions separate from generation permission", async () => {
    const page = await UseCaseDetailPage({ params: Promise.resolve({ id: "workspace", ucId: "case" }) });
    expect(guideProps(page)).toMatchObject({
      hasEvaluation: true, editable: true, evaluationIsCurrent: false, guides,
    });
  });

  it("restores generation permission after current evidence is re-evaluated", async () => {
    const useCase = await mocks.getUseCase();
    mocks.getUseCase.mockResolvedValue({ ...useCase, evaluationIsCurrent: true });
    const page = await UseCaseDetailPage({ params: Promise.resolve({ id: "workspace", ucId: "case" }) });
    expect(guideProps(page)).toMatchObject({
      hasEvaluation: true, editable: true, evaluationIsCurrent: true, guides,
    });
  });

  it("retains history for viewers without granting generation permission", async () => {
    mocks.getUserRole.mockResolvedValue("Viewer");
    const page = await UseCaseDetailPage({ params: Promise.resolve({ id: "workspace", ucId: "case" }) });
    expect(guideProps(page)).toMatchObject({
      hasEvaluation: true, editable: false, evaluationIsCurrent: false, guides,
    });
  });
});
