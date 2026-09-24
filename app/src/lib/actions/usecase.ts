"use server";

import { requireId, requireVersion, validationFailure, withAccess, workspaceTransaction } from "@/lib/actions/guard";
import { ConcurrencyConflictError } from "@/lib/db";
import { gateFactsFromUseCase, matchesEvaluationSnapshot } from "@/lib/ai/provenance";
import { readEvaluationGates } from "@/lib/domain/evaluation";
import { isQualified } from "@/lib/domain/gates";
import { teamMemberInputSchema, useCaseInputSchema, useCaseUpdateInputSchema } from "@/lib/schemas";
import { invalidateRunbookChecks } from "@/lib/runbook";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

/** Next free UC-## code for a hackathon. */
async function nextCode(tx: Prisma.TransactionClient, hackathonId: string): Promise<string> {
  const existing = await tx.useCase.findMany({
    where: { hackathonId },
    select: { code: true },
  });

  const max = existing.reduce((acc, uc) => {
    const n = /^UC-\d+$/.test(uc.code) ? Number(uc.code.slice(3)) : NaN;
    return Number.isSafeInteger(n) ? Math.max(acc, n) : acc;
  }, 0);

  if (max >= Number.MAX_SAFE_INTEGER) throw new Error("Use-case numbering is exhausted.");
  return `UC-${String(max + 1).padStart(2, "0")}`;
}

export const createUseCase = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, raw: unknown) => {
    const parsed = useCaseInputSchema.safeParse(raw);
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    if (input.status !== "Draft" && input.status !== "Parked") {
      validationFailure({ status: ["New use cases must start as Draft or Parked."] });
    }

    const useCase = await workspaceTransaction(hackathonId, ctx, async (tx) => {
      return tx.useCase.create({
      data: {
        hackathonId,
        code: await nextCode(tx, hackathonId),
        title: input.title,
        description: input.description || null,
        businessOwner: input.businessOwner || null,
        targetUser: input.targetUser || null,
        currentProcess: input.currentProcess || null,
        painPoints: input.painPoints || null,
        desiredOutcome: input.desiredOutcome || null,
        dataSources: input.dataSources || null,
        ...(input.sampleDataApproved !== undefined ? { sampleDataApproved: input.sampleDataApproved } : {}),
        ...(input.processOwnerConfirmed !== undefined ? { processOwnerConfirmed: input.processOwnerConfirmed } : {}),
        systemsConnectors: input.systemsConnectors || null,
        agentOutput: input.agentOutput || null,
        humanApprovalPoint: input.humanApprovalPoint || null,
        successMetric: input.successMetric || null,
        constraints: input.constraints || null,
        reusePotential: input.reusePotential || null,
        smallestSlice: input.smallestSlice || null,
        productionVision: input.productionVision || null,
        manualImpact: input.manualImpact || null,
        status: input.status,
      },
      });
    });

    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    revalidatePath("/dashboard");
    return { id: useCase.id, code: useCase.code };
  },
);

