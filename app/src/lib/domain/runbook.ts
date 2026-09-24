import { z } from "zod";

export const RUNBOOK_STATUSES = ["NotStarted", "InProgress", "Blocked", "Done", "NotApplicable"] as const;
export const runbookInputSchema = z.object({
  status: z.enum(RUNBOOK_STATUSES),
  owner: z.string().trim().max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  evidence: z.string().trim().max(6000),
}).superRefine((value, ctx) => {
  const date = new Date(`${value.dueDate}T12:00:00Z`);
  if (value.dueDate && (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.dueDate)) {
    ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Use a real calendar date." });
  }
  if (["Done", "NotApplicable"].includes(value.status)) {
    for (const key of ["owner", "dueDate", "evidence"] as const) {
      if (!value[key]) ctx.addIssue({ code: "custom", path: [key], message: "Completion requires an owner, date and evidence or rationale." });
    }
  }
});

export const runbookTemplateSchema = z.object({
  version: z.string().min(1),
  notice: z.string(),
  checks: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    stage: z.enum(["Preparation", "Technical readiness", "Day 0", "During event", "Follow-up"]),
    title: z.string().min(1),
    ownerRole: z.string().min(1),
    offsetDays: z.number().int(),
    gate: z.enum(["Start", "Close", "None"]),
    sourceIds: z.array(z.string()).min(1),
    instruction: z.string().min(1),
  })).min(1),
});

export type RunbookTemplate = z.infer<typeof runbookTemplateSchema>;
export type RunbookItem = RunbookTemplate["checks"][number] & {
  status: string;
  owner: string;
  dueDate: string;
  evidence: string;
  version: number;
  templateVersion: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

export function isRunbookItemComplete(item: RunbookItem, templateVersion: string) {
  return item.templateVersion === templateVersion &&
    runbookInputSchema.safeParse(item).success &&
    (item.status === "Done" || (item.gate === "None" && item.status === "NotApplicable"));
}

export function missingRunbookChecks(items: RunbookItem[], templateVersion: string, gate: "Start" | "Close") {
  return items.filter((item) => item.gate === gate && !isRunbookItemComplete(item, templateVersion));
}
