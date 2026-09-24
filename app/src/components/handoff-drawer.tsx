"use client";

import { HandoffForm, type EngagementSuggestion } from "@/components/handoff-form";
import { Button } from "@/components/ui/button";
import { useActionTransition } from "@/components/use-action-transition";
import type { ActionError } from "@/lib/actions/guard";
import { closeUseCase, saveHandoff, suggestNextEngagement } from "@/lib/actions/handoff";
import type { HandoffDraft, KanbanCase } from "@/lib/kanban";
import { portfolioDecisionSchema, type ProgressStage } from "@/lib/schemas";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";

interface UnsavedHandoff {
  draft: HandoffDraft;
  baseline: HandoffDraft;
  handoffVersion: number | null;
  useCaseVersion: number;
}

// Memory-only recovery also protects browsers without cancelable history traversal.
const unsavedHandoffs = new Map<string, UnsavedHandoff>();

export function canUpdateHandoff(eventStatus: string, useCase: KanbanCase) {
  return eventStatus !== "Archived" &&
    (eventStatus !== "Closed" || (useCase.status === "Closed" && useCase.handoffVersion !== null));
}

export function useHandoffPanel() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [requestedMove, setRequestedMove] = useState<{ id: string; stage: ProgressStage } | null>(null);
  const selectedId = searchParams.get("case");
  const group = searchParams.get("group") === "route" ? "route" : "progress";

  function openCase(id: string, stage?: ProgressStage) {
    setRequestedMove(stage ? { id, stage } : null);
    const next = new URLSearchParams(searchParams.toString());
    next.set("case", id);
    window.history.pushState(null, "", `${pathname}?${next}`);
  }

  function closePanel() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("case");
    setRequestedMove(null);
    window.history.replaceState(null, "", `${pathname}${next.size ? `?${next}` : ""}`);
  }

  function setGroup(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("group", value === "route" ? "route" : "progress");
    window.history.replaceState(null, "", `${pathname}?${next}`);
  }

  return {
    selectedId, group, setGroup, openCase, closePanel,
    requestedStage: requestedMove?.id === selectedId ? requestedMove.stage : undefined,
  };
}

export function HandoffWorkspaceNotice({ hackathonId, eventStatus, editable }: {
  hackathonId: string;
  eventStatus: string;
  editable: boolean;
}) {
  if (eventStatus === "Archived") return <p className="text-sm text-ink-soft">
    This event is archived. Handoff records are read-only. An Owner can restore the event in{" "}
    <Link href={`/hackathons/${hackathonId}/settings`} className="underline">Settings</Link>.
  </p>;
  if (!editable) return <p className="text-sm text-ink-soft">Viewer access: open any card to read its handoff. Changes are disabled.</p>;
  if (eventStatus === "Closed") return <p className="text-sm text-ink-soft">
    This event is closed. Recorded demos, business owners and portfolio decisions are protected.
    Complete exit packages still allow follow-up progress, evidence, outcomes and next actions.
    Reopen in <Link href={`/hackathons/${hackathonId}/settings`} className="underline">Settings</Link> to change protected fields.
  </p>;
  return null;
}

export function MissingHandoffCase({ onClear }: { onClear: () => void }) {
  return <div role="alert" className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
    <p>Use case not found in this workspace. The link may be outdated or belong to another event. No other case has been opened.</p>
    <Button type="button" size="sm" onClick={onClear} className="mt-2">Clear case selection</Button>
  </div>;
}

