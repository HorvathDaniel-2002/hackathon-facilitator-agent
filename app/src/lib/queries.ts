import { parseJsonField, prisma } from "@/lib/db";
import { toEffectiveEvaluation } from "@/lib/domain/evaluation";
import { getMethodology } from "@/lib/methodology";
import { AccessDeniedError, assertAccess, requireUser } from "@/lib/auth";
import { gateFactsFromUseCase, matchesEvaluationSnapshot } from "@/lib/ai/provenance";
import { MEMBERSHIP_ROLES, type GateResult } from "@/lib/schemas";

/**
 * Shared read queries.
 *
 * Each read resolves the current identity and verifies workspace membership.
 * A caller-provided user ID is never accepted as proof of identity.
 */

export async function listHackathons(userId: string) {
  await requireIdentity(userId);
  return prisma.hackathon.findMany({
    where: { memberships: { some: { userId, role: { in: [...MEMBERSHIP_ROLES] } } } },
    orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { useCases: true, contacts: true } },
      memberships: { include: { user: { select: publicUserFields } } },
    },
  });
}

export async function getHackathon(userId: string, hackathonId: string) {
  await requireIdentity(userId);
  try {
    await assertAccess(userId, hackathonId);
  } catch (error) {
    if (error instanceof AccessDeniedError) return null;
    throw error;
  }
  return prisma.hackathon.findFirst({
    where: { id: hackathonId, memberships: { some: { userId } } },
    include: {
      memberships: { include: { user: { select: publicUserFields } }, orderBy: { createdAt: "asc" } },
      _count: { select: { useCases: true, contacts: true } },
    },
  });
}

/** Use cases with their latest evaluation already merged with any override. */
export async function listUseCases(hackathonId: string) {
  await requireWorkspace(hackathonId);
  const methodology = getMethodology();

  const useCases = await prisma.useCase.findMany({
    where: { hackathonId },
    orderBy: { code: "asc" },
    include: {
      evaluations: {
        orderBy: { version: "desc" },
        take: 1,
        include: { override: true },
      },
      handoff: true,
      teamMembers: { where: { contact: { hackathonId } }, include: { contact: true } },
      _count: { select: { buildGuides: true, evaluations: true } },
    },
  });

  return useCases.map((uc) => {
    const latest = uc.evaluations[0];
    return {
      ...uc,
      evaluationIsCurrent: Boolean(latest && matchesEvaluationSnapshot(
        latest.useCaseSnapshot, uc, gateFactsFromUseCase(uc),
      )),
      evaluation: latest
        ? toEffectiveEvaluation(latest, methodology.rubric)
        : null,
    };
  });
}

export async function getUseCase(hackathonId: string, useCaseId: string) {
  await requireWorkspace(hackathonId);
  const methodology = getMethodology();

  const useCase = await prisma.useCase.findFirst({
    where: { id: useCaseId, hackathonId },
    include: {
      evaluations: {
        orderBy: { version: "desc" },
        include: { override: true },
      },
      buildGuides: { orderBy: { version: "desc" } },
      handoff: true,
      teamMembers: { where: { contact: { hackathonId } }, include: { contact: true } },
    },
  });

  if (!useCase) return null;

  return {
    ...useCase,
    evaluationIsCurrent: Boolean(useCase.evaluations[0] && matchesEvaluationSnapshot(
      useCase.evaluations[0].useCaseSnapshot, useCase, gateFactsFromUseCase(useCase),
    )),
    evaluation: useCase.evaluations[0]
      ? toEffectiveEvaluation(useCase.evaluations[0], methodology.rubric)
      : null,
    // Full history so the UI can show what changed between re-evaluations.
    evaluationHistory: useCase.evaluations.map((e) =>
      toEffectiveEvaluation(e, methodology.rubric),
    ),
  };
}

export async function listContacts(hackathonId: string) {
  await requireWorkspace(hackathonId);
  return prisma.contact.findMany({
    where: { hackathonId },
    orderBy: [{ roleType: "asc" }, { name: "asc" }],
    include: {
      teamMembers: { where: { useCase: { hackathonId } }, include: { useCase: { select: { id: true, code: true, title: true } } } },
    },
  });
}


