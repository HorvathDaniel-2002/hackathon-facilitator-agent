import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runbookTemplateSchema, missingRunbookChecks, type RunbookItem } from "@/lib/domain/runbook";

const sourceSchema = z.object({
  version: z.string(),
  reviewedAt: z.string(),
  scope: z.string(),
  sources: z.array(z.object({
    id: z.string(), title: z.string(), url: z.url(), supports: z.string(),
  })),
});

export function getRunbookTemplate() {
  const template = runbookTemplateSchema.parse(parse(fs.readFileSync(path.join(process.cwd(), "methodology", "runbook.yaml"), "utf8")));
  const sources = sourceSchema.parse(parse(fs.readFileSync(path.join(process.cwd(), "methodology", "sources.yaml"), "utf8")));
  const ids = new Set(sources.sources.map((source) => source.id));
  if (ids.size !== sources.sources.length || new Set(template.checks.map((check) => check.id)).size !== template.checks.length) {
    throw new Error("Methodology contains duplicate source or checklist IDs.");
  }
  for (const check of template.checks) {
    if (check.sourceIds.some((id) => !ids.has(id))) throw new Error(`Unresolved source for ${check.id}`);
  }
  return { template, sources };
}

// Authorization is required by the caller; also used inside guarded transitions.
export async function readRunbook(hackathonId: string, db: Pick<Prisma.TransactionClient, "hackathon" | "runbookCheck"> = prisma) {
  const { template, sources } = getRunbookTemplate();
  await db.hackathon.findUniqueOrThrow({ where: { id: hackathonId }, select: { id: true } });
  const saved = await db.runbookCheck.findMany({ where: { hackathonId } });
  const items: RunbookItem[] = template.checks.map((check) => {
    const record = saved.find((row) => row.templateId === check.id);
    return {
      ...check,
      status: record?.status ?? "NotStarted",
      owner: record?.owner ?? "",
      dueDate: record?.dueDate?.toISOString().slice(0, 10) ?? "",
      evidence: record?.evidence ?? "",
      version: record?.version ?? -1,
      templateVersion: record?.templateVersion ?? "",
      updatedBy: record?.updatedBy ?? null,
      updatedAt: record?.updatedAt.toISOString() ?? null,
    };
  });
  return { items, template, sources };
}

/** Keep recorded evidence, but require it to be reviewed for the changed scope. */
export async function invalidateRunbookChecks(
  hackathonId: string,
  gate: "Start" | "Close" | "All",
  db: Prisma.TransactionClient,
) {
  const { template } = getRunbookTemplate();
  await db.runbookCheck.updateMany({
    where: {
      hackathonId,
      templateId: { in: template.checks.filter((check) => gate === "All" || check.gate === gate).map((check) => check.id) },
      status: { in: ["Done", "NotApplicable"] },
      templateVersion: { not: "" },
    },
    data: { templateVersion: "", version: { increment: 1 } },
  });
  if (gate !== "Close") {
    await db.hackathon.updateMany({
      where: { id: hackathonId, status: "Ready" }, data: { status: "Planning" },
    });
  }
}

export async function assertEventTransition(hackathonId: string, status: string, db: Pick<Prisma.TransactionClient, "hackathon" | "runbookCheck"> = prisma) {
  if (!["Ready", "Running", "Closed"].includes(status)) return;
  const { items, template } = await readRunbook(hackathonId, db);
  const gate = status === "Closed" ? "Close" : "Start";
  const missing = missingRunbookChecks(items, template.version, gate);
  if (missing.length) {
    throw new Error(`Cannot mark event ${status}. Complete ${missing.length} required ${gate.toLowerCase()} checks in the facilitator runbook: ${missing.map((item) => item.title).join("; ")}`);
  }
}
