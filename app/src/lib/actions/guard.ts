import { AccessDeniedError, assertAccess, requireUser } from "@/lib/auth";
import { ConcurrencyConflictError, prisma } from "@/lib/db";
import { entityIdSchema, membershipRoleSchema, ROLE_RANK, versionSchema, type MembershipRole } from "@/lib/schemas";
import type { Prisma } from "@prisma/client";

/**
 * Authorization wrapper for every mutation — plan R-8.
 *
 * Wrapping (rather than calling assertAccess by hand inside each action) is what
 * makes coverage *provable*: tests/unit/actions-guarded.test.ts asserts that every
 * exported action carries the marker below, so a new action cannot ship without
 * an authorization check just because a reviewer didn't notice.
 */

export interface ActionOk<T> {
  ok: true;
  data: T;
}
export interface ActionError {
  ok: false;
  error: string;
  code: "denied" | "conflict" | "validation" | "error";
  fieldErrors?: Record<string, string[]>;
}
export type ActionResult<T> = ActionOk<T> | ActionError;

export const GUARD_MARKER = Symbol.for("hf.guarded-action");

type Guarded<A extends unknown[], R> = ((...args: A) => Promise<ActionResult<R>>) & {
  [GUARD_MARKER]?: true;
};

/**
 * Wraps an action that operates on a hackathon. The first argument must be the
 * hackathon id so access can be checked before any work happens.
 */
export function withAccess<A extends [string, ...unknown[]], R>(
  minRole: MembershipRole,
  fn: (
    ctx: { userId: string; role: MembershipRole },
    ...args: A
  ) => Promise<R>,
): Guarded<A, R> {
  const wrapped = async (...args: A): Promise<ActionResult<R>> => {
    try {
      const user = await requireUser();
      const hackathonId = requireId(args[0], "hackathonId");
      const role = await assertAccess(user.id, hackathonId, minRole);
      const data = await fn({ userId: user.id, role }, ...args);
      return { ok: true, data };
    } catch (err) {
      return toActionError(err);
    }
  };

  (wrapped as Guarded<A, R>)[GUARD_MARKER] = true;
  return wrapped as Guarded<A, R>;
}

/** For actions that are not scoped to a hackathon (e.g. creating one). */
export function withUser<A extends unknown[], R>(
  fn: (ctx: { userId: string }, ...args: A) => Promise<R>,
): Guarded<A, R> {
  const wrapped = async (...args: A): Promise<ActionResult<R>> => {
    try {
      const user = await requireUser();
      const data = await fn({ userId: user.id }, ...args);
      return { ok: true, data };
    } catch (err) {
      return toActionError(err);
    }
  };

  (wrapped as Guarded<A, R>)[GUARD_MARKER] = true;
  return wrapped as Guarded<A, R>;
}

export function toActionError(err: unknown): ActionError {
  if (err instanceof AccessDeniedError) {
    return { ok: false, error: err.message, code: "denied" };
  }
  if (err instanceof ConcurrencyConflictError) {
    return { ok: false, error: err.message, code: "conflict" };
  }
  // Actions attach Zod's flattened fieldErrors so the form can highlight inputs
  // instead of showing one opaque message.
  const fieldErrors = (err as { __validation?: Record<string, string[]> })
    ?.__validation;
  if (fieldErrors) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      code: "validation",
      fieldErrors,
    };
  }
  const databaseCode = (err as { code?: unknown })?.code;
  if (databaseCode === "P2002" || databaseCode === "P2025") {
    return {
      ok: false,
      error: "The record changed or already exists. Reload and try again.",
      code: "conflict",
    };
  }
  if ((typeof databaseCode === "string" && /^P\d{4}$/.test(databaseCode)) ||
    (err instanceof Error && err.name.startsWith("PrismaClient"))) {
    return { ok: false, error: "The database operation could not be completed. Please try again.", code: "error" };
  }
  const message =
    err instanceof Error ? err.message : "Something went wrong. Please try again.";
  return { ok: false, error: message, code: "error" };
}

export function validationFailure(
  fieldErrors: Record<string, string[]>,
): never {
  throw Object.assign(new Error("validation"), { __validation: fieldErrors });
}

export function requireId(value: unknown, field = "id"): string {
  const parsed = entityIdSchema.safeParse(value);
  if (!parsed.success) validationFailure({ [field]: ["A valid identifier is required."] });
  return parsed.data;
}

export function requireVersion(value: unknown): number {
  const parsed = versionSchema.safeParse(value);
  if (!parsed.success) validationFailure({ expectedVersion: ["Reload to obtain a valid record version."] });
  return parsed.data;
}

export type WorkspaceWriteActor = { userId: string; role: MembershipRole };
export type WorkspaceWriteOptions = { allowClosed?: boolean; allowArchived?: boolean };

/** Check before expensive work, and again inside the caller's serialized write transaction. */
export async function assertWorkspaceWriteAccess(
  hackathonId: string,
  actor: WorkspaceWriteActor,
  db: Pick<Prisma.TransactionClient, "hackathon" | "membership"> = prisma,
  options: WorkspaceWriteOptions = {},
) {
  const membership = await db.membership.findUnique({
    where: { userId_hackathonId: { userId: actor.userId, hackathonId } },
  });
  const role = membershipRoleSchema.safeParse(membership?.role);
  const previousRole = membershipRoleSchema.safeParse(actor.role);
  // Revocation/demotion must also revoke decisions already made with the old role.
  if (!role.success || !previousRole.success || ROLE_RANK[role.data] < ROLE_RANK.Contributor ||
    ROLE_RANK[role.data] < ROLE_RANK[previousRole.data]) {
    throw new AccessDeniedError("Your workspace access changed. Reload before making changes.");
  }
  const event = await db.hackathon.findUniqueOrThrow({
    where: { id: hackathonId }, select: { status: true },
  });
  if (event.status === "Archived" && !options.allowArchived) {
    validationFailure({ status: ["Restore the archived event to Planning before making changes."] });
  }
  if (event.status === "Closed" && !options.allowClosed) {
    validationFailure({ status: ["Reopen the event to Planning before making changes."] });
  }
  return event;
}

/** Serialize workspace invariants before reading their current state. */
export async function workspaceTransaction<T>(
  hackathonId: string,
  actor: WorkspaceWriteActor,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: WorkspaceWriteOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const locked = await tx.hackathon.updateMany({
          where: { id: hackathonId },
          data: { version: { increment: 1 } },
        });
        if (locked.count !== 1) throw new ConcurrencyConflictError("This hackathon");
        await assertWorkspaceWriteAccess(hackathonId, actor, tx, options);
        return fn(tx);
      });
    } catch (error) {
      if (attempt < 2 && (error as { code?: string })?.code === "P2034") continue;
      throw error;
    }
  }
}
