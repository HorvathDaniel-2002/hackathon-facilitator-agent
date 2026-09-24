import type { Handoff as HandoffCfg } from "@/lib/methodology";
import { handoffInputSchema, platformSchema, portfolioDecisionSchema, priorityBandSchema } from "@/lib/schemas";
import { isQualified } from "@/lib/domain/gates";
import type {
  GateResult,
  Platform,
  PortfolioDecision,
  PriorityBand,
} from "@/lib/schemas";

/**
 * Next-engagement routing — product spec §5.5.
 *
 * Production deployment is out of hackathon scope by design. This decides where
 * a use case goes *instead*, from its portfolio decision plus what the evaluation
 * already told us. The facilitator can always override the suggestion.
 */

export interface RouteInput {
  decision: PortfolioDecision;
  platform?: Platform | null;
  priorityBand?: PriorityBand | null;
  gateResults?: GateResult[];
  implementationReadyConfirmed?: boolean;
  programEligibilityConfirmed?: boolean;
}

export interface RouteResult {
  route: string;
  label: string;
  rationale: string;
  provisional: boolean;
  requiresConfirmation: boolean;
}

export function recommendNextEngagement(
  input: RouteInput,
  cfg: HandoffCfg,
): RouteResult | null {
  if (!portfolioDecisionSchema.safeParse(input.decision).success) return null;
  if (input.platform && !platformSchema.safeParse(input.platform).success) return null;
  if (input.priorityBand && !priorityBandSchema.safeParse(input.priorityBand).success) return null;
  if (input.decision === "Stop") {
    return {
      route: "Stop",
      label: "Stop / Archive",
      provisional: false,
      requiresConfirmation: false,
      rationale:
        "Archived by portfolio decision — capture the learning and close the case.",
    };
  }

  const failed = new Set(
    (input.gateResults ?? []).filter((g) => !g.pass).map((g) => g.gate),
  );

  for (const route of cfg.routes) {
    const m = route.match;
    if (m.decision !== input.decision) continue;
    if (route.id === "CloudAccelerateFactory" &&
      (input.implementationReadyConfirmed !== true || input.programEligibilityConfirmed !== true)) continue;
    if (route.id === "AIAgentsPilot" && !isQualified(input.gateResults ?? [])) continue;

    if (m.platformIn && (!input.platform || !m.platformIn.includes(input.platform))) {
      continue;
    }

    if (m.failedGateIn && !m.failedGateIn.some((g) => failed.has(g))) continue;

    return {
      route: route.id,
      label: route.label,
      provisional: true,
      requiresConfirmation: true,
      rationale: buildRationale(route.useWhen, input, failed),
    };
  }

  return null;
}

function buildRationale(
  useWhen: string,
  input: RouteInput,
  failed: Set<string>,
): string {
  const parts = [
    "Provisional recommendation only: confirm scope, delivery ownership, availability and program eligibility with the responsible Microsoft or partner team.",
    useWhen,
    "A hackathon score does not establish production or implementation readiness.",
  ];
  if (input.platform) parts.push(`Recommended platform: ${input.platform}.`);
  if (input.priorityBand) parts.push(`Priority band: ${input.priorityBand}.`);
  if (failed.size > 0) {
    parts.push(`Open gates: ${Array.from(failed).join(", ")}.`);
  }
  return parts.join(" ");
}

/** Which closure requirements are still unmet — a case cannot close until this is empty. */
export function missingClosureRequirements(
  handoff: Record<string, unknown> | null | undefined,
  cfg: HandoffCfg,
): string[] {
  if (!handoff) return [...cfg.closureRequirements];
  return cfg.closureRequirements.filter((field) => {
    const v = handoff[field];
    if (field === "portfolioDecision") return !portfolioDecisionSchema.safeParse(v).success;
    if (field === "nextMilestoneDate") {
      return v instanceof Date
        ? !Number.isFinite(v.getTime())
        : typeof v !== "string" || !v || !handoffInputSchema.shape.nextMilestoneDate.safeParse(v).success;
    }
    return typeof v !== "string" || v.trim() === "";
  });
}

export function canClose(
  handoff: Record<string, unknown> | null | undefined,
  cfg: HandoffCfg,
): boolean {
  return missingClosureRequirements(handoff, cfg).length === 0;
}
