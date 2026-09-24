"use server";

import { requireId, requireVersion, validationFailure, withAccess, workspaceTransaction } from "@/lib/actions/guard";
import { ConcurrencyConflictError, prisma } from "@/lib/db";
import { missingClosureRequirements, recommendNextEngagement } from "@/lib/domain/handoff";
import { toEffectiveEvaluation } from "@/lib/domain/evaluation";
import { gateFactsFromUseCase, matchesEvaluationSnapshot } from "@/lib/ai/provenance";
import { getMethodology } from "@/lib/methodology";
import { invalidateRunbookChecks } from "@/lib/runbook";
import { handoffDraft, initialProgressStage } from "@/lib/kanban";
import {
  handoffInputSchema,
  gateResultSchema,
  platformSchema,
  portfolioDecisionSchema,
  priorityBandSchema,
  type PortfolioDecision,
} from "@/lib/schemas";
import { revalidatePath } from "next/cache";

export const saveHandoff = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, useCaseId: string, raw: unknown, expectedVersion?: number | null) => {
    requireId(useCaseId, "useCaseId");
    if (expectedVersion !== null) requireVersion(expectedVersion);
    const parsed = handoffInputSchema.safeParse(raw);
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const input = parsed.data;

    const { nextMilestoneDate, cafSubmittedOn, progressStage, deliveryRoute, cafStatus, ...fields } = input;
    const data = {
      ...Object.fromEntries(Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, value?.trim() || null])),
      ...(nextMilestoneDate !== undefined ? { nextMilestoneDate: nextMilestoneDate ? new Date(nextMilestoneDate) : null } : {}),
      ...(cafSubmittedOn !== undefined ? { cafSubmittedOn: cafSubmittedOn ? new Date(cafSubmittedOn) : null } : {}),
      ...(progressStage !== undefined ? { progressStage } : {}),
      ...(deliveryRoute !== undefined ? { deliveryRoute } : {}),
      ...(cafStatus !== undefined ? { cafStatus } : {}),
    };

    const saved = await workspaceTransaction(hackathonId, ctx, async (tx) => {
      const useCase = await tx.useCase.findFirstOrThrow({ where: { id: useCaseId, hackathonId } });
      const current = await tx.handoff.findUnique({ where: { useCaseId } });
      if (expectedVersion === null ? current !== null : current?.version !== expectedVersion) {
        throw new ConcurrencyConflictError("This handoff");
      }
      const previous = handoffDraft(useCase, current);
      const effective = {
        ...previous,
        ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
      };
      const required: Record<string, string[]> = {};
      if (effective.progressStage === "InProduction") {
        if (!effective.businessOwner.trim()) required.businessOwner = ["Name the owner before recording a case as in production."];
        if (!effective.productionReference.trim()) required.productionReference = ["Record deployment evidence or a decision reference. Moving a card does not deploy anything."];
      }
      if (effective.cafStatus === "Submitted") {
        if (!effective.businessOwner.trim()) required.businessOwner = ["Name the owner responsible for the recorded CAF submission."];
        if (!effective.cafReference.trim()) required.cafReference = ["Record the actual CAF submission reference. This app does not submit to CAF."];
      }
      if (Object.keys(required).length) validationFailure(required);
      const workflowFields = ["progressStage", "deliveryRoute", "cafStatus", "cafReference", "cafSubmittedOn", "productionReference"] as const;
      const workflowChanged = workflowFields.some(field => input[field] !== undefined && input[field] !== previous[field]);
      const event = await tx.hackathon.findUniqueOrThrow({ where: { id: hackathonId }, select: { status: true } });
      if (event.status === "Closed") {
        if (useCase.status !== "Closed" || !current) {
          validationFailure({ portfolioDecision: ["Reopen the event to repair an incomplete exit package."] });
        }
        for (const field of ["whatWasBuilt", "demoOrBlocker", "businessOwner", "portfolioDecision"] as const) {
          if (input[field] !== undefined && (input[field]?.trim() || null) !== (current[field]?.trim() || null)) {
            validationFailure({ [field]: ["Reopen the event before changing its recorded demo, business owner or exit decision. Follow-up outcomes and next steps may still be updated."] });
          }
        }
      }
      if (useCase.status === "Closed" && missingClosureRequirements({ ...current, ...data }, getMethodology().handoff).length) {
        validationFailure({ portfolioDecision: ["A closed use case must retain a complete handoff."] });
      }
      let version: number;
      if (expectedVersion === null) {
        if (current) throw new ConcurrencyConflictError("This handoff");
        const created = await tx.handoff.create({ data: {
          useCaseId,
          businessOwner: effective.businessOwner.trim() || null,
          progressStage: initialProgressStage(useCase.status, effective.portfolioDecision),
          ...data,
          ...(workflowChanged ? { workflowUpdatedBy: ctx.userId, workflowUpdatedAt: new Date() } : {}),
        } });
        version = created.version;
      } else {
        const result = await tx.handoff.updateMany({
          where: { useCaseId, version: requireVersion(expectedVersion) },
          data: {
            ...data,
            ...(["InProduction"].includes(effective.progressStage) || effective.cafStatus === "Submitted"
              ? { businessOwner: effective.businessOwner.trim() || null } : {}),
            ...(workflowChanged ? { workflowUpdatedBy: ctx.userId, workflowUpdatedAt: new Date() } : {}),
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw new ConcurrencyConflictError("This handoff");
        version = requireVersion(expectedVersion) + 1;
      }
      const updated = await tx.useCase.update({ where: { id: useCaseId }, data: { version: { increment: 1 } } });
      if (event.status !== "Closed") await invalidateRunbookChecks(hackathonId, "Close", tx);
      return { version, useCaseVersion: updated.version };
    }, { allowClosed: true });

    revalidatePath(`/hackathons/${hackathonId}/handoff`);
    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    revalidatePath(`/hackathons/${hackathonId}/usecases/${useCaseId}`);
    revalidatePath(`/hackathons/${hackathonId}/runbook`);
    revalidatePath("/dashboard");
    return { saved: true, ...saved };
  },
);

/**
 * Suggests the follow-on engagement from the portfolio decision plus what the
 * evaluation already established (spec M6). The facilitator can always override
 * the suggestion — this only fills the field in.
 */
export const suggestNextEngagement = withAccess(
  "Viewer",
  async (
    _ctx,
    hackathonId: string,
    useCaseId: string,
    decision: PortfolioDecision,
  ) => {
    requireId(useCaseId, "useCaseId");
    const parsedDecision = portfolioDecisionSchema.safeParse(decision);
    if (!parsedDecision.success) validationFailure({ portfolioDecision: ["Choose a valid portfolio decision."] });
    const methodology = getMethodology();

    const useCase = await prisma.useCase.findFirstOrThrow({
      where: { id: useCaseId, hackathonId },
      include: {
        teamMembers: { include: { contact: true } },
        evaluations: {
          orderBy: { version: "desc" },
          take: 1,
          include: { override: true },
        },
      },
    });

    const latest = useCase.evaluations[0];
    const effective = latest ? toEffectiveEvaluation(latest, methodology.rubric) : null;
    const parsedPlatform = platformSchema.safeParse(effective?.recommendedPlatform);
    const parsedBand = priorityBandSchema.safeParse(effective?.priorityBand);
    const parsedGates = gateResultSchema.array().safeParse(effective?.gateResults);
    const currentEvaluation = matchesEvaluationSnapshot(
      latest?.useCaseSnapshot, useCase, gateFactsFromUseCase(useCase),
    );

    const result = recommendNextEngagement(
      {
        decision: parsedDecision.data,
        platform: parsedPlatform.success ? parsedPlatform.data : null,
        priorityBand: parsedBand.success ? parsedBand.data : null,
        gateResults: currentEvaluation && parsedGates.success ? parsedGates.data : [],
      },
      methodology.handoff,
    );

    return result;
  },
);

/** Closing requires a decision, an owner and a dated next milestone. */
export const closeUseCase = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, useCaseId: string, expectedVersion: number, expectedHandoffVersion: number) => {
    requireId(useCaseId, "useCaseId");
    requireVersion(expectedVersion);
    requireVersion(expectedHandoffVersion);
    const methodology = getMethodology();

    await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const useCase = await tx.useCase.findFirstOrThrow({ where: { id: useCaseId, hackathonId } });
    const handoff = await tx.handoff.findUnique({ where: { useCaseId } });
    if (useCase.version !== expectedVersion) throw new ConcurrencyConflictError("This use case");
    if (!handoff || handoff.version !== expectedHandoffVersion) throw new ConcurrencyConflictError("This handoff");
    const missing = missingClosureRequirements(handoff, methodology.handoff);

    if (missing.length > 0) {
      throw new Error(
        `Cannot close: ${missing.join(", ")} ${
          missing.length === 1 ? "is" : "are"
        } still required. Every case must leave with an owner and a dated next action.`,
      );
    }

    const result = await tx.useCase.updateMany({
      where: { id: useCaseId, hackathonId, version: expectedVersion },
      data: { status: "Closed", version: { increment: 1 } },
    });
    if (result.count !== 1) throw new ConcurrencyConflictError("This use case");
    });

    revalidatePath(`/hackathons/${hackathonId}/handoff`);
    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    revalidatePath(`/hackathons/${hackathonId}/usecases/${useCaseId}`);
    revalidatePath("/dashboard");
    return { closed: true };
  },
);
