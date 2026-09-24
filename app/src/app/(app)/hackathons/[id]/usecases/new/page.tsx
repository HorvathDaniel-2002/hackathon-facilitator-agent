import { UseCaseCanvasForm } from "@/components/usecase-canvas-form";
import { assertAccess, requireUser } from "@/lib/auth";
import { getHackathon } from "@/lib/queries";
import { isWorkspaceFrozen } from "@/components/workspace-state";
import { Card, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { notFound } from "next/navigation";

export default async function NewUseCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await assertAccess(user.id, id, "Contributor");
  const hackathon = await getHackathon(user.id, id);
  if (!hackathon) notFound();
  if (isWorkspaceFrozen(hackathon.status)) {
    return <Card>
      <CardHeader title="Use case creation paused" subtitle="Reopen or restore this workspace to Planning before adding use cases." />
      <LinkButton href={`/hackathons/${id}/settings`}>Open settings</LinkButton>
    </Card>;
  }

  return <UseCaseCanvasForm hackathonId={id} />;
}
