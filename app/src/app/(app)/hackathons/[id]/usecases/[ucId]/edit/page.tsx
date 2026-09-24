import { UseCaseCanvasForm } from "@/components/usecase-canvas-form";
import { assertAccess, requireUser } from "@/lib/auth";
import { getHackathon, getUseCase } from "@/lib/queries";
import { isWorkspaceFrozen } from "@/components/workspace-state";
import { Card, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { notFound } from "next/navigation";

export default async function EditUseCasePage({
  params,
}: {
  params: Promise<{ id: string; ucId: string }>;
}) {
  const { id, ucId } = await params;
  const user = await requireUser();
  await assertAccess(user.id, id, "Contributor");

  const useCase = await getUseCase(id, ucId);
  if (!useCase) notFound();
  const hackathon = await getHackathon(user.id, id);
  if (!hackathon) notFound();
  if (isWorkspaceFrozen(hackathon.status)) {
    return <Card>
      <CardHeader title="Use case editing paused" subtitle="Reopen or restore this workspace to Planning before changing use-case scope. Closed-event follow-up can still be recorded in Handoff." />
      <LinkButton href={`/hackathons/${id}/settings`}>Open settings</LinkButton>
    </Card>;
  }

  return (
    <UseCaseCanvasForm
      hackathonId={id}
      useCaseId={ucId}
      version={useCase.version}
      initial={{
        title: useCase.title,
        description: useCase.description ?? "",
        businessOwner: useCase.businessOwner ?? "",
        targetUser: useCase.targetUser ?? "",
        currentProcess: useCase.currentProcess ?? "",
        painPoints: useCase.painPoints ?? "",
        desiredOutcome: useCase.desiredOutcome ?? "",
        dataSources: useCase.dataSources ?? "",
        systemsConnectors: useCase.systemsConnectors ?? "",
        agentOutput: useCase.agentOutput ?? "",
        humanApprovalPoint: useCase.humanApprovalPoint ?? "",
        successMetric: useCase.successMetric ?? "",
        constraints: useCase.constraints ?? "",
        reusePotential: useCase.reusePotential ?? "",
        smallestSlice: useCase.smallestSlice ?? "",
        productionVision: useCase.productionVision ?? "",
        manualImpact: useCase.manualImpact ?? "",
        status: useCase.status,
      }}
    />
  );
}
