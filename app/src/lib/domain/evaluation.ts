import { computeWeightedScore, resolveBand } from "@/lib/domain/scoring";
import { getMethodology, type Rubric } from "@/lib/methodology";
import { parseJsonField } from "@/lib/db";
import { gateResultSchema } from "@/lib/schemas";
import { z } from "zod";
import type {
  CsFitBand,
  GateResult,
  Platform,
  PriorityBand,
} from "@/lib/schemas";

/**
 * Merging an AI evaluation with its human override — plan R-2.
 *
 * Evaluations are append-only: a human edit never mutates the model's answer, it
 * creates a sibling override row. The "effective" evaluation the UI shows is the
 * two merged here, which is what gives us evaluation history, a trustworthy
 * "human-edited" badge and a full audit trail without any extra bookkeeping.
 *
 * Note the weighted score is *recomputed* after the merge: overriding a sub-score
 * has to move the total, or the displayed number would contradict the rubric.
 */

export interface RawEvaluation {
  id: string;
  version: number;
  valueScore: number;
  feasibilityScore: number;
  dataReadinessScore: number;
  reusabilityScore: number;
  weightedScore: number;
  priorityBand: string;
  csFitBand: string;
  recommendedPlatform: string;
  confidence: number;
  routingSignals: string;
  gateResults: string;
  rationale: string;
  source: string;
  model: string | null;
  promptVersion: string | null;
  methodologyVersion: string | null;
  rubricSnapshot?: string | null;
  useCaseVersion?: number | null;
  generatedAt: Date;
  override?: RawOverride | null;
}

export interface RawOverride {
  id: string;
  version?: number;
  overriddenFields: string;
  valueScore: number | null;
  feasibilityScore: number | null;
  dataReadinessScore: number | null;
  reusabilityScore: number | null;
  csFitBand: string | null;
  recommendedPlatform: string | null;
  rationale: string | null;
  reason: string | null;
  overriddenBy: string;
  overriddenAt: Date;
}

export interface EffectiveEvaluation {
  id: string;
  version: number;
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
  source: string;
  model: string | null;
  methodologyVersion: string | null;
  generatedAt: Date;
  /** Field names a human changed — drives the "edited" badge in the UI. */
  overriddenFields: string[];
  isEdited: boolean;
  overriddenBy: string | null;
  overriddenAt: Date | null;
  overrideReason: string | null;
  overrideVersion: number | null;
  useCaseVersion: number | null;
  scoreWarning: string | null;
  scoreWeights: Rubric["weights"] | null;
}

const snapshotSchema = z.object({
  version: z.string(),
  scale: z.object({ min: z.number(), max: z.number() }),
  weights: z.object({
    value: z.number().min(0).max(1),
    feasibility: z.number().min(0).max(1),
    dataReadiness: z.number().min(0).max(1),
    reusability: z.number().min(0).max(1),
  }),
  dimensions: z.array(z.object({ id: z.string(), label: z.string(), assess: z.string() })),
  bands: z.array(z.object({ id: z.enum(["High", "Medium", "Low"]), min: z.number() })).min(1),
}).refine((value) => Math.abs(Object.values(value.weights).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9);

export function evaluationRubric(ev: RawEvaluation, current: Rubric): Rubric | null {
  if (ev.rubricSnapshot) {
    return parseJsonField<Rubric | null>(ev.rubricSnapshot, null,
      (value): value is Rubric => snapshotSchema.safeParse(value).success);
  }
  const stamp = ev.methodologyVersion?.split("+").find((part) => part.startsWith("rubric@"));
  return stamp === `rubric@${current.version}` ? current : null;
}

const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

export function readEvaluationGates(raw: string): GateResult[] {
  const required = getMethodology().gates.gates;
  return parseJsonField<GateResult[]>(raw, [{
    gate: "invalidStoredGates", label: "Evaluation gates unavailable", kind: "deterministic",
    pass: false, reason: "Stored gate data is invalid. Re-evaluate before qualifying this case.",
  }], (value): value is GateResult[] => {
    const parsed = z.array(gateResultSchema).min(1).safeParse(value);
    return parsed.success &&
      parsed.data.length === required.length &&
      new Set(parsed.data.map((gate) => gate.gate)).size === required.length &&
      parsed.data.every((gate) => required.some((expected) => expected.id === gate.gate && expected.kind === gate.kind));
  });
}

export function toEffectiveEvaluation(
  ev: RawEvaluation,
  rubric: Rubric,
): EffectiveEvaluation {
  const o = ev.override ?? null;
  const overriddenFields = o
    ? parseJsonField<string[]>(o.overriddenFields, [], stringList)
    : [];

  const scores = {
    value: o?.valueScore ?? ev.valueScore,
    feasibility: o?.feasibilityScore ?? ev.feasibilityScore,
    dataReadiness: o?.dataReadinessScore ?? ev.dataReadinessScore,
    reusability: o?.reusabilityScore ?? ev.reusabilityScore,
  };

  const originalRubric = evaluationRubric(ev, rubric);
  const scoresChanged = ["valueScore", "feasibilityScore", "dataReadinessScore", "reusabilityScore"]
    .some((key) => overriddenFields.includes(key));
  const weightedScore = scoresChanged && originalRubric
    ? computeWeightedScore(scores, originalRubric)
    : ev.weightedScore;

  return {
    id: ev.id,
    version: ev.version,
    valueScore: scores.value,
    feasibilityScore: scores.feasibility,
    dataReadinessScore: scores.dataReadiness,
    reusabilityScore: scores.reusability,
    weightedScore,
    priorityBand: scoresChanged && originalRubric
      ? resolveBand(weightedScore, originalRubric)
      : ev.priorityBand as PriorityBand,
    csFitBand: (o?.csFitBand ?? ev.csFitBand) as CsFitBand,
    recommendedPlatform: (o?.recommendedPlatform ??
      ev.recommendedPlatform) as Platform,
    confidence: ev.confidence,
    routingSignals: parseJsonField<string[]>(ev.routingSignals, [], stringList),
    gateResults: readEvaluationGates(ev.gateResults),
    rationale: o?.rationale ?? ev.rationale,
    source: ev.source,
    model: ev.model,
    methodologyVersion: ev.methodologyVersion,
    generatedAt: ev.generatedAt,
    overriddenFields,
    isEdited: overriddenFields.length > 0,
    overriddenBy: o?.overriddenBy ?? null,
    overriddenAt: o?.overriddenAt ?? null,
    overrideReason: o?.reason ?? null,
    overrideVersion: o ? o.version ?? 0 : null,
    useCaseVersion: ev.useCaseVersion ?? null,
    scoreWarning: !originalRubric
      ? "Historical rubric unavailable. The originally saved total and band are preserved; re-evaluate before changing scores."
      : null,
    scoreWeights: originalRubric?.weights ?? null,
  };
}
