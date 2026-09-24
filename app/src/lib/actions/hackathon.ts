"use server";

import { requireId, requireVersion, validationFailure, withAccess, withUser, workspaceTransaction } from "@/lib/actions/guard";
import { ConcurrencyConflictError, prisma } from "@/lib/db";
import { missingClosureRequirements } from "@/lib/domain/handoff";
import { isQualified } from "@/lib/domain/gates";
import { readEvaluationGates } from "@/lib/domain/evaluation";
import { gateFactsFromUseCase, matchesEvaluationSnapshot } from "@/lib/ai/provenance";
import { getMethodology } from "@/lib/methodology";
import { assertEventTransition, invalidateRunbookChecks } from "@/lib/runbook";
import {
  hackathonInputSchema,
  hackathonUpdateInputSchema,
  inviteMemberInputSchema,
  type MembershipRole,
} from "@/lib/schemas";
import { revalidatePath } from "next/cache";

export const createHackathon = withUser(async ({ userId }, raw: unknown) => {
  const parsed = hackathonInputSchema.safeParse(raw);
  if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  if (input.status !== "Planning") validationFailure({ status: ["New hackathons must start in Planning. Complete the runbook before advancing."] });

  const hackathon = await prisma.hackathon.create({
    data: {
      name: input.name,
      customer: input.customer,
      status: input.status,
      // The creator is always the Owner — otherwise they'd lock themselves out.
      memberships: { create: { userId, role: "Owner" } },
    },
  });

  revalidatePath("/hackathons");
  revalidatePath("/dashboard");
  return { id: hackathon.id };
});

export const updateHackathon = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, raw: unknown, expectedVersion: number) => {
    requireVersion(expectedVersion);
    const parsed = hackathonUpdateInputSchema.safeParse(raw);
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    if (input.status === "Archived" && ctx.role !== "Owner") {
      validationFailure({ status: ["Only an Owner may archive a hackathon."] });
    }
    await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const locked = await tx.hackathon.findUniqueOrThrow({ where: { id: hackathonId } });
    // workspaceTransaction already advanced the version when taking the lock.
    if (locked.version !== expectedVersion + 1) throw new ConcurrencyConflictError("This hackathon");
    if (locked.status === "Archived" && (input.status !== "Planning" || ctx.role !== "Owner")) {
      validationFailure({ status: ["Only an Owner may restore an archived event, and it must return to Planning."] });
    }
    if (locked.status === "Closed" && input.status !== "Planning" && input.status !== "Archived") {
      validationFailure({ status: ["Reopen the workspace to Planning before editing its settings or restarting it."] });
    }
    const scopeChanged = (["name", "customer"] as const)
      .some((key) => input[key] !== undefined && input[key]?.trim() !== locked[key].trim());
    if (scopeChanged || locked.status === "Archived") {
      await invalidateRunbookChecks(hackathonId, "All", tx);
    } else if (locked.status === "Closed" && input.status === "Planning") {
      await invalidateRunbookChecks(hackathonId, "Close", tx);
    }
    if (input.status) await assertEventTransition(hackathonId, input.status, tx);
    if (input.status === "Ready" || input.status === "Running") {
      const activeCases = await tx.useCase.findMany({
        where: { hackathonId, status: { in: ["Selected", "Building", "Demoed"] } },
        include: {
          teamMembers: { include: { contact: true } },
          evaluations: { orderBy: { version: "desc" }, take: 1 },
        },
      });
      const unqualified = activeCases.filter((useCase) => {
        const latest = useCase.evaluations[0];
        return !latest || !isQualified(readEvaluationGates(latest.gateResults)) ||
          !matchesEvaluationSnapshot(latest.useCaseSnapshot, useCase, gateFactsFromUseCase(useCase));
      });
      if (unqualified.length) {
        validationFailure({ status: [`Resolve hard gates and re-evaluate active cases before starting: ${unqualified.map((useCase) => useCase.code).join(", ")}.`] });
      }
    }
    if (input.status === "Closed") {
      const cases = await tx.useCase.findMany({ where: { hackathonId }, include: { handoff: true } });
      const incomplete = cases.filter((useCase) =>
        useCase.status !== "Closed" || missingClosureRequirements(useCase.handoff, getMethodology().handoff).length > 0);
      if (incomplete.length) {
        validationFailure({ status: [`Close every use case with a complete handoff first: ${incomplete.map((useCase) => useCase.code).join(", ")}.`] });
      }
    }
    const result = await tx.hackathon.updateMany({
      where: { id: hackathonId, version: expectedVersion + 1 },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.customer !== undefined ? { customer: input.customer } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    if (result.count === 0) throw new ConcurrencyConflictError("This hackathon");
    }, { allowClosed: true, allowArchived: true });

    revalidatePath(`/hackathons/${hackathonId}`);
    revalidatePath(`/hackathons/${hackathonId}/settings`);
    revalidatePath(`/hackathons/${hackathonId}/runbook`);
    revalidatePath("/hackathons");
    revalidatePath("/dashboard");
    return { updated: true };
  },
);