export const updateUseCase = withAccess(
  "Contributor",
  async (
    ctx,
    hackathonId: string,
    useCaseId: string,
    raw: unknown,
    expectedVersion: number,
  ) => {
    requireId(useCaseId, "useCaseId");
    requireVersion(expectedVersion);
    const parsed = useCaseUpdateInputSchema.safeParse(raw);
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const current = await tx.useCase.findFirstOrThrow({
      where: { id: useCaseId, hackathonId }, include: { teamMembers: { include: { contact: true } } },
    });
    if (current.version !== expectedVersion) throw new ConcurrencyConflictError("This use case");
    if (current.status === "Closed" && input.status !== "Draft" && input.status !== "Parked") {
      validationFailure({ status: ["Reopen the use case as Draft or Parked before changing its scope."] });
    }
    if (input.status === "Closed" && current.status !== "Closed") {
      validationFailure({ status: ["Complete the handoff and use Close to close this use case."] });
    }
    if (input.status === "Qualified" && current.status !== "Qualified") {
      validationFailure({ status: ["Evaluate the use case successfully to qualify it."] });
    }
    const changes = Object.fromEntries(
      Object.entries(input)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, value === "" ? null : value]),
    );
    if (input.dataSources !== undefined && (input.dataSources || null) !== current.dataSources &&
      input.sampleDataApproved !== true) {
      changes.sampleDataApproved = false;
    }
    if (input.businessOwner !== undefined && (input.businessOwner || null) !== current.businessOwner &&
      input.processOwnerConfirmed !== true) {
      changes.processOwnerConfirmed = false;
    }
    if (input.status && input.status !== current.status && ["Selected", "Building", "Demoed"].includes(input.status)) {
      const latest = await tx.evaluation.findFirst({ where: { useCaseId }, orderBy: { version: "desc" } });
      const candidate = { ...current, ...changes };
      if (!latest || !isQualified(readEvaluationGates(latest.gateResults)) ||
        !matchesEvaluationSnapshot(latest.useCaseSnapshot, candidate, gateFactsFromUseCase(candidate))) {
        validationFailure({ status: ["A current evaluation with all hard gates passing is required before selecting or building this case."] });
      }
    }

    // Scope the update by hackathonId too: the access check was made against the
    // hackathon, so the row must actually belong to it.
    const result = await tx.useCase.updateMany({
      where: { id: useCaseId, hackathonId, version: expectedVersion },
      data: {
        ...changes,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) throw new ConcurrencyConflictError("This use case");
    const scopeChanged = Object.entries(changes).some(([key, value]) =>
      key !== "status" && current[key as keyof typeof current] !== value);
    if (scopeChanged) await invalidateRunbookChecks(hackathonId, "All", tx);
    else if (current.status === "Closed") await invalidateRunbookChecks(hackathonId, "Close", tx);
    else if (input.status && input.status !== current.status &&
      (input.status === "Selected" || ["Selected", "Building", "Demoed"].includes(current.status) && ["Draft", "Parked"].includes(input.status))) {
      await invalidateRunbookChecks(hackathonId, "Start", tx);
    }
    });

    revalidatePath(`/hackathons/${hackathonId}/usecases/${useCaseId}`);
    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    revalidatePath(`/hackathons/${hackathonId}/runbook`);
    revalidatePath("/dashboard");
    return { updated: true };
  },
);

export const deleteUseCase = withAccess(
  "Owner",
  async (ctx, hackathonId: string, useCaseId: string, expectedVersion: number) => {
    requireId(useCaseId, "useCaseId");
    requireVersion(expectedVersion);
    await workspaceTransaction(hackathonId, ctx, async (tx) => {
      const result = await tx.useCase.deleteMany({ where: { id: useCaseId, hackathonId, version: expectedVersion } });
      if (result.count !== 1) throw new ConcurrencyConflictError("This use case");
      await invalidateRunbookChecks(hackathonId, "All", tx);
    });
    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    revalidatePath(`/hackathons/${hackathonId}/runbook`);
    revalidatePath("/dashboard");
    return { deleted: true };
  },
);

/** Duplicate / re-scope — spec M2. */
export const duplicateUseCase = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, useCaseId: string) => {
    requireId(useCaseId, "useCaseId");
    const copy = await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const source = await tx.useCase.findFirstOrThrow({
      where: { id: useCaseId, hackathonId },
    });

    return tx.useCase.create({
      data: {
        hackathonId,
        code: await nextCode(tx, hackathonId),
        title: `${source.title} (re-scoped)`,
        description: source.description,
        businessOwner: source.businessOwner,
        targetUser: source.targetUser,
        currentProcess: source.currentProcess,
        painPoints: source.painPoints,
        desiredOutcome: source.desiredOutcome,
        dataSources: source.dataSources,
        systemsConnectors: source.systemsConnectors,
        agentOutput: source.agentOutput,
        humanApprovalPoint: source.humanApprovalPoint,
        successMetric: source.successMetric,
        constraints: source.constraints,
        reusePotential: source.reusePotential,
        smallestSlice: source.smallestSlice,
        productionVision: source.productionVision,
        manualImpact: source.manualImpact,
        // A re-scoped copy starts fresh — the original's evaluation does not apply.
        status: "Draft",
      },
    });
    });

    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    return { id: copy.id, code: copy.code };
  },
);

