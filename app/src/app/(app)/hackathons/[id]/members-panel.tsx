"use client";

import { Avatar } from "@/components/ui/avatar";
import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import type { ActionError } from "@/lib/actions/guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { inviteMember, removeMember } from "@/lib/actions/hackathon";
import { MEMBERSHIP_ROLES, type MembershipRole } from "@/lib/schemas";
import { UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

export function MembersPanel({
  hackathonId,
  members,
  currentUserId,
  canManage,
}: {
  hackathonId: string;
  members: Member[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (adding) document.getElementById("invite-email")?.focus();
  }, [adding]);

  function onInvite(formData: FormData) {
    setError(null);
    const email = String(formData.get("email") ?? "");
    const role = String(formData.get("role") ?? "Contributor") as MembershipRole;

    start(async () => {
      const result = await inviteMember(hackathonId, email, role);
      if (result.ok) {
        setAdding(false);
        setNotice("Workspace access saved. No email was sent; share the workspace link with the member.");
        router.refresh();
      } else {
        setError(result);
      }
    });
  }

  function onRemove(userId: string) {
    if (!window.confirm("Remove this member's access to the workspace?")) return;
    setError(null);
    start(async () => {
      const result = await removeMember(hackathonId, userId);
      if (result.ok) router.refresh();
      else setError(result);
    });
  }

  function onRoleChange(member: Member, role: MembershipRole) {
    if (role === member.role) return;
    if (!window.confirm(`Change ${member.name}'s workspace role to ${role}?`)) return;
    setError(null);
    setNotice(null);
    start(async () => {
      const result = await inviteMember(hackathonId, member.email, role);
      if (result.ok) {
        setNotice(`${member.name}'s role was updated.`);
        router.refresh();
      } else setError(result);
    });
  }

  return (
    <Card>
      <CardHeader
        title="Members"
        subtitle="Access is scoped per hackathon"
        action={
          canManage && !adding ? (
            <Button size="sm" disabled={pending} onClick={() => { setError(null); setNotice(null); setAdding(true); }}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Invite
            </Button>
          ) : null
        }
      />

      {adding && canManage ? (
        <form
          onSubmit={(event) => { event.preventDefault(); onInvite(new FormData(event.currentTarget)); }}
          aria-busy={pending}
          className="mb-4 space-y-3 rounded-[var(--radius-inner)] border border-line bg-surface-muted p-4"
        >
          <fieldset disabled={pending} className="min-w-0 space-y-3">
          <p className="text-xs text-ink-soft">
            This records workspace access; it does not send email or set up sign-in.
            Development sign-in accepts only the built-in demo identities.
          </p>
          <Field label="Email" htmlFor="invite-email" required error={error?.fieldErrors?.email?.[0]}>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="colleague@microsoft.com"
            />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select id="invite-role" name="role" defaultValue="Contributor">
              {MEMBERSHIP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              {pending ? "Inviting…" : "Invite"}
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

      <ActionFeedback error={error} onRefresh={() => { setError(null); router.refresh(); }} />
      {notice ? <p role="status" className="mb-3 text-xs text-ink-soft">{notice}</p> : null}

      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3">
            <Avatar name={m.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {m.name}
                {m.userId === currentUserId ? (
                  <span className="ml-1.5 text-xs font-normal text-ink-faint">
                    (you)
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-ink-faint">
                {m.email}
              </span>
            </span>
            {canManage ? (
              <Select aria-label={`Role for ${m.name}`} value={m.role} disabled={pending || adding}
                className="h-8 w-[122px] py-0 text-xs"
                onChange={(event) => onRoleChange(m, event.target.value as MembershipRole)}>
                {MEMBERSHIP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </Select>
            ) : <Badge tone={m.role === "Owner" ? "accent" : "neutral"}>{m.role}</Badge>}
            {canManage && m.userId !== currentUserId ? (
              <button
                type="button"
                aria-label={`Remove ${m.name}`}
                onClick={() => onRemove(m.userId)}
                disabled={pending || adding}
                className="rounded-full p-1 text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
