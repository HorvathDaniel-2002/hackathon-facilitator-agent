"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import type { ActionError } from "@/lib/actions/guard";
import { assignTeamMember, removeTeamMember } from "@/lib/actions/usecase";
import { PARTIES } from "@/lib/schemas";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ContactChoice {
  id: string;
  name: string;
  roleType: string;
}

interface TeamRow {
  contact: ContactChoice;
  party: string;
  responsibility: string | null;
}

export function UseCaseTeamPanel({
  hackathonId, useCaseId, version, contacts, members, editable,
}: {
  hackathonId: string;
  useCaseId: string;
  version: number;
  contacts: ContactChoice[];
  members: TeamRow[];
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);
  const [draftVersion, setDraftVersion] = useState(version);
  useEffect(() => {
    if (open) document.getElementById("team-contact")?.focus();
  }, [open, editing?.contact.id]);

  function onSave(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await assignTeamMember(
        hackathonId, useCaseId, String(formData.get("contactId")),
        String(formData.get("party")), String(formData.get("responsibility") ?? ""),
        draftVersion,
      );
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else setError(result);
    });
  }

  function onRemove(member: TeamRow) {
    if (!window.confirm(`Remove ${member.contact.name} from this build team? Their contact record will remain.`)) return;
    setError(null);
    start(async () => {
      const result = await removeTeamMember(hackathonId, useCaseId, member.contact.id, version);
      if (result.ok) router.refresh();
      else setError(result);
    });
  }

  return (
    <Card>
      <CardHeader title="Build team" subtitle="Attendance is explicit per use case; a workspace contact alone is not an assignment."
        action={editable ? <Button size="sm" disabled={pending || open || contacts.every((c) => members.some((m) => m.contact.id === c.id))}
          onClick={() => { setEditing(null); setDraftVersion(version); setOpen(true); setError(null); }}>Assign contact</Button> : null} />
      {open && editable ? (
        <form key={editing?.contact.id ?? "new"} aria-label="Build team assignment"
          aria-busy={pending}
          onSubmit={(event) => { event.preventDefault(); onSave(new FormData(event.currentTarget)); }}
          className="mb-4 space-y-3 rounded-xl border border-line p-3">
          <fieldset disabled={pending} className="min-w-0 space-y-3">
          <Field label="Contact" htmlFor="team-contact" required error={error?.fieldErrors?.contactId?.[0]}>
            <Select id="team-contact" name="contactId" required defaultValue={editing?.contact.id ?? ""}>
              <option value="" disabled>Choose a contact</option>
              {contacts.filter((c) => editing ? c.id === editing.contact.id : !members.some((m) => m.contact.id === c.id)).map((c) =>
                <option key={c.id} value={c.id}>{c.name} · {c.roleType}</option>)}
            </Select>
          </Field>
          <Field label="Party" htmlFor="team-party" required error={error?.fieldErrors?.party?.[0]}>
            <Select id="team-party" name="party" required defaultValue={editing?.party ?? "Customer"}>
              {PARTIES.map((party) => <option key={party} value={party}>{party}</option>)}
            </Select>
          </Field>
          <Field label="Responsibility" htmlFor="team-responsibility">
            <Input id="team-responsibility" name="responsibility" defaultValue={editing?.responsibility ?? ""} placeholder="Process owner attending the build" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save assignment"}</Button>
            <Button type="button" size="sm" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          </fieldset>
        </form>
      ) : null}
      <ActionFeedback error={error} onRefresh={() => {
        if (open && !window.confirm("Discard the unsaved assignment and load the latest saved team?")) return;
        setOpen(false);
        setError(null);
        router.refresh();
      }} />
      {open ? <p className="mb-3 text-xs text-ink-soft">Save or cancel this assignment before changing another.</p> : null}
      {members.length === 0 ? <p className="text-sm text-ink-soft">Nobody assigned. Assign a business owner who will attend the build to satisfy the attendance gate.</p> : (
        <ul className="space-y-4">
          {members.map((member) => (
            <li key={member.contact.id}>
              <div className="flex items-center gap-2">
                <Avatar name={member.contact.name} size="sm" />
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{member.contact.name}</span>
                <Badge tone="neutral">{member.party}</Badge>
              </div>
              <p className="mt-1 break-words text-xs text-ink-soft">{member.responsibility || member.contact.roleType}</p>
              {editable ? <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={pending || open} aria-label={`Edit assignment for ${member.contact.name}`}
                  onClick={() => { setEditing(member); setDraftVersion(version); setOpen(true); setError(null); }}>Edit assignment</Button>
                <Button size="sm" disabled={pending || open} aria-label={`Remove assignment for ${member.contact.name}`} onClick={() => onRemove(member)}>Remove</Button>
              </div> : null}
            </li>
          ))}
        </ul>
      )}
      <LinkButton size="sm" className="mt-4" href={`/hackathons/${hackathonId}/contacts`}>
        {editable ? "Manage contacts" : "View contacts"}
      </LinkButton>
    </Card>
  );
}
