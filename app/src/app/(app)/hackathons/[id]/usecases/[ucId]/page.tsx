import { BuildGuidePanel } from "@/components/build-guide-panel";
import { EvaluatorPanel } from "@/components/evaluator-panel";
import { Badge, humanize, STATUS_TONE } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DefinitionRow, SectionLabel } from "@/components/ui/empty-state";
import { UseCaseTeamPanel } from "@/components/usecase-team-panel";
import { UseCaseActions } from "@/components/usecase-actions";
import { UseCaseConfirmations } from "@/components/usecase-confirmations";
import { AI_PROVIDER } from "@/lib/ai/provider";
import { canEdit, getUserRole, requireUser } from "@/lib/auth";
import { getHackathon, getUseCase, listContacts } from "@/lib/queries";
import type { Platform } from "@/lib/schemas";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function UseCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; ucId: string }>;
}) {
  const { id, ucId } = await params;
  const user = await requireUser();

  const hackathon = await getHackathon(user.id, id);
  if (!hackathon) notFound();

  const useCase = await getUseCase(id, ucId);
  if (!useCase) notFound();

  const role = await getUserRole(user.id, id);
  const frozen = ["Closed", "Archived"].includes(hackathon.status);
  const editable = canEdit(role) && !frozen;
  const contacts = await listContacts(id);

  const platform = (useCase.evaluation?.recommendedPlatform ?? null) as
    | Platform
    | null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/hackathons/${id}/usecases`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All use cases
        </Link>
        <LinkButton size="sm" href={`/hackathons/${id}/usecases?case=${encodeURIComponent(ucId)}`}>Open on board</LinkButton>
        <LinkButton size="sm" href={`/hackathons/${id}/handoff?case=${encodeURIComponent(ucId)}`}>Handoff record</LinkButton>
      </div>
      {frozen && <p role="status" className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
        This event is {hackathon.status.toLowerCase()}. Saved evaluations and guides remain readable.
        Reopen or restore the event to Planning in <Link href={`/hackathons/${id}/settings`} className="underline">Settings</Link> before changing case content.
      </p>}
      {useCase.evaluation && !useCase.evaluationIsCurrent ? (
        <p role="status" className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          This evaluation is historical: its evidence is missing or the canvas, confirmations or team changed.
          Re-run the evaluator before relying on these scores, advancing the case or generating a new guide.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <EvaluatorPanel
            hackathonId={id}
            useCaseId={ucId}
            evaluation={useCase.evaluation}
            history={useCase.evaluationHistory}
            editable={editable}
            aiProvider={AI_PROVIDER}
          />

          <BuildGuidePanel
            hackathonId={id}
            useCaseId={ucId}
            useCaseCode={useCase.code}
            guides={useCase.buildGuides}
            platform={platform}
            editable={editable}
            hasEvaluation={Boolean(useCase.evaluation)}
            evaluationIsCurrent={useCase.evaluationIsCurrent}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title={`${useCase.code} · ${useCase.title}`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[useCase.status] ?? "neutral"}>
                    {humanize(useCase.status)}
                  </Badge>
                  {editable ? (
                    <LinkButton
                      size="sm"
                      href={`/hackathons/${id}/usecases/${ucId}/edit`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </LinkButton>
                  ) : null}
                </div>
              }
            />

            <dl className="divide-y divide-line">
              <DefinitionRow label="Description" value={useCase.description} />
              <DefinitionRow
                label="Business owner"
                value={
                  useCase.businessOwner ?? (
                    <span className="text-danger">Not assigned</span>
                  )
                }
              />
              <DefinitionRow label="Target user" value={useCase.targetUser} />
              <DefinitionRow
                label="Current process"
                value={useCase.currentProcess}
              />
              <DefinitionRow label="Pain points" value={useCase.painPoints} />
              <DefinitionRow
                label="Desired outcome"
                value={useCase.desiredOutcome}
              />
              <DefinitionRow
                label="Data sources"
                value={
                  useCase.dataSources ?? (
                    <span className="text-danger">
                      None recorded — fails a hard gate
                    </span>
                  )
                }
              />
              <DefinitionRow
                label="Systems & connectors"
                value={useCase.systemsConnectors}
              />
              <DefinitionRow
                label="Agent output or action"
                value={useCase.agentOutput}
              />
              <DefinitionRow
                label="Human approval point"
                value={useCase.humanApprovalPoint}
              />
              <DefinitionRow
                label="Success metric"
                value={useCase.successMetric}
              />
              <DefinitionRow
                label="Smallest demoable slice"
                value={
                  useCase.smallestSlice ?? (
                    <span className="text-danger">
                      Not defined — fails a hard gate
                    </span>
                  )
                }
              />
              <DefinitionRow label="Constraints" value={useCase.constraints} />
              <DefinitionRow
                label="Reuse potential"
                value={useCase.reusePotential}
              />
              <DefinitionRow
                label="Production vision"
                value={useCase.productionVision}
              />
            </dl>
            {editable ? <UseCaseActions hackathonId={id} useCaseId={ucId} version={useCase.version} title={useCase.title} owner={role === "Owner"} /> : null}
          </Card>

          <UseCaseTeamPanel hackathonId={id} useCaseId={ucId} version={useCase.version} editable={editable}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name, roleType: c.roleType }))}
            members={useCase.teamMembers.map((tm) => ({
              contact: { id: tm.contact.id, name: tm.contact.name, roleType: tm.contact.roleType },
              party: tm.party, responsibility: tm.responsibility,
            }))} />
          <UseCaseConfirmations hackathonId={id} useCaseId={ucId} version={useCase.version}
            sampleDataApproved={useCase.sampleDataApproved}
            processOwnerConfirmed={useCase.processOwnerConfirmed} editable={editable} />

          {useCase.handoff ? (
            <Card>
              <CardHeader title="Handoff" subtitle="Exit package" />
              <SectionLabel className="mb-2">Portfolio decision</SectionLabel>
              <Badge tone="accent">
                {useCase.handoff.portfolioDecision
                  ? humanize(useCase.handoff.portfolioDecision)
                  : "Not decided"}
              </Badge>
              <dl className="mt-4 divide-y divide-line">
                <DefinitionRow
                  label="Next engagement"
                  value={useCase.handoff.nextEngagement}
                />
                <DefinitionRow
                  label="Next action"
                  value={useCase.handoff.nextMilestone}
                />
                <DefinitionRow label="Next action date" value={formatDate(useCase.handoff.nextMilestoneDate)} />
              </dl>
              <LinkButton
                size="sm"
                href={`/hackathons/${id}/handoff?case=${encodeURIComponent(ucId)}`}
                className="mt-4"
              >
                Open handoff
              </LinkButton>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
