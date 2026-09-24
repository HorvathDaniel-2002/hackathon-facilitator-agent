import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createAiTestDatabase } from "./ai-database";

const databasePath = path.join(process.cwd(), "tests", "unit", `.ai-quota-${randomUUID()}.db`);
let client: PrismaClient;
let ai: typeof import("@/lib/ai/usage");
const request = {
  userId: "user", hackathonId: "workspace", useCaseId: "case",
  operation: "evaluate" as const, model: "mock-model",
};

beforeAll(async () => {
  createAiTestDatabase(databasePath);
  client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  vi.doMock("@/lib/db", () => ({ prisma: client }));
  ai = await import("@/lib/ai/usage");
}, 60_000);
beforeEach(async () => {
  await client.aiUsage.deleteMany();
  vi.stubEnv("AI_DAILY_CALL_BUDGET", "2");
  vi.stubEnv("AI_MAX_CONCURRENT_PER_USER", "2");
  vi.stubEnv("AI_MAX_CONCURRENT_CALLS", "8");
});
afterAll(async () => {
  await client?.$disconnect();
  vi.unstubAllEnvs();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(databasePath + suffix, { force: true });
});

describe("transactional shared AI quota (isolated SQLite)", () => {
  it("reserves before provider work and shares the budget between both operations", async () => {
    const first = await ai.aiTransaction((tx) => ai.reserveAiCall(tx, request));
    expect(first.status).toBe("reserved");
    await ai.aiTransaction((tx) => ai.finishAiCall(tx, first.id, Date.now(), "error", undefined, "Safe failure"));
    await ai.aiTransaction((tx) => ai.reserveAiCall(tx, { ...request, operation: "build-guide" }));
    await expect(ai.aiTransaction((tx) => ai.reserveAiCall(tx, request))).rejects.toThrow(/Daily AI budget/);
    expect(await client.aiUsage.count()).toBe(2);
  });
  it("does not oversubscribe the last budget slot under concurrent requests", async () => {
    vi.stubEnv("AI_DAILY_CALL_BUDGET", "1");
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, index) =>
      ai.aiTransaction((tx) => ai.reserveAiCall(tx, {
        ...request, operation: index % 2 ? "build-guide" : "evaluate",
      })),
    ));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await client.aiUsage.count()).toBe(1);
  });
  it("enforces global concurrency across different users", async () => {
    vi.stubEnv("AI_MAX_CONCURRENT_CALLS", "1");
    await ai.aiTransaction((tx) => ai.reserveAiCall(tx, request));
    await expect(ai.aiTransaction((tx) => ai.reserveAiCall(tx, { ...request, userId: "other" })))
      .rejects.toThrow(/busy/);
  });
  it("expires crashed reservations but still counts their daily cost", async () => {
    const old = await client.aiUsage.create({ data: {
      ...request, status: "reserved", createdAt: new Date(Date.now() - 240_000),
    } });
    await ai.aiTransaction((tx) => ai.reserveAiCall(tx, request));
    expect((await client.aiUsage.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("error");
    await expect(ai.aiTransaction((tx) => ai.reserveAiCall(tx, request))).rejects.toThrow(/Daily AI budget/);
  });
  it.each(["0", "-1", "NaN", "Infinity", "1.5"])("fails closed for invalid configured budget %s", async (budget) => {
    vi.stubEnv("AI_DAILY_CALL_BUDGET", budget);
    await expect(ai.aiTransaction((tx) => ai.reserveAiCall(tx, request))).rejects.toThrow(/positive integer/);
    expect(await client.aiUsage.count()).toBe(0);
  });
});
