import { loadPrompt, render } from "@/lib/ai/prompts";
import { getAiProvider } from "@/lib/ai/provider";
import {
  evaluateDeterministicGates,
  mapJudgementGates,
  mergeGates,
  type GateFacts,
} from "@/lib/domain/gates";
import { resolvePlatform } from "@/lib/domain/routing";
import { computeWeightedScore, resolveBand } from "@/lib/domain/scoring";
import { getMethodology } from "@/lib/methodology";
import { createEvaluationSchema } from "./output-schema";
import { AiError } from "./errors";
import { MAX_CANVAS_CHARS, MAX_CANVAS_FIELD_CHARS } from "./limits";
import {
  type CsFitBand,
  type GateResult,
  type Platform,
  type PriorityBand,
} from "@/lib/schemas";

/**
 * The Copilot Studio Fit Evaluator — spec M3.
 *
 * The division of labour is the whole point:
 *   model  -> sub-scores, which routing signals fired, judgement gates, prose
 *   code   -> the weighted total, the band, the platform, the deterministic gates
 *
 * That is what makes the output defensible in front of a customer: the numbers
 * always match the published rubric, and identical inputs route identically.
 */

export interface UseCaseForEvaluation {
  code: string;
  title: string;
  description?: string | null;
  businessOwner?: string | null;
  targetUser?: string | null;
  currentProcess?: string | null;
  painPoints?: string | null;
  desiredOutcome?: string | null;
  dataSources?: string | null;
  systemsConnectors?: string | null;
  agentOutput?: string | null;
  humanApprovalPoint?: string | null;
  successMetric?: string | null;
  constraints?: string | null;
  reusePotential?: string | null;
  smallestSlice?: string | null;
  productionVision?: string | null;
}

export interface EvaluationOutcome {
  valueScore: number;
  feasibilityScore: number;
  dataReadinessScore: number;
  reusabilityScore: number;
  weightedScore: number;
  priorityBand: PriorityBand;
  csFitBand: CsFitBand;
  recommendedPlatform: Platform;
  confidence: number;
  routingSignals: string[];
  gateResults: GateResult[];
  rationale: string;
  model: string;
  promptVersion: string;
  methodologyVersion: string;
  rubricSnapshot: string;
  usage: { promptTokens: number; completionTokens: number };
}

const FIELD_LABELS: Array<[keyof UseCaseForEvaluation, string]> = [
  ["title", "Title"],
  ["description", "Description"],
  ["businessOwner", "Business owner"],
  ["targetUser", "Target user"],
  ["currentProcess", "Current process"],
  ["painPoints", "Pain points"],
  ["desiredOutcome", "Desired outcome"],
  ["dataSources", "Data sources"],
  ["systemsConnectors", "Systems & connectors"],
  ["agentOutput", "Agent output / action"],
  ["humanApprovalPoint", "Human approval point"],
  ["successMetric", "Success metric"],
  ["constraints", "Constraints"],
  ["reusePotential", "Reuse potential"],
  ["smallestSlice", "Smallest demoable slice"],
  ["productionVision", "Production vision"],
];

export function renderUseCaseCanvas(uc: UseCaseForEvaluation): string {
  for (const key of ["code", ...FIELD_LABELS.map(([field]) => field)] as const) {
    const value = uc[key];
    if (value != null && (typeof value !== "string" || value.length > MAX_CANVAS_FIELD_CHARS)) {
      throw new AiError(`Use-case field ${key} is invalid or too long for AI assessment.`, 400);
    }
  }
  const lines = [`Use case ${uc.code}`, ""];
  for (const [key, label] of FIELD_LABELS) {
    const v = uc[key];
    lines.push(`${label}: ${v && String(v).trim() ? v : "(not provided)"}`);
  }
  const canvas = lines.join("\n");
  if (canvas.length > MAX_CANVAS_CHARS) {
    throw new AiError("The use-case canvas is too large for AI assessment.", 400);
  }
  return canvas;
}

export async function evaluateUseCase(
  useCase: UseCaseForEvaluation,
  facts: GateFacts,
  signal?: AbortSignal,
): Promise<EvaluationOutcome> {
  const methodology = getMethodology();
  const prompt = loadPrompt("evaluator");
  const provider = getAiProvider();

  const judgementGates = methodology.gates.gates.filter(
    (g) => g.kind === "judgement",
  );

  const system = render(prompt.body, {
    RUBRIC_DIMENSIONS: methodology.rubric.dimensions
      .map(
        (d) =>
          `- **${d.label}** (\`${d.id}\`, weight ${Math.round(
            (methodology.rubric.weights[
              d.id as keyof typeof methodology.rubric.weights
            ] ?? 0) * 100,
          )}%) — ${d.assess}`,
      )
      .join("\n"),
    CS_SIGNALS: methodology.routing.signals.copilotStudio
      .map((s) => `- \`${s.id}\` — ${s.label}`)
      .join("\n"),
    AZ_SIGNALS: methodology.routing.signals.azureAI
      .map((s) => `- \`${s.id}\` — ${s.label}`)
      .join("\n"),
    JUDGEMENT_GATES: judgementGates
      .map((g) => `- \`${g.id}\` — ${g.label}`)
      .join("\n"),
  });

  const user = renderUseCaseCanvas(useCase);
  const output = createEvaluationSchema(
    judgementGates.map((gate) => gate.id),
    [...methodology.routing.signals.copilotStudio, ...methodology.routing.signals.azureAI].map((item) => item.id),
  );

  const result = await provider.structured({
    system,
    user,
    schemaName: "use_case_evaluation",
    jsonSchema: output.jsonSchema,
    parse: (raw) => output.schema.parse(raw),
    signal,
  });

  const ai = result.data;

  // Recompute everything the model is not allowed to decide.
  const weightedScore = computeWeightedScore(ai.scores, methodology.rubric);
  const priorityBand = resolveBand(weightedScore, methodology.rubric);
  const routing = resolvePlatform(ai.routingSignals, methodology.routing);

  const gateResults = mergeGates(
    evaluateDeterministicGates(facts, methodology.gates),
    mapJudgementGates(ai.judgementGates, methodology.gates, facts),
  );

  return {
    valueScore: ai.scores.value,
    feasibilityScore: ai.scores.feasibility,
    dataReadinessScore: ai.scores.dataReadiness,
    reusabilityScore: ai.scores.reusability,
    weightedScore,
    priorityBand,
    csFitBand: routing.band,
    recommendedPlatform: routing.platform,
    confidence: ai.confidence,
    // Persist only signals the routing table recognises, so an invented id can
    // never silently influence a later re-route.
    routingSignals: [...routing.copilotStudioSignals, ...routing.azureSignals],
    gateResults,
    rationale: ai.rationale,
    model: result.model,
    promptVersion: prompt.version,
    methodologyVersion: methodology.version,
    rubricSnapshot: JSON.stringify(methodology.rubric),
    usage: result.usage,
  };
}
