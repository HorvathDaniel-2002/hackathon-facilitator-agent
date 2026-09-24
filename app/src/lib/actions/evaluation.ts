"use server";

import { validationFailure, withAccess } from "@/lib/actions/guard";
import { evaluateUseCase, renderUseCaseCanvas } from "@/lib/ai/evaluator";
import { AI_MODEL, AI_PROVIDER, getAiProvider } from "@/lib/ai/provider";
import { AiError, safeAiError } from "@/lib/ai/errors";
import { aiEntityIdSchema, aiOverrideSchema } from "@/lib/ai/input-validation";
import { aiTransaction, finishAiCall, reserveAiCall } from "@/lib/ai/usage";
import { evaluationSnapshot, gateFactsFromUseCase, matchesEvaluationSnapshot } from "@/lib/ai/provenance";
import { reportAiPersistenceFailure } from "@/lib/ai/diagnostics";
import { lockAiWorkspace } from "@/lib/ai/workspace-access";
import { invalidateRunbookChecks } from "@/lib/runbook";
import { stringifyJsonField, ConcurrencyConflictError } from "@/lib/db";
import { isQualified } from "@/lib/domain/gates";
import { evaluationRubric } from "@/lib/domain/evaluation";
import { getMethodology } from "@/lib/methodology";
import { revalidatePath } from "next/cache";

function validateIds(...ids: unknown[]) {
  if (ids.some((id) => !aiEntityIdSchema.safeParse(id).success)) {
    validationFailure({ id: ["A valid workspace, use-case and evaluation identifier is required."] });
  }
}

function refresh(hackathonId: string, useCaseId: string) {
  revalidatePath(`/hackathons/${hackathonId}/usecases/${useCaseId}`);
  revalidatePath(`/hackathons/${hackathonId}/usecases`);
  revalidatePath("/dashboard");
}

export const evaluateUseCaseAction = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, useCaseId: string) => {
    validateIds(hackathonId, useCaseId);
    getAiProvider();
    const startedAt = Date.now();
    const input = await aiTransaction(async (tx) => {
      await lockAiWorkspace(tx, hackathonId, ctx);
      const useCase = await tx.useCase.findFirst({
        where: { id: useCaseId, hackathonId },
        include: { teamMembers: { include: { contact: true } } },
      });
      if (!useCase) throw new AiError("Use case not found.", 404);
      renderUseCaseCanvas(useCase);
      const facts = gateFactsFromUseCase(useCase);
      const reservation = await reserveAiCall(tx, {
        userId: ctx.userId, hackathonId, useCaseId, operation: "evaluate", model: AI_MODEL,
      });
      return { useCase, facts, reservation };
    });
    let saved = false;
    try {
      const outcome = await evaluateUseCase(input.useCase, input.facts);
      const evaluation = await aiTransaction(async (tx) => {
        await lockAiWorkspace(tx, hackathonId, ctx);
        const current = await tx.useCase.findFirst({
          where: { id: useCaseId, hackathonId },
          include: { teamMembers: { include: { contact: true } } },
        });
        if (!current || current.version !== input.useCase.version ||
            !matchesEvaluationSnapshot(evaluationSnapshot(input.useCase, input.facts), current, gateFactsFromUseCase(current))) {
          throw new ConcurrencyConflictError("Use case");
        }
        const last = await tx.evaluation.findFirst({
          where: { useCaseId }, orderBy: { version: "desc" }, select: { version: true },
        });
        const qualifies = current.status === "Draft" && isQualified(outcome.gateResults);
        if (qualifies) {
          const changed = await tx.useCase.updateMany({
            where: { id: useCaseId, hackathonId, version: current.version, status: "Draft" },
            data: { status: "Qualified", version: { increment: 1 } },
          });
          if (changed.count !== 1) throw new ConcurrencyConflictError("Use case");
        }
        const result = await tx.evaluation.create({
          data: {
            useCaseId, version: (last?.version ?? 0) + 1,
            valueScore: outcome.valueScore, feasibilityScore: outcome.feasibilityScore,
            dataReadinessScore: outcome.dataReadinessScore, reusabilityScore: outcome.reusabilityScore,
            weightedScore: outcome.weightedScore, priorityBand: outcome.priorityBand,
            csFitBand: outcome.csFitBand, recommendedPlatform: outcome.recommendedPlatform,
            confidence: outcome.confidence,
            routingSignals: stringifyJsonField(outcome.routingSignals),
            gateResults: stringifyJsonField(outcome.gateResults),
            rationale: outcome.rationale, source: AI_PROVIDER === "mock" ? "mock" : "ai",
            model: outcome.model, promptVersion: outcome.promptVersion,
            methodologyVersion: outcome.methodologyVersion,
            rubricSnapshot: outcome.rubricSnapshot,
            useCaseVersion: current.version + (qualifies ? 1 : 0),
            useCaseSnapshot: evaluationSnapshot(input.useCase, input.facts),
          },
        });
        await finishAiCall(tx, input.reservation.id, startedAt, "ok", outcome.usage);
        await invalidateRunbookChecks(hackathonId, "All", tx);
        return result;
      });
      saved = true;
      refresh(hackathonId, useCaseId);
      return { evaluationId: evaluation.id, version: evaluation.version };
    } catch (error) {
      if (!saved) {
        const message = error instanceof ConcurrencyConflictError ? error.message : safeAiError(error).message;
        await aiTransaction((tx) => finishAiCall(tx, input.reservation.id, startedAt, "error", undefined, message))
          .catch(() => reportAiPersistenceFailure("evaluation-accounting", input.reservation.id));
      }
      if (error instanceof ConcurrencyConflictError) throw error;
      throw safeAiError(error);
    }
  },
);

