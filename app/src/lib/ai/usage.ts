import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AiError } from "./errors";
import { GENERATION_TIMEOUT_MS, positiveLimit } from "./limits";
import type { CompletionUsage } from "./provider";

export async function aiTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (attempt >= 3 || !["P2034", "P2002", "P1008", "P2028"].includes(code ?? "")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

export interface AiReservationInput {
  userId: string;
  hackathonId: string;
  useCaseId: string;
  operation: "evaluate" | "build-guide";
  model: string;
}

/** Failed and interrupted requests still consume a call: they may have incurred tokens. */
export async function reserveAiCall(tx: Prisma.TransactionClient, input: AiReservationInput) {
  const budget = positiveLimit("AI_DAILY_CALL_BUDGET", 100, 10_000);
  const userConcurrency = positiveLimit("AI_MAX_CONCURRENT_PER_USER", 2, 10);
  const globalConcurrency = positiveLimit("AI_MAX_CONCURRENT_CALLS", 8, 100);
  const now = new Date();
  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  // A crashed process cannot hold a reservation forever; the provider deadline is shorter.
  const expired = new Date(now.getTime() - GENERATION_TIMEOUT_MS - 60_000);
  await tx.aiUsage.updateMany({
    where: { status: "reserved", createdAt: { lt: expired } },
    data: { status: "error", errorMessage: "Generation interrupted or timed out." },
  });
  const used = await tx.aiUsage.count({ where: { userId: input.userId, createdAt: { gte: since } } });
  if (used >= budget) {
    throw new AiError(`Daily AI budget reached (${budget} calls across evaluations and guides). Resets at midnight UTC.`, 429);
  }
  const active = await tx.aiUsage.count({ where: { status: "reserved" } });
  const userActive = await tx.aiUsage.count({ where: { userId: input.userId, status: "reserved" } });
  if (active >= globalConcurrency || userActive >= userConcurrency) {
    throw new AiError("AI generation is busy. Wait for an active request to finish and retry.", 429);
  }
  return tx.aiUsage.create({ data: { ...input, status: "reserved" } });
}

export async function finishAiCall(
  tx: Prisma.TransactionClient,
  id: string,
  startedAt: number,
  status: "ok" | "error",
  usage?: CompletionUsage,
  errorMessage?: string,
) {
  return tx.aiUsage.update({
    where: { id },
    data: {
      status,
      latencyMs: Math.min(2_147_483_647, Date.now() - startedAt),
      ...(usage ? usage : {}),
      errorMessage: errorMessage ?? null,
    },
  });
}