export const assignTeamMember = withAccess(
  "Contributor",
  async (
    ctx,
    hackathonId: string,
    useCaseId: string,
    contactId: string,
    party: string,
    responsibility: string,
    expectedVersion: number,
  ) => {
    requireVersion(expectedVersion);
    const parsed = teamMemberInputSchema.safeParse({ useCaseId, contactId, party, responsibility });
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const useCase = await tx.useCase.findFirstOrThrow({ where: { id: useCaseId, hackathonId } });
    if (useCase.version !== expectedVersion) throw new ConcurrencyConflictError("This use case");
    if (useCase.status === "Closed") validationFailure({ status: ["Reopen the use case before changing its team."] });
    const contact = await tx.contact.findFirstOrThrow({ where: { id: contactId, hackathonId } });
    const existing = await tx.teamMember.findUnique({ where: { useCaseId_contactId: { useCaseId, contactId } } });
    await tx.teamMember.upsert({
      where: { useCaseId_contactId: { useCaseId, contactId } },
      update: { party: input.party, responsibility: input.responsibility || null },
      create: { useCaseId, contactId, party: input.party, responsibility: input.responsibility || null },
    });
    const result = await tx.useCase.updateMany({
      where: { id: useCaseId, hackathonId, version: expectedVersion },
      data: {
        version: { increment: 1 },
        ...(!existing && ["BusinessOwner", "Sponsor"].includes(contact.roleType) ? { processOwnerConfirmed: false } : {}),
      },
    });
    if (result.count !== 1) throw new ConcurrencyConflictError("This use case");
    if (!existing || existing.party !== input.party || existing.responsibility !== (input.responsibility || null)) {
      await invalidateRunbookChecks(hackathonId, "All", tx);
    }
    });

    revalidatePath(`/hackathons/${hackathonId}/usecases/${useCaseId}`);
    revalidatePath(`/hackathons/${hackathonId}/runbook`);
    return { assigned: true, version: expectedVersion + 1 };
  },
);

export const removeTeamMember = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, useCaseId: string, contactId: string, expectedVersion: number) => {
    requireId(useCaseId, "useCaseId");
    requireId(contactId, "contactId");
    requireVersion(expectedVersion);
    await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const useCase = await tx.useCase.findFirstOrThrow({ where: { id: useCaseId, hackathonId } });
    if (useCase.version !== expectedVersion) throw new ConcurrencyConflictError("This use case");
    if (useCase.status === "Closed") validationFailure({ status: ["Reopen the use case before changing its team."] });
    const target = await tx.teamMember.findUnique({
      where: { useCaseId_contactId: { useCaseId, contactId } }, include: { contact: true },
    });
    const result = await tx.teamMember.deleteMany({ where: { useCaseId, contactId } });
    if (result.count !== 1) throw new ConcurrencyConflictError("This team assignment");
    const updated = await tx.useCase.updateMany({
      where: { id: useCaseId, hackathonId, version: expectedVersion },
      data: {
        version: { increment: 1 },
        ...(target && ["BusinessOwner", "Sponsor"].includes(target.contact.roleType) ? { processOwnerConfirmed: false } : {}),
      },
    });
    if (updated.count !== 1) throw new ConcurrencyConflictError("This use case");
    await invalidateRunbookChecks(hackathonId, "All", tx);
    });
    revalidatePath(`/hackathons/${hackathonId}/usecases/${useCaseId}`);
    revalidatePath(`/hackathons/${hackathonId}/runbook`);
    return { removed: true, version: expectedVersion + 1 };
  },
);