export interface PortfolioSummary {
  total: number;
  byBand: Record<string, number>;
  byPlatform: Record<string, number>;
  byStatus: Record<string, number>;
  evaluated: number;
  staleEvaluations: number;
  qualified: number;
  blocked: number;
  withOwner: number;
  withDecision: number;
  averageScore: number;
  failedGateCounts: Array<{ gate: string; label: string; count: number }>;
}

/** Rollup powering the dashboard tiles and the readiness checklist. */
export function summarizePortfolio(
  useCases: Awaited<ReturnType<typeof listUseCases>>,
): PortfolioSummary {
  const byBand: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
  const byPlatform: Record<string, number> = {
    CopilotStudio: 0,
    AzureAI: 0,
    Hybrid: 0,
  };
  const byStatus: Record<string, number> = {};
  const gateFailures = new Map<string, { label: string; count: number }>();

  let evaluated = 0;
  let staleEvaluations = 0;
  let qualified = 0;
  let blocked = 0;
  let withOwner = 0;
  let withDecision = 0;
  let scoreSum = 0;

  for (const uc of useCases) {
    byStatus[uc.status] = (byStatus[uc.status] ?? 0) + 1;

    if ((uc.handoff ? uc.handoff.businessOwner : uc.businessOwner)?.trim()) withOwner++;
    if (uc.handoff?.portfolioDecision) withDecision++;

    const ev = uc.evaluation;
    if (!ev) continue;
    if (!uc.evaluationIsCurrent) {
      staleEvaluations++;
      continue;
    }

    evaluated++;
    scoreSum += ev.weightedScore;
    byBand[ev.priorityBand] = (byBand[ev.priorityBand] ?? 0) + 1;
    byPlatform[ev.recommendedPlatform] =
      (byPlatform[ev.recommendedPlatform] ?? 0) + 1;

    const failed = ev.gateResults.filter((g) => !g.pass);
    if (failed.length === 0) qualified++;
    else blocked++;

    for (const g of failed) {
      const entry = gateFailures.get(g.gate) ?? { label: g.label, count: 0 };
      entry.count++;
      gateFailures.set(g.gate, entry);
    }
  }

  return {
    total: useCases.length,
    byBand,
    byPlatform,
    byStatus,
    evaluated,
    staleEvaluations,
    qualified,
    blocked,
    withOwner,
    withDecision,
    averageScore: evaluated > 0 ? Math.round((scoreSum / evaluated) * 10) / 10 : 0,
    failedGateCounts: Array.from(gateFailures.entries())
      .map(([gate, v]) => ({ gate, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Flattened index for the top-bar command search. */
export async function buildSearchIndex(userId: string) {
  await requireIdentity(userId);
  const hackathons = await prisma.hackathon.findMany({
    where: { memberships: { some: { userId, role: { in: [...MEMBERSHIP_ROLES] } } } },
    include: {
      useCases: { select: { id: true, code: true, title: true, status: true } },
      contacts: { select: { id: true, name: true, roleType: true, org: true } },
    },
  });

  const items: Array<{
    id: string;
    label: string;
    sublabel: string;
    href: string;
    group: string;
  }> = [];

  for (const h of hackathons) {
    items.push({
      id: `h-${h.id}`,
      label: h.name,
      sublabel: h.customer,
      href: `/hackathons/${h.id}/usecases`,
      group: "Hackathon",
    });

    for (const uc of h.useCases) {
      items.push({
        id: `u-${uc.id}`,
        label: `${uc.code} · ${uc.title}`,
        sublabel: `${h.customer} · ${uc.status}`,
        href: `/hackathons/${h.id}/usecases/${uc.id}`,
        group: "Use case",
      });
    }

    for (const c of h.contacts) {
      items.push({
        id: `c-${c.id}`,
        label: c.name,
        sublabel: `${c.roleType}${c.org ? ` · ${c.org}` : ""}`,
        href: `/hackathons/${h.id}/contacts`,
        group: "Contact",
      });
    }
  }

  return items;
}

export function gateResultsOf(raw: string | null | undefined): GateResult[] {
  return parseJsonField<GateResult[]>(raw, []);
}

const publicUserFields = { id: true, name: true, email: true } as const;

async function requireIdentity(userId: string) {
  const user = await requireUser();
  if (user.id !== userId) throw new AccessDeniedError();
  return user;
}

async function requireWorkspace(hackathonId: string) {
  const user = await requireUser();
  await assertAccess(user.id, hackathonId);
}
