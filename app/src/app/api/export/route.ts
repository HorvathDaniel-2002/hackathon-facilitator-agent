import { z } from "zod";
import { requireUser, assertAccess, AccessDeniedError } from "@/lib/auth";
import { getHackathon, listUseCases } from "@/lib/queries";
import { readRunbook } from "@/lib/runbook";
import { exportHtml, exportText, toCsv } from "@/lib/exports";
import { apiFailure } from "@/lib/api-errors";
import { DELIVERY_LABELS, entityIdSchema, PROGRESS_LABELS } from "@/lib/schemas";
import { toKanbanCase } from "@/lib/kanban";

const requestSchema = z.object({
  hackathonId: entityIdSchema,
  kind: z.enum(["portfolio", "readout", "runbook"]),
  format: z.enum(["markdown", "csv", "html"]).default("markdown"),
});

export async function GET(request: Request) {
  const parsed = requestSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid export request." }, { status: 400 });
  const { hackathonId, kind, format } = parsed.data;
  if (format === "csv" && kind !== "portfolio") return Response.json({ error: "CSV is available for portfolios." }, { status: 400 });
  let user;
  try { user = await requireUser(); }
  catch (error) {
    if (error instanceof AccessDeniedError) return Response.json({ error: "Sign in before exporting workspace data." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return apiFailure(error, "export-auth");
  }
  try {
  try { await assertAccess(user.id, hackathonId, "Viewer"); }
  catch (error) {
    if (error instanceof AccessDeniedError) return Response.json({ error: "Workspace not found." }, { status: 404 });
    throw error;
  }
  const event = await getHackathon(user.id, hackathonId);
  if (!event) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const cases = await listUseCases(hackathonId);
  const runbook = await readRunbook(hackathonId);
  const prefix = `${kind}-${hackathonId}`;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
  };
  if (format === "csv") {
    const rows: unknown[][] = [[
      "Code", "Title", "Business owner", "Assessment status", "Evaluation applicability", "Current qualification",
      "Snapshot value", "Snapshot feasibility", "Snapshot data readiness", "Snapshot reuse",
      "Snapshot weighted score", "Snapshot band", "Snapshot platform", "Evaluation model", "Methodology", "Human edited", "Snapshot failed gates",
      "Portfolio decision", "Technical owner", "Delivery owner", "Next engagement", "Next action", "Next date",
      "Progress stage", "Delivery route", "CAF status", "CAF reference", "CAF submitted on", "Production reference",
    ], ...cases.map((uc) => {
      const e = uc.evaluation;
      const workflow = toKanbanCase(uc).handoff;
      const current = Boolean(e && uc.evaluationIsCurrent);
      const qualification = !current ? "Unverified - re-evaluate" : e?.gateResults.some((g) => !g.pass) ? "Blocked" : "Gates passed";
      return [uc.code, uc.title, workflow.businessOwner, uc.status,
        !e ? "Not evaluated" : current ? "Current" : "Historical - source evidence changed or unavailable",
        qualification, e?.valueScore, e?.feasibilityScore, e?.dataReadinessScore,
        e?.reusabilityScore, e?.weightedScore, e?.priorityBand, e?.recommendedPlatform, e?.model, e?.methodologyVersion,
        e?.isEdited ? "Yes" : "No", e?.gateResults.filter((g) => !g.pass).map((g) => g.label).join("; "),
        uc.handoff?.portfolioDecision, uc.handoff?.technicalOwner, uc.handoff?.deliveryOwner, uc.handoff?.nextEngagement,
        uc.handoff?.nextMilestone, uc.handoff?.nextMilestoneDate?.toISOString().slice(0, 10),
        PROGRESS_LABELS[workflow.progressStage], DELIVERY_LABELS[workflow.deliveryRoute],
        workflow.cafStatus === "Submitted" ? "Submitted" : "Not submitted", workflow.cafReference, workflow.cafSubmittedOn, workflow.productionReference];
    })];
    return new Response(toCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${prefix}.csv"` } });
  }
  const lines = [
    `# ${exportText(event.name)} - ${kind}`,
    `Generated: ${new Date().toISOString()}`,
    "PLANNING ARTIFACT: not an approval, funding commitment or production certification. Apply organizational sensitivity labels before sharing.",
    `Workspace status: ${event.status}`,
    `Guidance reviewed: ${runbook.sources.reviewedAt}`,
    "",
  ];
  const field = (label: string, value: unknown) => lines.push(`${label}: ${exportText(value)}`, "");
  field("Customer", event.customer);
  if (kind === "runbook") {
    for (const check of runbook.items) {
      lines.push(`## ${check.stage} - ${check.title}`);
      field("Status", check.status); field("Owner", check.owner); field("Due date", check.dueDate);
      field("Evidence / blocker", check.evidence); field("Last recorded", check.updatedAt);
      field("Template version recorded", check.templateVersion); field("Instruction", check.instruction);
      field("Template applicability", check.templateVersion === runbook.template.version ? "Current" : "Unverified - review against the current template");
    }
  } else {
    for (const uc of cases) {
      lines.push(`## ${uc.code} - ${exportText(uc.title)}`);
      const workflow = toKanbanCase(uc).handoff;
      field("Assessment status", uc.status); field("Problem / desired outcome", uc.desiredOutcome); field("Metric / target", uc.successMetric);
      field("Progress stage", PROGRESS_LABELS[workflow.progressStage]); field("Delivery route", DELIVERY_LABELS[workflow.deliveryRoute]);
      field("CAF status", workflow.cafStatus === "Submitted" ? "Submitted" : "Not submitted");
      field("CAF reference", workflow.cafReference); field("CAF submitted on", workflow.cafSubmittedOn);
      field("Production reference", workflow.productionReference);
      field("What was built", uc.handoff?.whatWasBuilt); field("Demo evidence / blocker", uc.handoff?.demoOrBlocker);
      field("Outcome observed (not a model forecast)", uc.handoff?.outcomeDemonstrated);
      const current = Boolean(uc.evaluation && uc.evaluationIsCurrent);
      field("Evaluation applicability", !uc.evaluation ? "Not evaluated" : current ? "Current" : "Historical - source evidence changed or unavailable. Re-evaluation required.");
      field("Evaluation snapshot (not current readiness if historical)", uc.evaluation ? `${uc.evaluation.weightedScore}/5 ${uc.evaluation.recommendedPlatform} (${uc.evaluation.model}; ${uc.evaluation.methodologyVersion})` : "Not evaluated");
      field("Snapshot failed gates", uc.evaluation?.gateResults.filter((g) => !g.pass).map((g) => `${g.label}: ${g.reason}`).join("; "));
      field("Current qualification", !current ? "Unverified - re-evaluate" : uc.evaluation?.gateResults.some((g) => !g.pass) ? "Blocked" : "Gates passed");
      field("Portfolio decision", uc.handoff?.portfolioDecision);
      field("Business owner", workflow.businessOwner);
      field("Technical owner", uc.handoff?.technicalOwner); field("Delivery owner", uc.handoff?.deliveryOwner);
      field("Next engagement (confirm eligibility)", uc.handoff?.nextEngagement);
      field("Next action", uc.handoff?.nextMilestone);
      field("Next action date", uc.handoff?.nextMilestoneDate?.toISOString().slice(0, 10)); field("Remaining gaps", uc.handoff?.gaps);
    }
  }
  lines.push("## Guidance and scope", runbook.template.notice);
  runbook.sources.sources.forEach((s) => lines.push(`- ${s.title}: ${s.url}`));
  const markdown = lines.join("\n");
  if (format === "html") {
    return new Response(exportHtml(event.name, markdown), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
  return new Response(markdown, { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${prefix}.md"` } });
  } catch (error) {
    if (error instanceof AccessDeniedError) return Response.json({ error: "Workspace access changed. Reload and check your membership." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    return apiFailure(error, "export");
  }
}
