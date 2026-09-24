"use client";

import { HandoffDrawer, HandoffWorkspaceNotice, MissingHandoffCase, useHandoffPanel } from "@/components/handoff-drawer";
import { HandoffCaseBadges } from "@/components/kanban-board";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { KanbanCase } from "@/lib/kanban";
import { DELIVERY_LABELS, portfolioDecisionSchema, PORTFOLIO_DECISION_LABELS, PROGRESS_LABELS } from "@/lib/schemas";
import { Route } from "lucide-react";
import Link from "next/link";

export function HandoffBoard({ hackathonId, eventStatus, cases, editable }: {
  hackathonId: string;
  eventStatus: string;
  cases: KanbanCase[];
  editable: boolean;
}) {
  const panel = useHandoffPanel();
  const selected = cases.find((useCase) => useCase.id === panel.selectedId);
  const decided = cases.filter((useCase) => portfolioDecisionSchema.safeParse(useCase.handoff.portfolioDecision).success).length;
  const withOwner = cases.filter((useCase) => useCase.handoff.businessOwner.trim()).length;
  const withNext = cases.filter((useCase) => useCase.handoff.nextMilestone.trim() && useCase.handoff.nextMilestoneDate).length;
  const complete = cases.filter((useCase) => useCase.handoffVersion !== null &&
    portfolioDecisionSchema.safeParse(useCase.handoff.portfolioDecision).success &&
    useCase.handoff.businessOwner.trim() && useCase.handoff.nextMilestone.trim() && useCase.handoff.nextMilestoneDate).length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Handoff overview</h2>
            <p className="mt-1 text-sm text-ink-soft">A decision, named owner and dated next action for every case. These are the same records as the board, not duplicate exit packages.</p>
          </div>
          <LinkButton size="sm" href={`/hackathons/${hackathonId}/usecases?group=${panel.group}`}>Open board</LinkButton>
        </header>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Progress label="Complete exit packages" value={complete} total={cases.length} />
          <Progress label="Decided" value={decided} total={cases.length} />
          <Progress label="Owner named" value={withOwner} total={cases.length} />
          <Progress label="Dated next action" value={withNext} total={cases.length} />
        </div>
        <p className="mt-4 text-xs text-ink-soft">Production and CAF submission are human-reported external activities with evidence. This app never deploys or submits on your behalf.</p>
        <div className="mt-3"><HandoffWorkspaceNotice hackathonId={hackathonId} eventStatus={eventStatus} editable={editable} /></div>
      </Card>
      {panel.selectedId !== null && !selected ? <MissingHandoffCase onClear={panel.closePanel} /> : null}
      {cases.length === 0 ? <Card><EmptyState icon={<Route className="h-5 w-5" />}
        title="No use cases to hand off" description="Add use cases first. Each should leave the event with an owner and a dated next action." /></Card> : null}
      <ul className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        {cases.map((useCase) => {
          const decision = portfolioDecisionSchema.safeParse(useCase.handoff.portfolioDecision);
          return <li key={useCase.id} className="min-w-0">
            <Card className="h-full min-w-0">
              <button type="button" id={`handoff-trigger-${useCase.id}`} aria-haspopup="dialog"
                aria-label={`Open handoff for ${useCase.code}: ${useCase.title}`}
                onClick={() => panel.openCase(useCase.id)}
                className="w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                <span className="text-xs font-medium text-ink-faint">{useCase.code}</span>
                <span className="mt-1 block break-words text-sm font-semibold text-ink">{useCase.title}</span>
                <span className="mt-2 block text-xs text-ink-soft">Open shared handoff →</span>
              </button>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="info">{PROGRESS_LABELS[useCase.handoff.progressStage]}</Badge>
                <Badge tone="neutral">{DELIVERY_LABELS[useCase.handoff.deliveryRoute]}</Badge>
                <Badge tone={decision.success ? "accent" : "warn"}>
                  {decision.success ? PORTFOLIO_DECISION_LABELS[decision.data] : "No decision"}
                </Badge>
                <HandoffCaseBadges useCase={useCase} />
              </div>
              <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-ink-faint">Business owner</dt>
                  <dd className="mt-1 break-words text-ink">{useCase.handoff.businessOwner.trim() || "Owner needed"}</dd></div>
                <div><dt className="text-xs text-ink-faint">Next action</dt>
                  <dd className="mt-1 break-words text-ink">{useCase.handoff.nextMilestone.trim() || "Not recorded"}</dd>
                  <dd className="mt-0.5 text-xs text-ink-soft">{useCase.handoff.nextMilestoneDate || "No date set"}</dd></div>
              </dl>
              <Link href={`/hackathons/${hackathonId}/usecases?case=${encodeURIComponent(useCase.id)}&group=${panel.group}`}
                className="mt-4 inline-block text-sm text-ink-soft underline" aria-label={`Open ${useCase.code} on board`}>
                Open on board
              </Link>
            </Card>
          </li>;
        })}
      </ul>
      {selected ? <HandoffDrawer key={selected.id} hackathonId={hackathonId} useCase={selected} eventStatus={eventStatus}
        editable={editable} group={panel.group} view="overview" onClose={panel.closePanel} /> : null}
    </div>
  );
}

function Progress({ label, value, total }: { label: string; value: number; total: number }) {
  return <div className="rounded-xl border border-line bg-surface-muted px-4 py-3">
    <p className="text-xs font-medium text-ink-soft">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}<span className="text-base font-normal text-ink-faint">/{total}</span></p>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
      <div className="h-full bg-accent" style={{ width: `${total ? Math.round(value / total * 100) : 0}%` }} />
    </div>
  </div>;
}
