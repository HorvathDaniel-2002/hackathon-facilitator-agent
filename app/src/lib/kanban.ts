import type { Handoff } from "@prisma/client";
import type { listUseCases } from "@/lib/queries";
import {
  cafStatusSchema, deliveryRouteSchema, progressStageSchema,
  type CafStatus, type DeliveryRoute, type ProgressStage,
} from "@/lib/schemas";

/** Existing demo/closure states never imply a real pilot, production rollout or CAF submission. */
export function initialProgressStage(status: string, decision?: string | null): ProgressStage {
  if (decision === "Stop" || status === "Parked") return "Parked";
  if (status === "Building" || status === "Demoed") return "Building";
  if (["Qualified", "Selected", "Closed"].includes(status)) return "Assessing";
  return "Intake";
}

export interface HandoffDraft {
  whatWasBuilt: string;
  demoOrBlocker: string;
  outcomeDemonstrated: string;
  businessOwner: string;
  technicalOwner: string;
  deliveryOwner: string;
  portfolioDecision: string;
  nextEngagement: string;
  nextMilestone: string;
  nextMilestoneDate: string;
  rolloutScope: string;
  gaps: string;
  progressStage: ProgressStage;
  deliveryRoute: DeliveryRoute;
  cafStatus: CafStatus;
  cafReference: string;
  cafSubmittedOn: string;
  productionReference: string;
}

export interface KanbanCase {
  id: string;
  version: number;
  code: string;
  title: string;
  status: string;
  businessOwner: string | null;
  manualImpact: string | null;
  evaluation: {
    platform: string;
    priorityBand: string;
    score: number;
    failedGates: number;
    isCurrent: boolean;
    isMock: boolean;
  } | null;
  handoffVersion: number | null;
  handoff: HandoffDraft;
  workflowUpdatedAt: string | null;
}

export function handoffDraft(
  useCase: { status: string; businessOwner: string | null },
  handoff: Handoff | null,
): HandoffDraft {
  return {
    whatWasBuilt: handoff?.whatWasBuilt ?? "",
    demoOrBlocker: handoff?.demoOrBlocker ?? "",
    outcomeDemonstrated: handoff?.outcomeDemonstrated ?? "",
    businessOwner: handoff ? handoff.businessOwner ?? "" : useCase.businessOwner ?? "",
    technicalOwner: handoff?.technicalOwner ?? "",
    deliveryOwner: handoff?.deliveryOwner ?? "",
    portfolioDecision: handoff?.portfolioDecision ?? "",
    nextEngagement: handoff?.nextEngagement ?? "",
    nextMilestone: handoff?.nextMilestone ?? "",
    nextMilestoneDate: handoff?.nextMilestoneDate?.toISOString().slice(0, 10) ?? "",
    rolloutScope: handoff?.rolloutScope ?? "",
    gaps: handoff?.gaps ?? "",
    progressStage: handoff ? progressStageSchema.parse(handoff.progressStage) : initialProgressStage(useCase.status),
    deliveryRoute: handoff ? deliveryRouteSchema.parse(handoff.deliveryRoute) : "Unassigned",
    cafStatus: handoff ? cafStatusSchema.parse(handoff.cafStatus) : "NotSubmitted",
    cafReference: handoff?.cafReference ?? "",
    cafSubmittedOn: handoff?.cafSubmittedOn?.toISOString().slice(0, 10) ?? "",
    productionReference: handoff?.productionReference ?? "",
  };
}

export function toKanbanCase(uc: Awaited<ReturnType<typeof listUseCases>>[number]): KanbanCase {
  const ev = uc.evaluation;
  return {
    id: uc.id, version: uc.version, code: uc.code, title: uc.title,
    status: uc.status, businessOwner: uc.businessOwner, manualImpact: uc.manualImpact,
    evaluation: ev ? {
      platform: ev.recommendedPlatform, priorityBand: ev.priorityBand, score: ev.weightedScore,
      failedGates: ev.gateResults.filter(gate => !gate.pass).length,
      isCurrent: uc.evaluationIsCurrent, isMock: ev.source === "mock" || ev.model === "mock-model",
    } : null,
    handoffVersion: uc.handoff?.version ?? null,
    handoff: handoffDraft(uc, uc.handoff),
    workflowUpdatedAt: uc.handoff?.workflowUpdatedAt?.toISOString() ?? null,
  };
}