export const inviteMember = withAccess(
  "Owner",
  async (ctx, hackathonId: string, email: string, role: MembershipRole) => {
    const parsed = inviteMemberInputSchema.safeParse({ email, role });
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const normalized = parsed.data.email;

    // Dev auth has no directory to look people up in, so an invite creates the
    // user record on first mention. With Entra this becomes a directory lookup.
    const user = await workspaceTransaction(hackathonId, ctx, async (tx) => {
      const user = await tx.user.upsert({
        where: { email: normalized },
        update: {},
        create: { email: normalized, name: normalized.split("@")[0] },
      });
      const target = await tx.membership.findUnique({
        where: { userId_hackathonId: { userId: user.id, hackathonId } },
      });
      if (target?.role === "Owner" && parsed.data.role !== "Owner") {
        const owners = await tx.membership.count({ where: { hackathonId, role: "Owner" } });
        if (owners <= 1) throw new Error("A hackathon must keep at least one Owner.");
      }
      await tx.membership.upsert({
        where: { userId_hackathonId: { userId: user.id, hackathonId } },
        update: { role: parsed.data.role },
        create: { userId: user.id, hackathonId, role: parsed.data.role },
      });
      return user;
    }, { allowClosed: true, allowArchived: true });

    revalidatePath(`/hackathons/${hackathonId}`);
    revalidatePath(`/hackathons/${hackathonId}/settings`);
    return { userId: user.id };
  },
);

export const removeMember = withAccess(
  "Owner",
  async (ctx, hackathonId: string, userId: string) => {
    requireId(userId, "userId");
    await workspaceTransaction(hackathonId, ctx, async (tx) => {
      const target = await tx.membership.findUnique({
        where: { userId_hackathonId: { userId, hackathonId } },
      });
      if (!target) throw new ConcurrencyConflictError("This membership");
      if (target.role === "Owner") {
        const owners = await tx.membership.count({ where: { hackathonId, role: "Owner" } });
        if (owners <= 1) throw new Error("A hackathon must keep at least one Owner.");
      }
      const result = await tx.membership.deleteMany({ where: { hackathonId, userId } });
      if (result.count !== 1) throw new ConcurrencyConflictError("This membership");
    }, { allowClosed: true, allowArchived: true });
    revalidatePath(`/hackathons/${hackathonId}`);
    revalidatePath(`/hackathons/${hackathonId}/settings`);
    return { removed: true };
  },
);

export const archiveHackathon = withAccess(
  "Owner",
  async (ctx, hackathonId: string, expectedVersion: number) => {
    requireVersion(expectedVersion);
    await workspaceTransaction(hackathonId, ctx, async (tx) => {
      const result = await tx.hackathon.updateMany({
        where: { id: hackathonId, version: expectedVersion + 1 },
        data: { status: "Archived" },
      });
      if (result.count !== 1) throw new ConcurrencyConflictError("This hackathon");
    }, { allowClosed: true });
    revalidatePath(`/hackathons/${hackathonId}`);
    revalidatePath(`/hackathons/${hackathonId}/settings`);
    revalidatePath("/hackathons");
    revalidatePath("/dashboard");
    return { archived: true };
  },
);
