"use server";

import { revalidatePath } from "next/cache";
import { requireId, requireVersion, withAccess, validationFailure, workspaceTransaction } from "@/lib/actions/guard";
import { ConcurrencyConflictError } from "@/lib/db";
import { runbookInputSchema } from "@/lib/domain/runbook";
import { getRunbookTemplate } from "@/lib/runbook";

export const saveRunbookCheck = withAccess("Contributor", async (
  ctx, hackathonId: string, templateId: string, raw: unknown, expectedVersion: number,
) => {
  requireId(templateId, "templateId");
  const input = runbookInputSchema.safeParse(raw);
  if (!input.success) validationFailure(input.error.flatten().fieldErrors);
  if (expectedVersion !== -1) requireVersion(expectedVersion);
  const { template } = getRunbookTemplate();
  const check = template.checks.find((item) => item.id === templateId);
  if (!check) throw new Error("Unknown runbook check. Reload the page.");
  if (check.gate !== "None" && input.data.status === "NotApplicable") {
    throw new Error("Required start/closure checks cannot be waived. Record an approved fallback as evidence, or keep the item blocked.");
  }
  const data = {
    ...input.data,
    dueDate: input.data.dueDate ? new Date(`${input.data.dueDate}T12:00:00Z`) : null,
    templateVersion: template.version,
    updatedBy: ctx.userId,
  };
  await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const existing = await tx.runbookCheck.findUnique({ where: { hackathonId_templateId: { hackathonId, templateId } } });
    if (expectedVersion === -1) {
      if (existing) throw new ConcurrencyConflictError("This runbook check");
      await tx.runbookCheck.create({ data: { hackathonId, templateId, ...data } });
    } else {
      const result = await tx.runbookCheck.updateMany({
        where: { hackathonId, templateId, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count) throw new ConcurrencyConflictError("This runbook check");
    }
    if (check.gate === "Start" && input.data.status !== "Done") {
      await tx.hackathon.updateMany({ where: { id: hackathonId, status: "Ready" }, data: { status: "Planning" } });
    }
  }, { allowClosed: check.gate === "None" && check.stage === "Follow-up" });
  revalidatePath(`/hackathons/${hackathonId}/runbook`);
  revalidatePath(`/hackathons/${hackathonId}`);
  revalidatePath("/dashboard");
  return { saved: true };
});
