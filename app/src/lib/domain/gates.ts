import { getMethodology, type Gates } from "@/lib/methodology";
import { gateResultSchema, type GateResult } from "@/lib/schemas";

/**
 * Qualification gates — product spec §5.2, refined by plan R-1.
 *
 * Gates that are *facts already in the database* (is there a business owner? is
 * there sample data?) are answered here in code. Letting a language model guess
 * at facts we already store would make the whole evaluator untrustworthy, so the
 * model only ever answers `judgement` gates.
 */

export interface GateFacts {
  businessOwner?: string | null;
  dataSources?: string | null;
  sampleDataApproved?: boolean | null;
  processOwnerConfirmed?: boolean | null;
  smallestSlice?: string | null;
  humanApprovalPoint?: string | null;
  agentOutput?: string | null;
  /** Contact role types assigned to this use case's build team. */
  teamRoleTypes: string[];
  /** Legacy display context; never evidence of ownership for this use case. */
  hackathonRoleTypes: string[];
}

const filled = (s?: string | null): boolean => Boolean(s && s.trim().length > 0);

type DeterministicCheck = (f: GateFacts) => boolean;

const CHECKS: Record<string, DeterministicCheck> = {
  hasBusinessOwner: (f) =>
    filled(f.businessOwner) ||
    f.teamRoleTypes.includes("BusinessOwner"),

  processOwnerAttending: (f) =>
    f.processOwnerConfirmed === true &&
    (f.teamRoleTypes.includes("BusinessOwner") || f.teamRoleTypes.includes("Sponsor")),

  hasSampleData: (f) => filled(f.dataSources) && f.sampleDataApproved === true,

  hasSmallestSlice: (f) => filled(f.smallestSlice),

  // Read-only cases must explicitly document their review / no-action boundary.
  hasHumanApproval: (f) => filled(f.humanApprovalPoint),
};

export function evaluateDeterministicGates(
  facts: GateFacts,
  cfg: Gates,
): GateResult[] {
  return cfg.gates
    .filter((g) => g.kind === "deterministic")
    .map((g) => {
      const check = CHECKS[g.id];
      // An unknown deterministic gate is a config error, not a silent pass.
      const pass = check ? check(facts) : false;
      return {
        gate: g.id,
        label: g.label,
        kind: "deterministic" as const,
        pass,
        ...(pass ? {} : { reason: g.failReason, remedy: g.remedy }),
      };
    });
}

/** Turn the model's judgement-gate answers into full GateResults. */
export function mapJudgementGates(
  answers: Array<{ gate: string; pass: boolean; reason?: string }>,
  cfg: Gates,
  facts?: GateFacts,
): GateResult[] {
  const byId = new Map(answers.map((a) => [a.gate, a]));

  return cfg.gates
    .filter((g) => g.kind === "judgement")
    .map((g) => {
      const answer = byId.get(g.id);
      // No answer from the model = treat as unresolved, not as a pass.
      const duplicate = answers.filter((a) => a.gate === g.id).length > 1;
      const pass = !duplicate && answer?.pass === true &&
        (g.id !== "canDemoOnePath" || filled(facts?.smallestSlice));
      return {
        gate: g.id,
        label: g.label,
        kind: "judgement" as const,
        pass,
        ...(pass
          ? {}
          : {
              reason: answer?.reason ?? g.failReason,
              remedy: g.remedy,
            }),
      };
    });
}

export function mergeGates(
  deterministic: GateResult[],
  judgement: GateResult[],
): GateResult[] {
  return [...deterministic, ...judgement];
}

export function failedGates(results: GateResult[]): GateResult[] {
  return results.filter((r) => !r.pass);
}

/** Any hard gate failing means reject / defer / re-scope. */
export function isQualified(results: GateResult[], cfg: Gates = getMethodology().gates): boolean {
  const parsed = gateResultSchema.array().safeParse(results);
  if (!parsed.success) return false;
  const expected = new Map(cfg.gates.map((gate) => [gate.id, gate.kind]));
  const seen = new Set<string>();
  return expected.size > 0 && expected.size === cfg.gates.length &&
    parsed.data.length === expected.size &&
    parsed.data.every((result) => {
      if (seen.has(result.gate) || expected.get(result.gate) !== result.kind || result.pass !== true) return false;
      seen.add(result.gate);
      return true;
    });
}
