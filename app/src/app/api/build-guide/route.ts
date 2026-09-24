import { after } from "next/server";
import { buildGuidePrompt, streamBuildGuide, splitGuide, splitPartialGuide, type GuideContext } from "@/lib/ai/guide";
import { AI_MODEL, AI_PROVIDER, getAiProvider } from "@/lib/ai/provider";
import { AiError, safeAiError } from "@/lib/ai/errors";
import { assertAiRequestOrigin, guideRequestSchema } from "@/lib/ai/input-validation";
import { GENERATION_TIMEOUT_MS, MAX_OUTPUT_CHARS } from "@/lib/ai/limits";
import { aiTransaction, finishAiCall, reserveAiCall } from "@/lib/ai/usage";
import { gateFactsFromUseCase, matchesEvaluationSnapshot } from "@/lib/ai/provenance";
import { reportAiPersistenceFailure } from "@/lib/ai/diagnostics";
import { lockAiWorkspace } from "@/lib/ai/workspace-access";
import { AccessDeniedError, assertAccess, requireUser } from "@/lib/auth";
import { apiFailure } from "@/lib/api-errors";
import { prisma, stringifyJsonField } from "@/lib/db";
import { toEffectiveEvaluation } from "@/lib/domain/evaluation";
import { getMethodology } from "@/lib/methodology";
import { platformSchema, type MembershipRole } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  let ids: { hackathonId: string; useCaseId: string };
  try {
    assertAiRequestOrigin(request);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      throw new AiError("Content-Type must be application/json.", 415);
    }
    // Bound the body before JSON.parse, including chunked requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new AiError("A JSON request body is required.", 400);
    const decoder = new TextDecoder();
    let body = "";
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2_048) {
          await reader.cancel();
          throw new AiError("Request body is too large.", 413);
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const parsed = guideRequestSchema.safeParse(JSON.parse(body));
    if (!parsed.success) throw new AiError("Valid hackathonId and useCaseId are required.", 400);
    ids = parsed.data;
  } catch (error) {
    const safe = error instanceof AiError ? error : new AiError("Invalid JSON request body.", 400);
    return Response.json({ error: safe.message }, { status: safe.status });
  }
  const { hackathonId, useCaseId } = ids;
  let userId: string;
  let role: MembershipRole;
  try {
    const user = await requireUser();
    role = await assertAccess(user.id, hackathonId, "Contributor");
    userId = user.id;
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return Response.json({ error: "Sign in with contributor access to this workspace." }, { status: 403 });
    }
    return apiFailure(error, "guide-auth");
  }

  const startedAt = Date.now();
  let job: Awaited<ReturnType<typeof prepareJob>>;
  try {
    getAiProvider();
    job = await prepareJob({ userId, role }, hackathonId, useCaseId);
  } catch (error) {
    const safe = safeAiError(error);
    return Response.json({ error: safe.message }, { status: safe.status });
  }

  const encoder = new TextEncoder();
  let connected = true;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { connected = false; },
  });
  const generation = (async () => {
    let accumulated = "";
    let checkpointSize = 0;
    let checkpointAt = Date.now();
    let complete = false;
    const abort = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
    try {
      const source = await streamBuildGuide(job.ctx, abort);
      for await (const chunk of source) {
        abort.throwIfAborted();
        if (accumulated.length + chunk.length > MAX_OUTPUT_CHARS) {
          throw new AiError("The guide exceeded the output limit.");
        }
        accumulated += chunk;
        if (accumulated.length - checkpointSize >= 2_000 || Date.now() - checkpointAt >= 1_000) {
          try {
            await prisma.buildGuide.update({
              where: { id: job.guide.id }, data: splitPartialGuide(accumulated),
            });
          } catch (error) {
            reportAiPersistenceFailure("guide-checkpoint", job.guide.id);
            throw error;
          }
          checkpointSize = accumulated.length;
          checkpointAt = Date.now();
        }
        if (connected) {
          try { controller.enqueue(encoder.encode(chunk)); }
          catch { connected = false; }
        }
      }
      const result = splitGuide(accumulated);
      // Save the same allocated row and usage atomically. A usage failure cannot duplicate a guide.
      try {
        await aiTransaction(async (tx) => {
          await lockAiWorkspace(tx, hackathonId, { userId, role });
          await tx.buildGuide.update({
            where: { id: job.guide.id }, data: { ...result, status: "complete", errorMessage: null },
          });
          await finishAiCall(tx, job.reservation.id, startedAt, "ok");
        });
      } catch (error) {
        reportAiPersistenceFailure("guide-finalization", job.guide.id);
        throw error;
      }
      complete = true;
      if (connected) controller.close();
    } catch (error) {
      const safe = safeAiError(error);
      if (!complete) {
        await prisma.buildGuide.update({
          where: { id: job.guide.id },
          data: { ...splitPartialGuide(accumulated), status: "failed", errorMessage: safe.message },
        }).catch(() => reportAiPersistenceFailure("guide-failure", job.guide.id));
        await aiTransaction((tx) =>
          finishAiCall(tx, job.reservation.id, startedAt, "error", undefined, safe.message),
        ).catch(() => reportAiPersistenceFailure("guide-accounting", job.guide.id));
      }
      if (connected) {
        try { controller.error(safe); } catch { connected = false; }
      }
    }
  })();
  // Keep the independent persistence consumer alive after a browser cancellation.
  // This is process-local durability, not a durable queue: crashes retain the latest checkpoint.
  after(() => generation);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Ai-Provider": AI_PROVIDER,
      "X-Guide-Version": String(job.guide.version),
      "X-Guide-Id": job.guide.id,
    },
  });
}

