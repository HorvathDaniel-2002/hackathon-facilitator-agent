import { z } from "zod";
import type { GateFacts } from "@/lib/domain/gates";
import { renderUseCaseCanvas, type UseCaseForEvaluation } from "./evaluator";

const snapshotSchema = z.object({
  sourceVersion: z.number().int().nonnegative(),
  canvas: z.string(),
  facts: z.record(z.string(), z.unknown()),
});

export function gateFactsFromUseCase(
  useCase: UseCaseForEvaluation & {
    hackathonId?: string;
    sampleDataApproved?: boolean | null;
    processOwnerConfirmed?: boolean | null;
    teamMembers: Array<{ contact: { roleType: string; hackathonId?: string } }>;
  },
): GateFacts {
  return {
    businessOwner: useCase.businessOwner, dataSources: useCase.dataSources,
    sampleDataApproved: useCase.sampleDataApproved ?? false,
    processOwnerConfirmed: useCase.processOwnerConfirmed ?? false,
    smallestSlice: useCase.smallestSlice, humanApprovalPoint: useCase.humanApprovalPoint,
    agentOutput: useCase.agentOutput,
    teamRoleTypes: useCase.teamMembers
      .filter((member) => !useCase.hackathonId || member.contact.hackathonId === useCase.hackathonId)
      .map((member) => member.contact.roleType),
    hackathonRoleTypes: [],
  };
}

function normalizedFacts(facts: GateFacts) {
  return {
    ...facts,
    teamRoleTypes: [...facts.teamRoleTypes].sort(),
    hackathonRoleTypes: [...facts.hackathonRoleTypes].sort(),
  };
}

export function evaluationSnapshot(
  useCase: UseCaseForEvaluation & { version: number },
  facts: GateFacts,
): string {
  return JSON.stringify({
    sourceVersion: useCase.version,
    canvas: renderUseCaseCanvas(useCase),
    facts: normalizedFacts(facts),
  });
}

/** Status-only changes don't invalidate the source evidence; canvas/team edits do. */
export function matchesEvaluationSnapshot(
  snapshot: string | null | undefined,
  useCase: UseCaseForEvaluation,
  facts: GateFacts,
): boolean {
  if (!snapshot) return false;
  try {
    const saved = snapshotSchema.parse(JSON.parse(snapshot));
    const current = normalizedFacts(facts);
    return saved.canvas === renderUseCaseCanvas(useCase) &&
      JSON.stringify(saved.facts) === JSON.stringify(current);
  } catch {
    return false;
  }
}
