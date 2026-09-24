"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, humanize } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import { canEditRunbookItem } from "@/components/workspace-state";
import type { ActionError } from "@/lib/actions/guard";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { saveRunbookCheck } from "@/lib/actions/runbook";
import { RUNBOOK_STATUSES, isRunbookItemComplete, missingRunbookChecks, type RunbookItem, type RunbookTemplate } from "@/lib/domain/runbook";

type Source = { id: string; title: string; url: string; supports: string };

export function RunbookBoard({ hackathonId, eventStatus, items, template, sources, editable }: {
  hackathonId: string; items: RunbookItem[]; template: RunbookTemplate;
  eventStatus: string;
  sources: { reviewedAt: string; scope: string; sources: Source[] }; editable: boolean;
}) {
  const start = missingRunbookChecks(items, template.version, "Start");
  const close = missingRunbookChecks(items, template.version, "Close");
  return <div className="space-y-4">
    <Card>
      <CardHeader title="Facilitator runbook" subtitle="Prepare, run and follow through. Every completion needs a named owner and evidence." />
      <div className="flex flex-wrap gap-2">
        <Badge tone={start.length ? "warn" : "accent"}>{start.length} start checks remaining</Badge>
        <Badge tone={close.length ? "warn" : "accent"}>{close.length} closure checks remaining</Badge>
        <Badge>Guidance reviewed {sources.reviewedAt}</Badge>
      </div>
      <p className="mt-4 text-sm text-ink-soft">{template.notice}</p>
      <p className="mt-3 text-sm text-ink-soft">Set each due / confirmation date explicitly. No dates are calculated automatically.</p>
      <p className="mt-3 text-xs text-ink-soft">A checked item records a facilitator attestation, not an automated check of your Microsoft tenant. Do not paste secrets, customer data or sensitive approvals into evidence; use a permitted decision reference.</p>
    </Card>
    {Array.from(new Set(items.map((item) => item.stage))).map((stage) => <Card key={stage}>
      <CardHeader title={stage} />
      <div className="space-y-3">{items.filter((item) => item.stage === stage).map((item) =>
        <CheckEditor key={item.id} item={item} hackathonId={hackathonId} templateVersion={template.version}
          editable={editable && canEditRunbookItem(eventStatus, item.stage, item.gate)} sources={sources.sources} />)}</div>
    </Card>)}
    <Card>
      <CardHeader title="Microsoft source register" subtitle={sources.scope} />
      <ul className="space-y-3">{sources.sources.map((source) => <li key={source.id}>
        <a className="text-sm font-medium underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
        <p className="text-xs text-ink-soft">{source.supports}</p>
      </li>)}</ul>
    </Card>
  </div>;
}

function CheckEditor({ item, hackathonId, templateVersion, sources, editable }: {
  item: RunbookItem; hackathonId: string; templateVersion: string; sources: Source[]; editable: boolean;
}) {
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);
  const [saved, setSaved] = useState(false);
  const [draftVersion, setDraftVersion] = useState(item.version);
  const [draft, setDraft] = useState(item);
  const [formKey, setFormKey] = useState(0);
  const [reloadRequested, setReloadRequested] = useState(false);
  const router = useRouter();
  if (reloadRequested && item.version !== draftVersion) {
    setDraft(item);
    setDraftVersion(item.version);
    setFormKey(formKey + 1);
    setReloadRequested(false);
    setError(null);
    setSaved(false);
  }
  const complete = isRunbookItemComplete(item, templateVersion);
  function submit(form: FormData) {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await saveRunbookCheck(hackathonId, item.id, Object.fromEntries(form), draftVersion);
      if (result.ok) {
        setDraftVersion(draftVersion + 1);
        setSaved(true);
        router.refresh();
      } else setError(result);
    });
  }
  return <details className="rounded-2xl border border-line p-4">
    <summary className="cursor-pointer text-sm font-semibold">
      {item.title} <Badge tone={complete ? "accent" : item.status === "Blocked" ? "danger" : "neutral"}>{humanize(item.status)}</Badge>
      {item.gate !== "None" && <Badge tone="info">Required to {item.gate.toLowerCase()}</Badge>}
    </summary>
    <p className="mt-3 text-sm text-ink-soft">{item.instruction}</p>
    <p className="mt-2 text-xs text-ink-soft">Suggested accountable role: {item.ownerRole}</p>
    <p className="my-3 flex flex-wrap gap-3">{item.sourceIds.map((id) => {
      const source = sources.find((s) => s.id === id)!;
      return <a key={id} className="text-xs underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>;
    })}</p>
    {item.version >= 0 && item.templateVersion !== templateVersion && <p role="alert" className="text-sm text-warn">Scope or methodology changed. Review the saved evidence and save this check again before it can count as complete.</p>}
    <form key={formKey} aria-busy={pending} onChange={() => setSaved(false)} onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Status" htmlFor={`${item.id}-status`} error={error?.fieldErrors?.status?.[0]}><Select id={`${item.id}-status`} name="status" defaultValue={draft.status} disabled={!editable || pending}>
        {RUNBOOK_STATUSES.filter((status) => status !== "NotApplicable" || item.gate === "None").map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
      </Select></Field>
      <Field label="Accountable owner" htmlFor={`${item.id}-owner`} error={error?.fieldErrors?.owner?.[0]} hint="Required to mark Done or Not applicable."><Input id={`${item.id}-owner`} name="owner" defaultValue={draft.owner} maxLength={200} disabled={!editable || pending} /></Field>
      <Field label="Due / confirmation date" htmlFor={`${item.id}-date`} error={error?.fieldErrors?.dueDate?.[0]} hint="Required to mark Done or Not applicable."><Input id={`${item.id}-date`} name="dueDate" type="date" defaultValue={draft.dueDate} disabled={!editable || pending} /></Field>
      <Field className="sm:col-span-3" label="Evidence, decision reference or blocker" htmlFor={`${item.id}-evidence`} error={error?.fieldErrors?.evidence?.[0]} hint="Required to mark Done or Not applicable. Use a permitted reference, not sensitive content."><Textarea id={`${item.id}-evidence`} name="evidence" defaultValue={draft.evidence} maxLength={6000} disabled={!editable || pending} /></Field>
      {editable && <Button type="submit" variant="primary" size="sm" disabled={pending}>{pending ? "Saving..." : "Save check"}</Button>}
      <div className="sm:col-span-3"><ActionFeedback error={error} onRefresh={() => {
        if (!window.confirm("Discard this check's unsaved changes and load its latest saved values?")) return;
        setReloadRequested(true);
        router.refresh();
      }} /></div>
      {saved && <p role="status" className="text-sm text-accent">Saved.</p>}
    </form>
    {item.updatedAt && <p className="mt-3 text-xs text-ink-soft">Recorded {new Date(item.updatedAt).toLocaleString("en-GB")} · owner {item.owner}</p>}
  </details>;
}
