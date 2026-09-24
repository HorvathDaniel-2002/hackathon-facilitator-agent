"use client";

import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import { isWorkspaceFrozen } from "@/components/workspace-state";
import { NativeDialog } from "@/components/native-dialog";
import type { ActionError } from "@/lib/actions/guard";
import { Field, Input, Select } from "@/components/ui/field";
import { updateHackathon } from "@/lib/actions/hackathon";
import {
  HACKATHON_STATUSES,
} from "@/lib/schemas";
import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface WorkspaceValues {
  name: string;
  customer: string;
  status: string;
}

export function WorkspaceEditor({
  hackathonId,
  canArchive,
  version,
  initial,
}: {
  hackathonId: string;
  canArchive: boolean;
  version: number;
  initial: WorkspaceValues;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);
  const [draftVersion, setDraftVersion] = useState(version);
  const [draftStatus, setDraftStatus] = useState(initial.status);
  const scopeLocked = isWorkspaceFrozen(initial.status) && draftStatus !== "Planning";
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    const input = Object.fromEntries(formData.entries());

    start(async () => {
      const result = await updateHackathon(hackathonId, input, draftVersion);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => { setError(null); setDraftVersion(version); setDraftStatus(initial.status); setOpen(true); }}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
      </Button>
      <NativeDialog open={open} onClose={() => setOpen(false)} labelledBy="settings-dialog-title" busy={pending}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="settings-dialog-title" className="text-lg font-semibold text-ink">Edit workspace settings</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Update the workspace identity or lifecycle. Readiness and membership protections still apply.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="rounded-full p-1.5 text-ink-faint hover:bg-sunken hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }} aria-busy={pending}>
          <fieldset disabled={pending} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {scopeLocked ? <p className="text-sm text-ink-soft sm:col-span-2">Select Planning to reopen or restore the workspace before editing its settings.</p> : null}
          <Field label="Name" required htmlFor="e-name" error={error?.fieldErrors?.name?.[0]}>
            <Input id="e-name" name="name" defaultValue={initial.name} required readOnly={scopeLocked} />
          </Field>
          <Field label="Customer" required htmlFor="e-customer" error={error?.fieldErrors?.customer?.[0]}>
            <Input
              id="e-customer"
              name="customer"
              defaultValue={initial.customer}
              readOnly={scopeLocked}
              required
            />
          </Field>
          <Field label="Status" htmlFor="e-status" error={error?.fieldErrors?.status?.[0]}>
            <Select id="e-status" name="status" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}>
              {HACKATHON_STATUSES.filter((s) =>
                (s !== "Archived" || canArchive || s === initial.status) &&
                (!isWorkspaceFrozen(initial.status) || s === initial.status || s === "Planning" || (initial.status === "Closed" && s === "Archived")),
              ).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <ActionFeedback error={error} onRefresh={() => {
              if (!window.confirm("Discard the unsaved settings changes and load the latest saved record?")) return;
              setOpen(false);
              router.refresh();
            }} />
          </div>
          </fieldset>

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" variant="primary" disabled={pending || (scopeLocked && draftStatus === initial.status)}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
            <Button type="button" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      </NativeDialog>
    </>
  );
}
