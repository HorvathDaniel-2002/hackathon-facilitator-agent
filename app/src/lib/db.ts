import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

/**
 * In dev, Next.js hot-reload re-evaluates modules; without this cache every
 * reload would open a new connection and eventually exhaust the pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Prisma 7 connects through a driver adapter rather than a URL in the schema.
 *
 * SQLite is the supported local database. PostgreSQL requires a reviewed schema,
 * provider-specific migrations, data transfer and transaction/recovery tests.
 */
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const adapter = new PrismaBetterSqlite3({ url });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * The schema stores structured blobs as JSON strings to stay portable between
 * SQLite and PostgreSQL (plan R-3). These helpers are the only place that knows
 * that, and they never throw on malformed data — a corrupt row degrades to a
 * default instead of taking a page down.
 */
export function parseJsonField<T>(
  raw: string | null | undefined,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (validate) return validate(value) ? value : fallback;
    if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
    if (fallback !== null && typeof fallback !== typeof value) return fallback;
    return value as T;
  } catch {
    return fallback;
  }
}

export function stringifyJsonField(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Thrown when an optimistic-concurrency update matched no rows (plan R-7). */
export class ConcurrencyConflictError extends Error {
  constructor(entity: string) {
    super(
      `${entity} was changed by someone else while you were editing. Reload to see the latest version.`,
    );
    this.name = "ConcurrencyConflictError";
  }
}