export const overrideEvaluation = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, useCaseId: string, evaluationId: string, raw: unknown, expectedVersion?: number | null) => {
    validateIds(hackathonId, useCaseId, evaluationId);
    requireOverrideVersion(expectedVersion);
    const parsed = aiOverrideSchema.safeParse(raw);
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    const result = await aiTransaction(async (tx) => {
    await lockAiWorkspace(tx, hackathonId, ctx);
    const evaluation = await tx.evaluation.findFirst({
      where: { id: evaluationId, useCase: { id: useCaseId, hackathonId } },
      include: { override: true },
    });
    if (!evaluation) throw new AiError("Evaluation not found in this use case.", 404);
    if ((evaluation.override?.version ?? null) !== expectedVersion) {
      throw new ConcurrencyConflictError("This evaluation override");
    }

    const fields = ["valueScore", "feasibilityScore", "dataReadinessScore", "reusabilityScore",
      "csFitBand", "recommendedPlatform", "rationale"] as const;
    const merged = {
      valueScore: input.valueScore ?? evaluation.override?.valueScore ?? evaluation.valueScore,
      feasibilityScore: input.feasibilityScore ?? evaluation.override?.feasibilityScore ?? evaluation.feasibilityScore,
      dataReadinessScore: input.dataReadinessScore ?? evaluation.override?.dataReadinessScore ?? evaluation.dataReadinessScore,
      reusabilityScore: input.reusabilityScore ?? evaluation.override?.reusabilityScore ?? evaluation.reusabilityScore,
      csFitBand: input.csFitBand ?? evaluation.override?.csFitBand ?? evaluation.csFitBand,
      recommendedPlatform: input.recommendedPlatform ?? evaluation.override?.recommendedPlatform ?? evaluation.recommendedPlatform,
      rationale: input.rationale ?? evaluation.override?.rationale ?? evaluation.rationale,
    };
    const changed = fields.filter((key) => merged[key] !== evaluation[key]);
    if (changed.some((key) => key.endsWith("Score")) &&
        !evaluationRubric(evaluation, getMethodology().rubric)) {
      validationFailure({ reason: ["The historical rubric is unavailable. Re-evaluate before changing scores."] });
    }
    if (changed.length > 0 && !input.reason) validationFailure({ reason: ["Explain why this assessment is being overridden."] });
    const payload = {
      overriddenFields: stringifyJsonField(changed),
      valueScore: changed.includes("valueScore") ? merged.valueScore : null,
      feasibilityScore: changed.includes("feasibilityScore") ? merged.feasibilityScore : null,
      dataReadinessScore: changed.includes("dataReadinessScore") ? merged.dataReadinessScore : null,
      reusabilityScore: changed.includes("reusabilityScore") ? merged.reusabilityScore : null,
      csFitBand: changed.includes("csFitBand") ? merged.csFitBand : null,
      recommendedPlatform: changed.includes("recommendedPlatform") ? merged.recommendedPlatform : null,
      rationale: changed.includes("rationale") ? merged.rationale : null, reason: changed.length ? input.reason : null,
      overriddenBy: ctx.userId, overriddenAt: new Date(),
    };
    if (evaluation.override) {
      const updated = await tx.evaluationOverride.updateMany({
        where: { evaluationId, version: expectedVersion! },
        data: { ...payload, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConcurrencyConflictError("This evaluation override");
    } else {
      await tx.evaluationOverride.create({ data: { evaluationId, ...payload } });
    }
    await invalidateRunbookChecks(hackathonId, "All", tx);
    return { overriddenFields: changed, version: (expectedVersion ?? -1) + 1 };
    });
    refresh(hackathonId, useCaseId);
    return result;
  },
);

export const clearOverride = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, useCaseId: string, evaluationId: string, expectedVersion?: number | null) => {
    validateIds(hackathonId, useCaseId, evaluationId);
    requireOverrideVersion(expectedVersion);
    // The evaluation ID is attacker-controlled; workspace authorization alone is insufficient.
    const version = await aiTransaction(async (tx) => {
    await lockAiWorkspace(tx, hackathonId, ctx);
    const evaluation = await tx.evaluation.findFirst({
      where: { id: evaluationId, useCase: { id: useCaseId, hackathonId } },
      include: { override: true },
    });
    if (!evaluation) throw new AiError("Evaluation not found in this use case.", 404);
    if ((evaluation.override?.version ?? null) !== expectedVersion) throw new ConcurrencyConflictError("This evaluation override");
    if (!evaluation.override) return null;
    // Retain the revision on a cleared row so an old tab cannot revive a stale edit.
    const updated = await tx.evaluationOverride.updateMany({
      where: { evaluationId, version: expectedVersion!, evaluation: { useCase: { id: useCaseId, hackathonId } } },
      data: {
        overriddenFields: "[]", valueScore: null, feasibilityScore: null,
        dataReadinessScore: null, reusabilityScore: null, csFitBand: null,
        recommendedPlatform: null, rationale: null, reason: null,
        overriddenBy: ctx.userId, overriddenAt: new Date(), version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ConcurrencyConflictError("This evaluation override");
    await invalidateRunbookChecks(hackathonId, "All", tx);
    return evaluation.override.version + 1;
    });
    refresh(hackathonId, useCaseId);
    return { cleared: true, version };
  },
);

function requireOverrideVersion(value: unknown): asserts value is number | null {
  if (value !== null && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
    validationFailure({ version: ["Reload the evaluation before editing or clearing its override."] });
  }
}

export const getAiProviderInfo = withAccess("Viewer", async () => ({
  provider: AI_PROVIDER, model: AI_MODEL,
}));
