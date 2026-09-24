import { KanbanBoard } from "@/components/kanban-board";
import { canEdit, getUserRole, requireUser } from "@/lib/auth";
import { toKanbanCase } from "@/lib/kanban";
import { getHackathon, listUseCases } from "@/lib/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export default async function UseCasesPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const hackathon = await getHackathon(user.id, id);
  if (!hackathon) notFound();
  const role = await getUserRole(user.id, id);
  const useCases = await listUseCases(id);

  return (
    <Suspense fallback={<p className="text-sm text-ink-soft">Loading use case board…</p>}>
      <KanbanBoard hackathonId={id} eventStatus={hackathon.status}
        editable={canEdit(role)} cases={useCases.map(toKanbanCase)} />
    </Suspense>
  );
}
