import type { Rubric } from "@/lib/methodology";
import type { PriorityBand, SubScores } from "@/lib/schemas";

/**
 * Weighted prioritization — product spec §5.1.
 *
 * ARCHITECTURAL RULE 2: the model never does this arithmetic. It returns the four
 * sub-scores; the weighted total and the band are computed here so the number in
 * the UI always matches the published rubric and is reproducible.
 */
export function computeWeightedScore(scores: SubScores, rubric: Rubric): number {
  const { weights } = rubric;
  const raw =
    scores.value * weights.value +
    scores.feasibility * weights.feasibility +
    scores.dataReadiness * weights.dataReadiness +
    scores.reusability * weights.reusability;

  // One decimal is what the rubric bands are expressed in.
  return Math.round(raw * 10) / 10;
}

/** First band whose `min` the score reaches, evaluated top-down. */
export function resolveBand(weighted: number, rubric: Rubric): PriorityBand {
  for (const band of rubric.bands) {
    if (weighted >= band.min) return band.id as PriorityBand;
  }
  return "Low";
}

/** Clamp a value into the rubric's 1–5 scale, rounding to the nearest whole step. */
export function clampScore(n: number, rubric: Rubric): number {
  const { min, max } = rubric.scale;
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function scoreToPercent(weighted: number, rubric: Rubric): number {
  const { min, max } = rubric.scale;
  return Math.round(((weighted - min) / (max - min)) * 100);
}
