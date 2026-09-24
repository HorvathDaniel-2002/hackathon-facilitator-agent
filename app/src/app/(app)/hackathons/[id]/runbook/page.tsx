import { notFound } from "next/navigation";
import { requireUser, canEdit } from "@/lib/auth";
import { getHackathon } from "@/lib/queries";
import { readRunbook } from "@/lib/runbook";
import { RunbookBoard } from "./runbook-board";

export default async function RunbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const event = await getHackathon(user.id, id);
  if (!event) notFound();
  const role = event.memberships.find((member) => member.userId === user.id)?.role;
  const runbook = await readRunbook(id);
  return <RunbookBoard hackathonId={id} eventStatus={event.status} {...runbook} editable={canEdit(role === "Owner" || role === "Contributor" ? role : "Viewer")} />;
}
