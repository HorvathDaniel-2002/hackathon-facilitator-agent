"use client";

import { ActionFeedback } from "@/components/action-feedback";
import {
  canUpdateHandoff, HandoffDrawer, HandoffWorkspaceNotice, MissingHandoffCase, useHandoffPanel,
} from "@/components/handoff-drawer";
import { Badge, humanize } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { useActionTransition } from "@/components/use-action-transition";
import type { ActionError } from "@/lib/actions/guard";
import { saveHandoff } from "@/lib/actions/handoff";
import type { KanbanCase } from "@/lib/kanban";
import {
  DELIVERY_LABELS, DELIVERY_ROUTES, PROGRESS_LABELS, PROGRESS_STAGES,
  type DeliveryRoute, type ProgressStage,
} from "@/lib/schemas";
import { GripVertical, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function KanbanBoard({ hackathonId, eventStatus, cases, editable }: {
  hackathonId: string;
  eventStatus: string;
  cases: KanbanCase[];
  editable: boolean;
}) {
  const panel = useHandoffPanel();
  const [error, setError] = useState<ActionError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pending, start] = useActionTransition(setError);
  const router = useRouter();
  const selected = cases.find((useCase) => useCase.id === panel.selectedId);
  const columns = panel.group === "route"
    ? DELIVERY_ROUTES.map((route) => ({ key: route, label: DELIVERY_LABELS[route] }))
    : PROGRESS_STAGES.map((stage) => ({ key: stage, label: PROGRESS_LABELS[stage] }));

  function changeWorkflow(useCase: KanbanCase, change: { progressStage?: ProgressStage; deliveryRoute?: DeliveryRoute }) {
    if (pending || !editable || !canUpdateHandoff(eventStatus, useCase)) return;
    if (change.progressStage === useCase.handoff.progressStage || change.deliveryRoute === useCase.handoff.deliveryRoute) return;
    setError(null);
    setNotice(null);
    if (change.progressStage === "InProduction" &&
      (!useCase.handoff.businessOwner.trim() || !useCase.handoff.productionReference.trim())) {
      panel.openCase(useCase.id, "InProduction");
      return;
    }
    start(async () => {
      const input = useCase.handoffVersion === null
        ? { businessOwner: useCase.handoff.businessOwner, ...change }
        : change;
      const result = await saveHandoff(hackathonId, useCase.id, input, useCase.handoffVersion);
      if (!result.ok) { setError(result); return; }
      setNotice(`${useCase.code}: ${change.progressStage
        ? `progress recorded as ${PROGRESS_LABELS[change.progressStage]}`
        : `delivery route set to ${DELIVERY_LABELS[change.deliveryRoute!]}`}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 xl:h-full xl:min-h-0">
      <Card padded={false} className="shrink-0 p-3 sm:p-4">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-48">
            <h2 className="text-base font-semibold text-ink">Use case board</h2>
            <p className="mt-0.5 text-xs text-ink-soft">{cases.length} use cases · shared handoff records</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label htmlFor="kanban-group" className="text-xs font-medium text-ink-soft">Group by</label>
            <Select id="kanban-group" value={panel.group} onChange={(event) => panel.setGroup(event.target.value)}
              disabled={pending} className="w-36 py-1.5 pl-2.5 text-xs">
              <option value="progress">Progress</option>
              <option value="route">Delivery route</option>
            </Select>
            <LinkButton size="sm" href={`/hackathons/${hackathonId}/handoff?group=${panel.group}`}>Handoff overview</LinkButton>
          </div>
        </header>
        <p id="kanban-help" className="mt-2 text-xs text-ink-soft">
          All {columns.length} {panel.group === "route" ? "delivery routes" : "stages"} are shown.
          {" "}<span className="xl:hidden">Scroll down for more columns. </span>
          Open a card for its handoff, or expand Move / route to update it.
        </p>
        <details className="mt-1 text-xs text-ink-soft">
          <summary className="w-fit cursor-pointer rounded font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">How this board works</summary>
          <div className="mt-2 max-w-4xl space-y-2 leading-relaxed">
            <p>Drag cards between columns, use their stage and route selectors, or open the shared handoff.
              Progress is separate from qualification; delivery routes are manual classifications, not AI recommendations.</p>
            <p>Pilot and In production report external activity. This app never deploys or submits to CAF.
              Production and recorded CAF submissions require a named business owner and evidence or a reference.</p>
          </div>
        </details>
        {!editable || ["Closed", "Archived"].includes(eventStatus) ? <div className="mt-2">
          <HandoffWorkspaceNotice hackathonId={hackathonId} eventStatus={eventStatus} editable={editable} />
        </div> : null}
      </Card>
      {panel.selectedId !== null && !selected ? <MissingHandoffCase onClear={panel.closePanel} /> : null}
      <div aria-live="polite" aria-atomic="true" className={pending || notice ? undefined : "sr-only"}>
        {pending ? <p className="text-sm text-ink-soft">Confirming saved workflow…</p> :
          notice ? <p className="text-sm text-accent">{notice}</p> : null}
      </div>
      <ActionFeedback error={error} onRefresh={() => { setError(null); router.refresh(); }}
        refreshHint="No card changes were applied here. Load the current board before trying again." />
      {cases.length === 0 ? <Card><EmptyState icon={<Lightbulb className="h-5 w-5" />}
        title="No use cases yet" description="Collect structured use cases, then track their progress, ownership and next action here." /></Card> : null}
      <div role="region" aria-label={`Kanban board grouped by ${panel.group === "route" ? "delivery route" : "progress"}`}
        aria-describedby="kanban-help" className="min-w-0 max-w-full xl:min-h-0 xl:flex-1">
        <div className={`grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-2 md:grid-cols-3 xl:h-full xl:min-h-0 xl:items-stretch xl:gap-2 ${
          panel.group === "route" ? "xl:grid-cols-5" : "xl:grid-cols-6"
        }`}>
          {columns.map((column) => {
            const items = cases.filter((useCase) => (panel.group === "route" ? useCase.handoff.deliveryRoute : useCase.handoff.progressStage) === column.key);
            return <section key={column.key} aria-label={`${column.label} column`}
              onDragOver={(event) => {
                if (draggingId && !pending) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(column.key); }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("application/x-hackathon-usecase");
                const useCase = cases.find((item) => item.id === id);
                if (useCase && draggingId === id) changeWorkflow(useCase, panel.group === "route"
                  ? { deliveryRoute: column.key as DeliveryRoute }
                  : { progressStage: column.key as ProgressStage });
                setDraggingId(null);
                setDropTarget(null);
              }}
              className={`flex min-h-28 min-w-0 flex-col rounded-xl border xl:min-h-0 ${
                dropTarget === column.key ? "border-accent bg-accent-soft/50" : "border-line bg-surface-muted"
              }`}>
              <header className="flex min-h-11 shrink-0 items-center justify-between gap-1.5 border-b border-line px-2.5 py-2">
                <h3 className="min-w-0 break-words text-xs font-semibold text-ink">{column.label}</h3>
                <span aria-label={`${items.length} use cases`} className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-xs tabular-nums text-accent">{items.length}</span>
              </header>
              <ul aria-label={`${column.label} use cases`} tabIndex={0}
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-b-xl p-2 focus-visible:outline-2 focus-visible:outline-accent xl:overflow-x-hidden xl:overflow-y-auto xl:overscroll-y-contain">
                {items.map((useCase) => {
                  const writable = editable && canUpdateHandoff(eventStatus, useCase);
                  return <li key={useCase.id} className="min-w-0">
                    <article aria-label={`${useCase.code}: ${useCase.title}`} draggable={writable && !pending}
                      onDragStart={(event) => {
                        if ((event.target as HTMLElement).closest("select, input, a")) { event.preventDefault(); return; }
                        event.dataTransfer.setData("application/x-hackathon-usecase", useCase.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingId(useCase.id);
                      }}
                      onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                      className={`min-w-0 rounded-lg border border-line bg-surface p-2.5 shadow-[var(--shadow-card)] ${draggingId === useCase.id ? "opacity-60" : ""}`}>
                      <button id={`handoff-trigger-${useCase.id}`} type="button"
                        onClick={() => panel.openCase(useCase.id)} disabled={pending}
                        aria-label={`Open handoff for ${useCase.code}: ${useCase.title}`}
                        aria-haspopup="dialog"
                        className="flex w-full gap-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-medium text-ink-faint">{useCase.code}</span>
                          <span title={useCase.title} className="mt-1 line-clamp-3 break-words text-[13px] leading-snug font-semibold text-ink">{useCase.title}</span>
                        </span>
                        {writable ? <GripVertical aria-hidden className="mt-1 h-3 w-3 shrink-0 cursor-grab text-ink-faint" /> : null}
                      </button>
                      <div className="mt-2 flex min-w-0 flex-wrap gap-1">
                        <Badge tone="info" className="max-w-full px-1.5 text-[10px] whitespace-normal">{panel.group === "route"
                          ? PROGRESS_LABELS[useCase.handoff.progressStage]
                          : DELIVERY_LABELS[useCase.handoff.deliveryRoute]}</Badge>
                        <HandoffCaseBadges useCase={useCase} compact />
                      </div>
                      <dl className="mt-2 space-y-1.5 text-[11px] leading-snug">
                        <div><dt className="text-ink-faint">Owner</dt>
                          <dd title={useCase.handoff.businessOwner} className={`mt-0.5 line-clamp-2 break-words font-medium ${useCase.handoff.businessOwner.trim() ? "text-ink" : "text-warn"}`}>
                            {useCase.handoff.businessOwner.trim() || "Owner needed"}
                          </dd></div>
                        <div><dt className="text-ink-faint">Next action</dt>
                          <dd title={useCase.handoff.nextMilestone} className="mt-0.5 line-clamp-2 break-words text-ink">{useCase.handoff.nextMilestone.trim() || "Not recorded"}</dd>
                          <dd className="mt-0.5 font-medium text-ink-soft">{useCase.handoff.nextMilestoneDate || "No date set"}</dd></div>
                      </dl>
                      {writable ? <details className="mt-2 border-t border-line pt-2">
                        <summary aria-label={`Move or route ${useCase.code}`}
                          className="cursor-pointer rounded text-[11px] font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">Move / route</summary>
                        <div className="mt-2 grid min-w-0 gap-2">
                          <div className="min-w-0">
                            <label htmlFor={`stage-${useCase.id}`} className="mb-1 block text-[10px] text-ink-soft">Progress stage</label>
                            <Select id={`stage-${useCase.id}`} aria-label={`Move ${useCase.code} to stage`}
                              value={useCase.handoff.progressStage} disabled={pending}
                              onChange={(event) => changeWorkflow(useCase, { progressStage: event.target.value as ProgressStage })}
                              className="min-w-0 py-1.5 pl-2 text-[11px]">
                              {PROGRESS_STAGES.map((stage) => <option key={stage} value={stage}>{PROGRESS_LABELS[stage]}</option>)}
                            </Select>
                          </div>
                          <div className="min-w-0">
                            <label htmlFor={`route-${useCase.id}`} className="mb-1 block text-[10px] text-ink-soft">Delivery route</label>
                            <Select id={`route-${useCase.id}`} aria-label={`Delivery route for ${useCase.code}`}
                              value={useCase.handoff.deliveryRoute} disabled={pending}
                              onChange={(event) => changeWorkflow(useCase, { deliveryRoute: event.target.value as DeliveryRoute })}
                              className="min-w-0 py-1.5 pl-2 text-[11px]">
                              {DELIVERY_ROUTES.map((route) => <option key={route} value={route}>{DELIVERY_LABELS[route]}</option>)}
                            </Select>
                          </div>
                        </div>
                      </details> : null}
                      <div className="mt-2 flex flex-wrap justify-between gap-x-2 gap-y-1 border-t border-line pt-2 text-[10px]">
                        <Link href={`/hackathons/${hackathonId}/usecases/${useCase.id}`} aria-label={`Canvas and evaluation for ${useCase.code}`} className="text-ink-soft underline">Canvas</Link>
                        <Link href={`/hackathons/${hackathonId}/handoff?case=${encodeURIComponent(useCase.id)}&group=${panel.group}`}
                          aria-label={`Handoff overview for ${useCase.code}`} className="text-ink-soft underline">Handoff</Link>
                      </div>
                    </article>
                  </li>;
                })}
                {items.length === 0 ? <li className="rounded-lg border border-dashed border-line p-3 text-center text-[11px] text-ink-faint">No use cases</li> : null}
              </ul>
            </section>;
          })}
        </div>
      </div>
      {selected ? <HandoffDrawer key={selected.id} hackathonId={hackathonId} useCase={selected}
        eventStatus={eventStatus} editable={editable} requestedStage={panel.requestedStage}
        group={panel.group} view="board" onClose={panel.closePanel} /> : null}
    </div>
  );
}

export function HandoffCaseBadges({ useCase, compact = false }: { useCase: KanbanCase; compact?: boolean }) {
  const evaluation = useCase.evaluation;
  const badgeClass = compact ? "max-w-full px-1.5 text-[10px] whitespace-normal" : undefined;
  const submitted = useCase.handoffVersion !== null && useCase.handoff.cafStatus === "Submitted" &&
    useCase.handoff.businessOwner.trim() && useCase.handoff.cafReference.trim();
  return <>
    {submitted ? <Badge tone="accent" className={badgeClass}>Submitted to CAF</Badge> : null}
    {evaluation?.failedGates ? <Badge tone="danger" className={badgeClass}>Blocked · {evaluation.failedGates} {evaluation.failedGates === 1 ? "gate" : "gates"}</Badge> : null}
    {evaluation && !evaluation.isCurrent ? <Badge tone="warn" className={badgeClass}>Stale evaluation</Badge> : null}
    {evaluation?.isMock ? <Badge tone="warn" className={badgeClass}>Mock evaluation</Badge> : null}
    {!evaluation ? <Badge tone="neutral" className={badgeClass}>Not evaluated</Badge> : null}
    {useCase.status === "Closed" ? <Badge tone="neutral" className={badgeClass}>Exit package closed</Badge> : <span className={`${compact ? "text-[10px]" : "text-xs"} text-ink-faint`}>
      Qualification: {humanize(useCase.status)}
    </span>}
  </>;
}
