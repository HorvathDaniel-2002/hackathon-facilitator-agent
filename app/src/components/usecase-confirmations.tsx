"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { ActionError } from "@/lib/actions/guard";
import { updateUseCase } from "@/lib/actions/usecase";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UseCaseConfirmations({
  hackathonId, useCaseId, version, sampleDataApproved, processOwnerConfirmed, editable,
}: {
  hackathonId: string;
  useCaseId: string;
  version: number;
  sampleDataApproved: boolean;
  processOwnerConfirmed: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState({ version, sampleDataApproved, processOwnerConfirmed });
  if (!dirty && version > draft.version) {
    setDraft({ version, sampleDataApproved, processOwnerConfirmed });
    setSaved(false);
  }

  function onSave(form: FormData) {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await updateUseCase(hackathonId, useCaseId, {
        sampleDataApproved: form.get("sampleDataApproved") === "on",
        processOwnerConfirmed: form.get("processOwnerConfirmed") === "on",
      }, draft.version);
      if (result.ok) {
        setDraft((value) => ({ ...value, version: value.version + 1 }));
        setDirty(false);
        setSaved(true);
        router.refresh();
      } else setError(result);
    });
  }

  return <Card>
    <CardHeader title="Facilitator confirmations" subtitle="Explicit confirmations, not facts inferred by AI. Re-evaluate after these or the team change." />
    <form aria-busy={pending} onSubmit={(event) => { event.preventDefault(); onSave(new FormData(event.currentTarget)); }}
      onChange={() => { setSaved(false); setDirty(true); }}>
      <fieldset disabled={!editable || pending} className="space-y-4">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" name="sampleDataApproved" checked={draft.sampleDataApproved}
            onChange={(event) => setDraft((value) => ({ ...value, sampleDataApproved: event.target.checked }))}
            className="mt-1 h-4 w-4 shrink-0 accent-accent" />
          Approved anonymized or synthetic sample data is available
        </label>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" name="processOwnerConfirmed" checked={draft.processOwnerConfirmed}
            onChange={(event) => setDraft((value) => ({ ...value, processOwnerConfirmed: event.target.checked }))}
            className="mt-1 h-4 w-4 shrink-0 accent-accent" />
          The assigned process owner has confirmed attendance
        </label>
      </fieldset>
      <p className="mt-3 text-xs text-ink-soft">
        Confirm sample readiness only after the data owner approves a usable anonymized or synthetic sample for this event.
        Record the source and approval context in the canvas, and assign the confirmed attending owner in Build team.
        These confirmations do not replace those records.
      </p>
      {dirty ? <p className="mt-2 text-xs text-warn">Unsaved confirmations</p> : null}
      {editable ? <Button className="mt-4" type="submit" size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save confirmations"}</Button> : null}
      {saved ? <p role="status" className="mt-2 text-sm text-accent">Confirmations saved. Re-evaluate to refresh the gates.</p> : null}
      <ActionFeedback error={error} onRefresh={() => {
        if (window.confirm("Discard unsaved changes on this page and load the latest saved record?")) window.location.reload();
      }} />
    </form>
  </Card>;
}
