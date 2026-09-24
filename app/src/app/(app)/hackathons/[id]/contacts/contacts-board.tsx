"use client";

import { Avatar } from "@/components/ui/avatar";
import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import type { ActionError } from "@/lib/actions/guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createContact, deleteContact, updateContact } from "@/lib/actions/contact";
import {
  CONTACT_ROLE_TYPES,
  INFLUENCE_LEVELS,
  type ContactRoleType,
  type Influence,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export interface ContactRow {
  id: string;
  version: number;
  name: string;
  email: string | null;
  org: string | null;
  roleType: string;
  influence: string;
  notes: string | null;
  useCases: Array<{ id: string; code: string; title: string }>;
}

const INFLUENCE_TONE: Record<string, "danger" | "warn" | "neutral"> = {
  High: "danger",
  Medium: "warn",
  Low: "neutral",
};

export function ContactsBoard({
  hackathonId,
  contacts,
  editable,
}: {
  hackathonId: string;
  contacts: ContactRow[];
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);
  const router = useRouter();
  useEffect(() => {
    if (adding) document.getElementById("c-name")?.focus();
  }, [adding, editing?.id]);

  function onCreate(formData: FormData) {
    setError(null);
    const input = Object.fromEntries(formData.entries());

    start(async () => {
      const result = editing
        ? await updateContact(hackathonId, editing.id, input, editing.version)
        : await createContact(hackathonId, input);
      if (result.ok) {
        setAdding(false);
        setEditing(null);
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  function onDelete(contactId: string) {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    if (!window.confirm(`Delete ${contact?.name ?? "this contact"}? This also removes their use-case team assignments.`)) return;
    setError(null);
    start(async () => {
      const result = await deleteContact(hackathonId, contactId, contact.version);
      if (result.ok) router.refresh();
      else setError(result);
    });
  }

  const hasSponsor = contacts.some((c) => c.roleType === "Sponsor");
  const hasOwner = contacts.some((c) => c.roleType === "BusinessOwner");

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader
            title={`${contacts.length} contacts`}
            subtitle="Sponsor and business-owner presence feeds the qualification gates."
            action={
              editable && !adding ? (
                <Button size="sm" variant="primary" onClick={() => { setEditing(null); setError(null); setAdding(true); }}>
                  <UserPlus className="h-3.5 w-3.5" aria-hidden />
                  Add contact
                </Button>
              ) : null
            }
          />

          {adding && editable ? (
            <form
              key={editing?.id ?? "new"}
              onSubmit={(event) => { event.preventDefault(); onCreate(new FormData(event.currentTarget)); }}
              aria-label={editing ? `Edit ${editing.name}` : "Add contact"}
              aria-busy={pending}
              className="mb-5 grid grid-cols-1 gap-4 rounded-[var(--radius-inner)] border border-line bg-surface-muted p-5 sm:grid-cols-2"
            >
              <fieldset disabled={pending} className="grid min-w-0 grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Name" required htmlFor="c-name" error={error?.fieldErrors?.name?.[0]}>
                <Input id="c-name" name="name" required defaultValue={editing?.name ?? ""} />
              </Field>
              <Field label="Email" htmlFor="c-email" error={error?.fieldErrors?.email?.[0]}>
                <Input id="c-email" name="email" type="email" defaultValue={editing?.email ?? ""} />
              </Field>
              <Field label="Organisation" htmlFor="c-org">
                <Input id="c-org" name="org" placeholder="Contoso Logistics" defaultValue={editing?.org ?? ""} />
              </Field>
              <Field label="Role" htmlFor="c-role" required error={error?.fieldErrors?.roleType?.[0]}>
                <Select id="c-role" name="roleType" required defaultValue={editing?.roleType ?? "BusinessOwner"}>
                  {CONTACT_ROLE_TYPES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Influence" htmlFor="c-influence">
                <Select id="c-influence" name="influence" defaultValue={editing?.influence ?? "Medium"}>
                  {INFLUENCE_LEVELS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes" htmlFor="c-notes" className="sm:col-span-2">
                <Textarea id="c-notes" name="notes" defaultValue={editing?.notes ?? ""} />
              </Field>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button type="submit" variant="primary" size="sm" disabled={pending}>
                  {pending ? "Saving…" : editing ? "Save contact" : "Add contact"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAdding(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
              </fieldset>
            </form>
          ) : null}

          <ActionFeedback error={error} onRefresh={() => router.refresh()}
            refreshHint="Refresh updates the contact list without replacing your draft. Copy your changes, then Cancel and reopen the contact to merge with the latest version." />
          {adding ? <p className="mb-3 text-xs text-ink-soft">Save or cancel this contact before editing another.</p> : null}

          {contacts.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No contacts yet"
              description="Add the sponsor, the business owner, IT, security and data contacts. Their presence is checked by the qualification gates."
            />
          ) : (
            <ul className="divide-y divide-line">
              {contacts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3.5">
                  <Avatar name={c.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {c.name}
                      </span>
                      <Badge tone="neutral">{c.roleType}</Badge>
                      <Badge tone={INFLUENCE_TONE[c.influence] ?? "neutral"}>
                        {c.influence} influence
                      </Badge>
                    </p>
                    {c.notes ? <p className="mt-2 break-words text-sm whitespace-pre-wrap text-ink-soft">{c.notes}</p> : null}
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      {[c.org, c.email].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {c.useCases.length > 0 ? (
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {c.useCases.map((uc) => (
                          <Link key={uc.id} href={`/hackathons/${hackathonId}/usecases/${uc.id}`} title={uc.title}><Badge tone="info">{uc.code}</Badge></Link>
                        ))}
                      </p>
                    ) : null}
                  </div>
                  {editable ? (
                    <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Edit ${c.name}`} disabled={pending || adding}
                      onClick={() => { setEditing(c); setAdding(true); setError(null); }}
                      className="rounded-full p-2 text-ink-faint hover:bg-sunken hover:text-ink disabled:opacity-50">
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      onClick={() => onDelete(c.id)}
                      disabled={pending || adding}
                      className="rounded-full p-2 text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader
            title="Gate readiness"
            subtitle="What the stakeholder map contributes"
          />
          <ul className="space-y-2.5">
            <GateCheck ok={hasSponsor} label="An executive sponsor is recorded" />
            <GateCheck ok={hasOwner} label="A business owner is recorded" />
            <GateCheck
              ok={contacts.some((c) => c.roleType === "Data")}
              label="A data contact can provide anonymized samples"
            />
            <GateCheck
              ok={contacts.some((c) => c.roleType === "Security")}
              label="A security contact can resolve DLP questions"
            />
            <GateCheck
              ok={contacts.some((c) => c.roleType === "Mentor")}
              label="At least one mentor is assigned"
            />
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Influence map"
            subtitle="Influence against role type"
          />
          <StakeholderGrid contacts={contacts} />
        </Card>
      </div>
    </div>
  );
}

function GateCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
          ok ? "border-accent bg-accent" : "border-line-strong bg-transparent",
        )}
      />
      <span className={ok ? "text-ink-soft" : "text-ink"}>{label}</span>
    </li>
  );
}

/** Influence × role grid — spec M4. */
function StakeholderGrid({ contacts }: { contacts: ContactRow[] }) {
  const roles = CONTACT_ROLE_TYPES.filter((r) =>
    contacts.some((c) => c.roleType === r),
  );

  if (roles.length === 0) {
    return <p className="text-sm text-ink-faint">Add contacts to build the map.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="pb-2 text-left font-medium text-ink-faint">Role</th>
            {INFLUENCE_LEVELS.map((i) => (
              <th key={i} className="pb-2 text-center font-medium text-ink-faint">
                {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role} className="border-t border-line">
              <td className="py-2 pr-2 text-ink">{role}</td>
              {INFLUENCE_LEVELS.map((inf) => {
                const matches = contacts.filter(
                  (c) =>
                    c.roleType === (role as ContactRoleType) &&
                    c.influence === (inf as Influence),
                );
                return (
                  <td key={inf} className="py-2 text-center">
                    {matches.length > 0 ? (
                      <span
                        title={matches.map((m) => m.name).join(", ")}
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          inf === "High"
                            ? "bg-danger-soft text-danger"
                            : inf === "Medium"
                              ? "bg-warn-soft text-warn"
                              : "bg-sunken text-ink-soft",
                        )}
                      >
                        {matches.length}
                      </span>
                    ) : (
                      <span className="text-ink-faint">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
