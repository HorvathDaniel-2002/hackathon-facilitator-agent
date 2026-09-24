import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { entityIdSchema, membershipRoleSchema, ROLE_RANK, type MembershipRole } from "@/lib/schemas";

/**
 * Pluggable authentication — plan D-5 / R-10.
 *
 * The Entra app registration is not available yet, so the whole app runs against
 * a `dev` provider with seeded users. Nothing downstream knows the difference:
 * when the app registration lands, only this module changes.
 *
 * Dev auth must never serve production requests. Packaging the app does not
 * establish a real identity provider; Entra remains fail-closed until implemented.
 */

export type AuthMode = "dev" | "entra";

export const AUTH_MODE = process.env.AUTH_MODE;

export const IS_DEV_AUTH = AUTH_MODE === "dev";

/**
 * R-10 guard.
 *
 * Enforced per request rather than at module load, because `next build` runs
 * with NODE_ENV=production while collecting page data — failing there would
 * block builds without protecting anything. Checking on the path that actually
 * resolves an identity is the stronger guarantee: a production server running
 * dev auth cannot serve a single authenticated request.
 */
async function assertAuthModeIsSafe(): Promise<void> {
  // Resolve request context first so Next never pre-renders authenticated routes.
  const requestHeaders = await headers();
  if (AUTH_MODE !== "dev" && AUTH_MODE !== "entra") {
    throw new AccessDeniedError("Configure AUTH_MODE explicitly as 'dev' or 'entra'.");
  }
  if (AUTH_MODE === "dev" && process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    throw new Error(
      "Refusing to serve: AUTH_MODE must be 'entra' in production. " +
        "Dev authentication has no real identity check and must never be deployed.",
    );
  }
  if (AUTH_MODE === "dev") {
    const host = requestHeaders.get("host") ?? "";
    const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
    const forwardedHost = requestHeaders.get("x-forwarded-host");
    const origin = requestHeaders.get("origin");
    if (!loopback.test(host) || (forwardedHost && forwardedHost.toLowerCase() !== host.toLowerCase())) {
      throw new AccessDeniedError("Development authentication is limited to localhost.");
    }
    if (origin) {
      let sameOrigin = false;
      try {
        const parsed = new URL(origin);
        sameOrigin = ["http:", "https:"].includes(parsed.protocol) && parsed.host.toLowerCase() === host.toLowerCase();
      } catch { /* Invalid origins are rejected. */ }
      if (!sameOrigin) throw new AccessDeniedError("Invalid development request origin.");
    }
  }
}

const SESSION_COOKIE = "hf_session";
const DEV_EMAILS = [
  "facilitator@example.com",
  "co-facilitator@example.com",
  "sponsor@example.com",
];
const DEV_NAMES = ["Dana Reyes", "Mikael Berg", "Priya Raman"];

function isSeededDevUser(user: { email: string; name: string; globalRole: string; entraOid?: string | null }): boolean {
  const index = DEV_EMAILS.indexOf(user.email);
  return index >= 0 && user.name === DEV_NAMES[index] && !user.entraOid &&
    user.globalRole === (index === 0 ? "Admin" : "User");
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  globalRole: string;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  await assertAuthModeIsSafe();

  if (AUTH_MODE === "entra") {
    // Wired in Phase 6 alongside the Entra app registration.
    throw new AccessDeniedError("Entra authentication is not configured. Access is disabled.");
  }

  const store = await cookies();
  const userId = store.get(SESSION_COOKIE)?.value;

  // Only the known fixture identities can use the local demo provider.
  if (userId && !entityIdSchema.safeParse(userId).success) return null;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findUnique({ where: { email: DEV_EMAILS[0] } });

  if (!user || !isSeededDevUser(user)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    globalRole: user.globalRole,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AccessDeniedError("Not signed in with an allowed development identity.");
  }
  return user;
}

export async function setDevUser(userId: string): Promise<void> {
  await assertAuthModeIsSafe();
  if (!IS_DEV_AUTH || !entityIdSchema.safeParse(userId).success) throw new AccessDeniedError();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !isSeededDevUser(user)) throw new AccessDeniedError();
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function clearDevSession(): Promise<void> {
  await assertAuthModeIsSafe();
  if (!IS_DEV_AUTH) throw new AccessDeniedError();
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function listDevUsers(): Promise<SessionUser[]> {
  await assertAuthModeIsSafe();
  if (!IS_DEV_AUTH) throw new AccessDeniedError();
  const users = await prisma.user.findMany({
    where: { email: { in: DEV_EMAILS }, entraOid: null },
    orderBy: { createdAt: "asc" },
  });
  return users.filter(isSeededDevUser).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    globalRole: u.globalRole,
  }));
}

export class AccessDeniedError extends Error {
  constructor(message = "You do not have access to this hackathon.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

/**
 * THE authorization chokepoint (architectural rule 5).
 *
 * Every read and every mutation that touches hackathon-scoped data goes through
 * here. Keeping it to one function is what makes authorization coverage
 * *provable* rather than a matter of reviewer vigilance (plan R-8).
 */
export async function assertAccess(
  userId: string,
  hackathonId: string,
  minRole: MembershipRole = "Viewer",
): Promise<MembershipRole> {
  if (!entityIdSchema.safeParse(userId).success || !entityIdSchema.safeParse(hackathonId).success) {
    throw new AccessDeniedError();
  }
  const required = membershipRoleSchema.safeParse(minRole);
  if (!required.success) throw new AccessDeniedError();
  const membership = await prisma.membership.findUnique({
    where: { userId_hackathonId: { userId, hackathonId } },
  });

  if (!membership) throw new AccessDeniedError();

  const parsedRole = membershipRoleSchema.safeParse(membership.role);
  if (!parsedRole.success) throw new AccessDeniedError();
  const role = parsedRole.data;
  if (ROLE_RANK[role] < ROLE_RANK[required.data]) {
    throw new AccessDeniedError(
      `This action requires the ${minRole} role; you are a ${role}.`,
    );
  }
  return role;
}

export async function getUserRole(
  userId: string,
  hackathonId: string,
): Promise<MembershipRole | null> {
  if (!entityIdSchema.safeParse(userId).success || !entityIdSchema.safeParse(hackathonId).success) return null;
  const membership = await prisma.membership.findUnique({
    where: { userId_hackathonId: { userId, hackathonId } },
  });
  const parsed = membershipRoleSchema.safeParse(membership?.role);
  return parsed.success ? parsed.data : null;
}

export function canEdit(role: MembershipRole | null): boolean {
  const parsed = membershipRoleSchema.safeParse(role);
  return parsed.success && ROLE_RANK[parsed.data] >= ROLE_RANK.Contributor;
}