export function HandoffDrawer({
  hackathonId, useCase, eventStatus, editable, requestedStage, group = "progress", view, onClose,
}: {
  hackathonId: string;
  useCase: KanbanCase;
  eventStatus: string;
  editable: boolean;
  requestedStage?: ProgressStage;
  group?: string;
  view: "board" | "overview";
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const discardingDraft = useRef(false);
  const draftKey = `${hackathonId}:${useCase.id}`;
  const [recovered] = useState(() => unsavedHandoffs.get(draftKey));
  const [draft, setDraft] = useState<HandoffDraft>(() => ({
    ...(recovered?.draft ?? useCase.handoff), ...(requestedStage ? { progressStage: requestedStage } : {}),
  }));
  const [baseline, setBaseline] = useState(recovered?.baseline ?? useCase.handoff);
  const [savedVersion, setSavedVersion] = useState(recovered ? recovered.handoffVersion : useCase.handoffVersion);
  const [savedUseCaseVersion, setSavedUseCaseVersion] = useState(recovered?.useCaseVersion ?? useCase.version);
  const [caseClosed, setCaseClosed] = useState(useCase.status === "Closed");
  const [error, setError] = useState<ActionError | null>(null);
  const [notice, setNotice] = useState<string | null>(recovered
    ? "Recovered your unsaved handoff draft after navigation. Save it, or close the panel and confirm discarding it."
    : requestedStage === "InProduction"
    ? "To record In production, name the business owner and add production evidence, then save. Nothing has moved yet."
    : null);
  const [suggestion, setSuggestion] = useState<EngagementSuggestion | null>(null);
  const [pending, start] = useActionTransition(setError);
  const router = useRouter();
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const writable = editable && canUpdateHandoff(eventStatus, useCase);
  const closed = eventStatus === "Closed";
  const titleId = `handoff-title-${useCase.id}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      const trigger = document.getElementById(`handoff-trigger-${useCase.id}`);
      if (trigger) trigger.focus();
      else if (previous?.isConnected) previous.focus();
    };
  }, [useCase.id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!discardingDraft.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useLayoutEffect(() => {
    if (dirty && !discardingDraft.current) {
      unsavedHandoffs.set(draftKey, { draft, baseline, handoffVersion: savedVersion, useCaseVersion: savedUseCaseVersion });
    } else {
      unsavedHandoffs.delete(draftKey);
    }
  }, [draftKey, dirty, draft, baseline, savedVersion, savedUseCaseVersion]);

  useLayoutEffect(() => {
    if (!dirty && !pending) return;
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const guardTraversal = (event: Event) => {
      if ((event as Event & { navigationType?: string }).navigationType !== "traverse" || !event.cancelable) return;
      if (!pending && window.confirm("Discard unsaved handoff changes? Your last saved record will be kept.")) {
        unsavedHandoffs.delete(draftKey);
        return;
      }
      event.preventDefault();
    };
    navigation?.addEventListener("navigate", guardTraversal);
    return () => navigation?.removeEventListener("navigate", guardTraversal);
  }, [dirty, pending, draftKey]);

  function allowDismiss() {
    const allowed = !pending && (!dirty || window.confirm("Discard unsaved handoff changes? Your last saved record will be kept."));
    if (allowed) unsavedHandoffs.delete(draftKey);
    return allowed;
  }

  function requestClose() {
    if (allowDismiss()) onClose();
  }

  function guardNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (!allowDismiss()) event.preventDefault();
  }

  function update<K extends keyof HandoffDraft>(field: K, value: HandoffDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice(null);
    if (field === "portfolioDecision" || field === "nextEngagement") setSuggestion(null);
  }

  function onSave() {
    if (!writable || pending) return;
    const decision = portfolioDecisionSchema.safeParse(draft.portfolioDecision);
    const fieldErrors: Record<string, string[]> = {};
    if (draft.portfolioDecision && !decision.success) fieldErrors.portfolioDecision = ["Choose a valid portfolio decision."];
    if ((draft.progressStage === "InProduction" || draft.cafStatus === "Submitted") && !draft.businessOwner.trim()) {
      fieldErrors.businessOwner = ["Name the business owner before recording production or a CAF submission."];
    }
    if (draft.progressStage === "InProduction" && !draft.productionReference.trim()) {
      fieldErrors.productionReference = ["Add evidence or a reference for the external production rollout."];
    }
    if (draft.cafStatus === "Submitted" && !draft.cafReference.trim()) {
      fieldErrors.cafReference = ["Add the external CAF submission reference."];
    }
    if (Object.keys(fieldErrors).length) {
      setError({ ok: false, code: "validation", error: "Check the required handoff fields. Your draft has been kept.", fieldErrors });
      return;
    }
    setError(null);
    setNotice(null);
    const input = { ...draft, portfolioDecision: decision.success ? decision.data : "" as const };
    start(async () => {
      const result = await saveHandoff(hackathonId, useCase.id, input, savedVersion);
      if (!result.ok) { setError(result); return; }
      setSavedVersion(result.data.version);
      setSavedUseCaseVersion(result.data.useCaseVersion);
      setBaseline(draft);
      setNotice("Exit package saved.");
      router.refresh();
    });
  }

  function onSuggest() {
    const decision = portfolioDecisionSchema.safeParse(draft.portfolioDecision);
    if (!decision.success) {
      setError({ ok: false, code: "validation", error: "Choose a portfolio decision before requesting a next-engagement proposal." });
      return;
    }
    setError(null);
    setNotice(null);
    start(async () => {
      const result = await suggestNextEngagement(hackathonId, useCase.id, decision.data);
      if (!result.ok) { setError(result); return; }
      if (!result.data) {
        setSuggestion(null);
        setError({ ok: false, code: "validation", error: "No engagement matched. Record the next engagement manually." });
        return;
      }
      const suggestion = result.data;
      setSuggestion({ label: suggestion.label, rationale: suggestion.rationale });
      setDraft((current) => ({ ...current, nextEngagement: suggestion.label }));
    });
  }

  function onCloseCase() {
    if (dirty || savedVersion === null) {
      setError({ ok: false, code: "validation", error: "Save the exit package before closing. Closure uses the saved record, not your draft." });
      return;
    }
    setError(null);
    setNotice(null);
    start(async () => {
      const result = await closeUseCase(hackathonId, useCase.id, savedUseCaseVersion, savedVersion);
      if (!result.ok) { setError(result); return; }
      setCaseClosed(true);
      setSavedUseCaseVersion((version) => version + 1);
      setNotice("Use case closed.");
      router.refresh();
    });
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-busy={pending}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-2xl overflow-y-auto overscroll-contain border-l border-line bg-surface p-5 text-ink shadow-[var(--shadow-raised)] backdrop:bg-black/40 sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-faint">Shared handoff record · {useCase.code}</p>
          <h2 id={titleId} className="mt-1 break-words text-xl font-semibold">{useCase.title}</h2>
          {caseClosed ? <p className="mt-1 text-xs text-ink-soft">Exit package closed · follow-up remains separate</p> : null}
        </div>
        <Button type="button" size="sm" onClick={requestClose} disabled={pending} aria-label="Close handoff panel">Close</Button>
      </header>
      <nav aria-label="Use case views" className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link onClick={guardNavigation} aria-disabled={pending}
          href={`/hackathons/${hackathonId}/usecases/${useCase.id}`} className="underline aria-disabled:opacity-50">
          Canvas &amp; evaluation
        </Link>
        <Link onClick={guardNavigation} aria-disabled={pending}
          href={`/hackathons/${hackathonId}/${view === "board" ? "handoff" : "usecases"}?case=${encodeURIComponent(useCase.id)}&group=${group === "route" ? "route" : "progress"}`}
          className="underline aria-disabled:opacity-50">{view === "board" ? "Handoff overview" : "Open on board"}</Link>
      </nav>
      <div className="mb-5">
        <HandoffWorkspaceNotice hackathonId={hackathonId} eventStatus={eventStatus} editable={editable} />
        {closed && !canUpdateHandoff(eventStatus, useCase) ? <p className="mt-2 text-sm text-warn">
          This exit package was not completed before the event closed. An Owner must reopen the event in Settings before it can be repaired.
        </p> : null}
      </div>
      <HandoffForm id={useCase.id} draft={draft} onChange={update} editable={writable} closed={closed}
        pending={pending} dirty={dirty} canClose={!caseClosed && !closed} error={error} notice={notice}
        suggestion={suggestion} onSuggest={onSuggest} onSave={onSave} onCloseCase={onCloseCase}
        onRefresh={() => {
          if (!pending && window.confirm("Discard this unsaved handoff draft and load the latest saved record?")) {
            discardingDraft.current = true;
            unsavedHandoffs.delete(draftKey);
            window.location.reload();
          }
        }} />
    </dialog>
  );
}
