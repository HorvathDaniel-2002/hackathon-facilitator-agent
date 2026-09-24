import { Badge, humanize, STATUS_TONE } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DefinitionRow } from "@/components/ui/empty-state";
import { canEdit, getUserRole, requireUser } from "@/lib/auth";
import { getHackathon } from "@/lib/queries";
import { notFound } from "next/navigation";
import { MembersPanel } from "../members-panel";
import { WorkspaceEditor } from "./workspace-editor";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const workspace = await getHackathon(user.id, id);
  if (!workspace) notFound();
  const role = await getUserRole(user.id, id);
  const editable = canEdit(role) && (workspace.status !== "Archived" || role === "Owner");

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="Workspace settings" subtitle="Name, customer and workspace lifecycle"
          action={<div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[workspace.status] ?? "neutral"}>{humanize(workspace.status)}</Badge>
            {editable ? <WorkspaceEditor hackathonId={id} canArchive={role === "Owner"} version={workspace.version}
              initial={{ name: workspace.name, customer: workspace.customer, status: workspace.status }} /> : null}
          </div>} />
        <dl className="divide-y divide-line">
          <DefinitionRow label="Name" value={workspace.name} />
          <DefinitionRow label="Customer" value={workspace.customer} />
          <DefinitionRow label="Status" value={workspace.status} />
        </dl>
        <p className="mt-5 text-sm text-ink-soft">
          Readiness evidence is required before moving to Ready or Running. Close every use case with a complete handoff before closing the workspace.
          Reopen closed workspaces to Planning before editing scope; only an Owner can archive or restore.
          Changing the name or customer requires readiness evidence to be reviewed again.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <LinkButton size="sm" href={`/hackathons/${id}/usecases`}>Use cases</LinkButton>
          <LinkButton size="sm" href={`/hackathons/${id}/runbook`}>Review readiness</LinkButton>
        </div>
        <p className="mt-5 rounded-[var(--radius-inner)] border border-warn/25 bg-warn-soft px-4 py-3 text-xs text-warn">
          <strong className="font-semibold">Dummy data only.</strong> Use anonymized, synthetic or test data in this workspace.
        </p>
      </Card>
      <MembersPanel hackathonId={id} currentUserId={user.id} canManage={role === "Owner"}
        members={workspace.memberships.map((member) => ({
          id: member.id, userId: member.userId, name: member.user.name, email: member.user.email, role: member.role,
        }))} />
    </div>
  );
}
