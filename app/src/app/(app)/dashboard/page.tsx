import { BarChart, StackedBar } from "@/components/charts/bar-chart";
import { BubbleMatrix, type MatrixPoint } from "@/components/charts/bubble-matrix";
import { selectDashboardHackathon } from "@/components/layout/workspace-selection";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge, BAND_TONE, humanize, PLATFORM_TONE, STATUS_TONE } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, SectionLabel } from "@/components/ui/empty-state";
import { MiniStat, Stat } from "@/components/ui/stat";
import { requireUser } from "@/lib/auth";
import {
  getHackathon,
  listContacts,
  listHackathons,
  listUseCases,
  summarizePortfolio,
} from "@/lib/queries";
import { isRunbookItemComplete, missingRunbookChecks } from "@/lib/domain/runbook";
import { readRunbook } from "@/lib/runbook";
import { PLATFORM_LABELS, PROGRESS_LABELS, PROGRESS_STAGES, type Platform } from "@/lib/schemas";
import { toKanbanCase } from "@/lib/kanban";
import { formatDateShort } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarClock,
  Lightbulb,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ hackathon?: string | string[] }>;
}) {
  const user = await requireUser();
  const hackathons = await listHackathons(user.id);
  const { hackathon: selected } = await searchParams;
  const active = selectDashboardHackathon(hackathons, selected);
  if (selected !== undefined && !active) notFound();

  if (!active) {
    return (
      <Card>
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="No hackathons yet"
          description="Create a workspace to collect use cases, track delivery on the Kanban board and run the Copilot Studio fit evaluator."
          action={
            <LinkButton href="/hackathons/new" variant="primary">
              Create hackathon
            </LinkButton>
          }
        />
      </Card>
    );
  }

  const workspace = await getHackathon(user.id, active.id);
  if (!workspace) notFound();

  const [useCases, contacts, runbook] = await Promise.all([
    listUseCases(active.id),
    listContacts(active.id),
    readRunbook(active.id),
  ]);

  const summary = summarizePortfolio(useCases);
  const startChecks = missingRunbookChecks(runbook.items, runbook.template.version, "Start");
  const closeChecks = missingRunbookChecks(runbook.items, runbook.template.version, "Close");
  const completedChecks = runbook.items.filter((item) => isRunbookItemComplete(item, runbook.template.version)).length;

  const evaluated = useCases.filter((uc) => uc.evaluation && uc.evaluationIsCurrent);
  const points: MatrixPoint[] = evaluated.map((uc) => ({
    id: uc.id,
    code: uc.code,
    title: uc.title,
    value: uc.evaluation!.valueScore,
    feasibility: uc.evaluation!.feasibilityScore,
    reusability: uc.evaluation!.reusabilityScore,
    platform: uc.evaluation!.recommendedPlatform,
    href: `/hackathons/${active.id}/usecases/${uc.id}`,
  }));

  const ranked = [...evaluated].sort(
    (a, b) => b.evaluation!.weightedScore - a.evaluation!.weightedScore,
  );
  const topScore = ranked[0]?.evaluation?.weightedScore ?? 0;

  const chartData = ranked.slice(0, 8).map((uc) => ({
    label: uc.code.replace("UC-", ""),
    value: uc.evaluation!.weightedScore,
    highlight: uc.evaluation!.weightedScore === topScore,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const boardCases = useCases.map(toKanbanCase);
  const followUps = boardCases
    .filter((uc) => uc.handoff.nextMilestoneDate)
    .sort((a, b) => a.handoff.nextMilestoneDate.localeCompare(b.handoff.nextMilestoneDate));
  const overdue = followUps.filter((uc) => uc.handoff.nextMilestoneDate < today).length;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <form action="/dashboard" className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="dashboard-hackathon" className="mb-1 block text-sm font-medium text-ink">Workspace</label>
              <select id="dashboard-hackathon" name="hackathon" defaultValue={active.id} className="h-10 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-sm">
                {hackathons.map((h) => <option key={h.id} value={h.id}>{h.name} · {h.customer}</option>)}
              </select>
            </div>
            <button type="submit" className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-white">View dashboard</button>
          </form>
        </Card>
        <Card>
          <CardHeader
            title="Portfolio overview"
            subtitle="Current assessment evidence and operational delivery progress."
            action={
              <Badge tone={STATUS_TONE[active.status] ?? "neutral"}>
                {humanize(active.status)}
              </Badge>
            }
          />
          {summary.staleEvaluations > 0 ? (
            <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
              {summary.staleEvaluations} historical {summary.staleEvaluations === 1 ? "evaluation needs" : "evaluations need"} a fresh run.
              {" "}Changed or missing source evidence is excluded from live scores, rankings and qualification counts.
              {" "}<Link href={`/hackathons/${active.id}/usecases`} className="font-medium underline">Review use cases</Link>
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat
              highlight
              label="Use cases"
              value={summary.total}
              icon={<Lightbulb className="h-4 w-4" aria-hidden />}
              delta={
                summary.evaluated > 0
                  ? {
                      value: `${summary.evaluated} evaluated`,
                      direction: "up",
                    }
                  : undefined
              }
              caption={
                summary.total - summary.evaluated > 0
                  ? `${summary.total - summary.evaluated} still to evaluate`
                  : "All cases evaluated"
              }
            />
            <Stat
              label="Average score"
              value={summary.evaluated > 0 ? summary.averageScore.toFixed(1) : "—"}
              icon={<Target className="h-4 w-4" aria-hidden />}
              delta={
                summary.blocked > 0
                  ? { value: `${summary.blocked} blocked`, direction: "down" }
                  : summary.qualified > 0
                    ? { value: `${summary.qualified} qualified`, direction: "up" }
                    : undefined
              }
              caption="Weighted across value, feasibility, data and reuse"
            />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Qualified" value={summary.qualified} tone="accent" />
            <MiniStat
              label="Gate blocked"
              value={summary.blocked}
              tone={summary.blocked > 0 ? "danger" : "neutral"}
            />
            <MiniStat label="With owner" value={summary.withOwner} />
            <MiniStat label="Decided" value={summary.withDecision} />
          </div>

          {contacts.length > 0 ? (
            <div className="mt-6 border-t border-line pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {contacts.length} people in the stakeholder map
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {contacts.filter((c) => c.influence === "High").length} high
                    influence ·{" "}
                    {contacts.filter((c) => c.roleType === "Sponsor").length}{" "}
                    sponsor
                  </p>
                </div>
                <Link
                  href={`/hackathons/${active.id}/contacts`}
                  className="flex items-center gap-3"
                >
                  <AvatarStack names={contacts.map((c) => c.name)} max={6} />
                  <span className="text-xs font-medium text-ink underline underline-offset-2">
                    View all
                  </span>
                </Link>
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Delivery progress" subtitle="Operational stages, separate from assessment status"
            action={<LinkButton size="sm" href={`/hackathons/${active.id}/usecases`}>Open Kanban</LinkButton>} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PROGRESS_STAGES.map((stage) => <MiniStat key={stage} label={PROGRESS_LABELS[stage]}
              value={boardCases.filter((uc) => uc.handoff.progressStage === stage).length} />)}
          </div>
          <p className="mt-4 text-xs text-ink-soft">Pilot, production and CAF submission are explicitly recorded; a demo or closed assessment does not imply deployment.</p>
        </Card>

        <Card>
          <CardHeader
            title="Value / feasibility matrix"
            subtitle="Top-right is do-this-first. Bubble size is reusability."
            action={
              <LinkButton
                size="sm"
                href={`/hackathons/${active.id}/usecases`}
              >
                All use cases
              </LinkButton>
            }
          />
          {points.length > 0 ? (
            <>
              <BubbleMatrix points={points} />
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium text-ink">View matrix values</summary>
                <ul className="mt-2 space-y-2">
                  {points.map((p) => <li key={p.id} className="break-words">
                    <Link href={p.href} className="underline">{p.code} · {p.title}</Link>
                    <p className="text-xs text-ink-soft">Value {p.value}/5 · Feasibility {p.feasibility}/5 · Reuse {p.reusability}/5</p>
                  </li>)}
                </ul>
              </details>
            </>
          ) : (
            <EmptyState
              icon={<Target className="h-5 w-5" />}
              title="Nothing evaluated yet"
              description="Run the Copilot Studio fit evaluator on a use case to plot it here."
              action={
                <LinkButton
                  href={`/hackathons/${active.id}/usecases`}
                  variant="primary"
                  size="sm"
                >
                  Go to use cases
                </LinkButton>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Weighted score by use case"
            subtitle="Highest scoring case highlighted."
          />
          <BarChart
            data={chartData}
            emptyLabel="Evaluate a use case to see scores"
          />
          {ranked.length > 0 ? <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {ranked.slice(0, 8).map((uc) => <li key={uc.id} className="flex min-w-0 justify-between gap-2">
              <Link href={`/hackathons/${active.id}/usecases/${uc.id}`} className="min-w-0 truncate underline">{uc.code} · {uc.title}</Link>
              <span className="font-semibold tabular-nums">{uc.evaluation!.weightedScore.toFixed(1)}</span>
            </li>)}
          </ol> : null}
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader
            className="flex-wrap"
            title="Facilitator runbook"
            subtitle={`${completedChecks} of ${runbook.items.length} checks complete with current evidence`}
            action={<LinkButton size="sm" href={`/hackathons/${active.id}/runbook`}>Open runbook</LinkButton>}
          />
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Start checks remaining" value={startChecks.length} tone={startChecks.length ? "danger" : "accent"} />
            <MiniStat label="Close checks remaining" value={closeChecks.length} tone={closeChecks.length ? "danger" : "accent"} />
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            {startChecks.length
              ? "Complete required start checks before marking the event Ready or Running."
              : "Required start checks are complete."}
            {" "}
            {closeChecks.length
              ? "Event closure also requires the remaining close checks."
              : "Required close checks are complete."}
          </p>
          <p className="mt-3 text-xs text-ink-faint">Microsoft guidance, evidence and assigned owners are recorded in the runbook. Unconfirmed or outdated checks do not count as complete.</p>
        </Card>
        <Card>
          <CardHeader
            title="Priority bands"
            subtitle={`${summary.evaluated} of ${summary.total} evaluated`}
          />
          <StackedBar
            segments={[
              { label: "High", value: summary.byBand.High ?? 0, color: "#16a34a" },
              { label: "Medium", value: summary.byBand.Medium ?? 0, color: "#b45309" },
              { label: "Low", value: summary.byBand.Low ?? 0, color: "#dc2626" },
            ]}
          />
          <div className="mt-4 space-y-2">
            {(["High", "Medium", "Low"] as const).map((band) => (
              <div key={band} className="flex items-center justify-between text-sm">
                <Badge tone={BAND_TONE[band]}>{band}</Badge>
                <span className="font-semibold tabular-nums text-ink">
                  {summary.byBand[band] ?? 0}
                </span>
              </div>
            ))}
          </div>

          <SectionLabel className="mt-6 mb-3">Platform routing</SectionLabel>
          <div className="space-y-2">
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
              <div key={p} className="flex items-center justify-between text-sm">
                <Badge tone={PLATFORM_TONE[p]}>{PLATFORM_LABELS[p]}</Badge>
                <span className="font-semibold tabular-nums text-ink">
                  {summary.byPlatform[p] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Top priorities"
            subtitle="Ranked by weighted score"
          />
          {ranked.length === 0 ? (
            <p className="text-sm text-ink-faint">Nothing evaluated yet.</p>
          ) : (
            <ul className="space-y-1">
              {ranked.slice(0, 5).map((uc) => {
                const ev = uc.evaluation!;
                const blocked = ev.gateResults.some((g) => !g.pass);
                return (
                  <li key={uc.id}>
                    <Link
                      href={`/hackathons/${active.id}/usecases/${uc.id}`}
                      className="flex items-center gap-3 rounded-[var(--radius-inner)] border border-transparent px-2 py-2.5 transition-colors hover:border-line hover:bg-surface-muted"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-sunken text-xs font-semibold text-ink-soft">
                        {uc.code.replace("UC-", "")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {uc.title}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone={PLATFORM_TONE[ev.recommendedPlatform]}>
                            {PLATFORM_LABELS[ev.recommendedPlatform]}
                          </Badge>
                          {blocked ? (
                            <Badge
                              tone="danger"
                              icon={<AlertTriangle className="h-3 w-3" />}
                            >
                              Gate
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {ev.weightedScore.toFixed(1)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {summary.failedGateCounts.length > 0 ? (
          <Card>
            <CardHeader
              title="Blocking gates"
              subtitle="Resolve, defer or re-scope before the event"
            />
            <ul className="space-y-2.5">
              {summary.failedGateCounts.slice(0, 5).map((g) => (
                <li key={g.gate} className="flex items-start justify-between gap-3">
                  <span className="text-sm text-ink-soft">{g.label}</span>
                  <Badge tone="danger">{g.count}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Follow-up actions"
            subtitle={
              overdue > 0 ? `${overdue} overdue` : "Nothing overdue"
            }
            action={
              <LinkButton size="sm" href={`/hackathons/${active.id}/handoff`}>
                Handoff
              </LinkButton>
            }
          />
          {followUps.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="No follow-up dates set"
              description="Record the next action, owner and follow-up date for each use case."
              action={
                <LinkButton
                  href={`/hackathons/${active.id}/handoff`}
                  variant="primary"
                  size="sm"
                >
                  Review handoffs
                </LinkButton>
              }
            />
          ) : (
            <ul className="space-y-1">
              {followUps.slice(0, 5).map((uc) => {
                const isOverdue = uc.handoff.nextMilestoneDate < today;
                return (
                  <li
                    key={uc.id}
                    className="flex items-center gap-3 rounded-[var(--radius-inner)] px-2 py-2"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isOverdue
                          ? "bg-danger-soft text-danger"
                          : "bg-sunken text-ink-faint"
                      }`}
                    >
                      <CalendarClock className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/hackathons/${active.id}/usecases?case=${encodeURIComponent(uc.id)}`} className="block truncate text-sm font-medium text-ink underline">
                        {uc.code} · {uc.handoff.nextMilestone || "Define next action"}
                      </Link>
                      <span className="text-xs text-ink-faint">
                        {uc.handoff.deliveryOwner || uc.handoff.businessOwner || "No owner"} · {formatDateShort(uc.handoff.nextMilestoneDate)}
                      </span>
                    </span>
                    {isOverdue ? <Badge tone="danger">Late</Badge> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Team" subtitle="Workspace members" />
          <ul className="space-y-2">
            {active.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Users className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {m.user.name}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">
                      {m.user.email}
                    </span>
                  </span>
                </span>
                <Badge tone={m.role === "Owner" ? "accent" : "neutral"}>
                  {m.role}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