async function prepareJob(actor: { userId: string; role: MembershipRole }, hackathonId: string, useCaseId: string) {
  return aiTransaction(async (tx) => {
    await lockAiWorkspace(tx, hackathonId, actor);
    const useCase = await tx.useCase.findFirst({
      where: { id: useCaseId, hackathonId },
      include: {
        evaluations: { orderBy: { version: "desc" }, take: 1, include: { override: true } },
        teamMembers: { include: { contact: true } },
      },
    });
    if (!useCase) throw new AiError("Use case not found.", 404);
    const latest = useCase.evaluations[0];
    if (!latest) throw new AiError("Evaluate this use case first; the guide follows its platform routing.", 400);
    const facts = gateFactsFromUseCase(useCase);
    if (!matchesEvaluationSnapshot(latest.useCaseSnapshot, useCase, facts)) {
      throw new AiError("Evaluation evidence is missing or the use case changed. Re-evaluate before generating a guide.", 409);
    }
    const effective = toEffectiveEvaluation(latest, getMethodology().rubric);
    const ctx: GuideContext = {
      useCase,
      platform: platformSchema.parse(effective.recommendedPlatform),
      priorityBand: effective.priorityBand,
      weightedScore: effective.weightedScore,
      failedGates: effective.gateResults.filter((gate) => !gate.pass).map((gate) => ({ label: gate.label, reason: gate.reason })),
    };
    const prompt = buildGuidePrompt(ctx);
    const expired = new Date(Date.now() - GENERATION_TIMEOUT_MS - 60_000);
    await tx.buildGuide.updateMany({
      where: { useCaseId, status: "streaming", generatedAt: { lt: expired } },
      data: { status: "failed", errorMessage: "Generation interrupted or timed out; partial output is retained." },
    });
    if (await tx.buildGuide.count({ where: { useCaseId, status: "streaming" } })) {
      throw new AiError("A guide for this use case is already in progress.", 409);
    }
    const reservation = await reserveAiCall(tx, {
      userId: actor.userId, hackathonId, useCaseId, operation: "build-guide", model: AI_MODEL,
    });
    const last = await tx.buildGuide.findFirst({
      where: { useCaseId }, orderBy: { version: "desc" }, select: { version: true },
    });
    const guide = await tx.buildGuide.create({
      data: {
        useCaseId, version: (last?.version ?? 0) + 1, platform: ctx.platform,
        status: "streaming", model: AI_MODEL, promptVersion: prompt.promptVersion,
        methodologyVersion: prompt.methodologyVersion,
        useCaseVersion: useCase.version, evaluationId: latest.id,
        inputSnapshot: stringifyJsonField({ canvas: prompt.user, evaluationVersion: latest.version }),
      },
    });
    return { ctx, guide, reservation };
  });
}
