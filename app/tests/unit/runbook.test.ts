import { describe, expect, it } from "vitest";
import { getRunbookTemplate } from "@/lib/runbook";
import { runbookInputSchema, isRunbookItemComplete, missingRunbookChecks, type RunbookItem } from "@/lib/domain/runbook";
import { csvCell, toCsv, exportHtml } from "@/lib/exports";

const { template, sources } = getRunbookTemplate();
function item(overrides: Partial<RunbookItem> = {}): RunbookItem {
  return { ...template.checks[0], status: "Done", owner: "Alex", dueDate: "2026-09-15", evidence: "Approval reference 42",
    version: 0, templateVersion: template.version, updatedBy: "test-user", updatedAt: null, ...overrides };
}

describe("grounded runbook", () => {
  it("resolves every recommendation to a reviewed Microsoft source", () => {
    const ids = new Set(sources.sources.map((s) => s.id));
    expect(template.checks.length).toBeGreaterThan(15);
    expect(template.checks.every((c) => c.sourceIds.every((id) => ids.has(id)))).toBe(true);
    expect(sources.sources.every((s) => ["learn.microsoft.com", "azure.microsoft.com"].includes(new URL(s.url).hostname))).toBe(true);
  });
  it("distinguishes project rules from corporate approvals", () => {
    expect(template.notice).toContain("not an official Microsoft");
    expect(sources.scope).toContain("not Microsoft corporate");
  });
  it("requires evidence, owner and real date for completed checks", () => {
    expect(runbookInputSchema.safeParse({ status: "Done", owner: "", dueDate: "", evidence: "" }).success).toBe(false);
    expect(runbookInputSchema.safeParse({ status: "Done", owner: "A", dueDate: "2026-02-30", evidence: "yes" }).success).toBe(false);
    expect(runbookInputSchema.safeParse({ status: "Done", owner: "A", dueDate: "2026-00-99", evidence: "yes" }).success).toBe(false);
    expect(runbookInputSchema.safeParse({ status: "Blocked", owner: "", dueDate: "", evidence: "Awaiting approval" }).success).toBe(true);
  });
  it("cannot waive a required gate or carry completion across methodology versions", () => {
    expect(isRunbookItemComplete(item(), template.version)).toBe(true);
    expect(isRunbookItemComplete(item({ status: "NotApplicable" }), template.version)).toBe(false);
    expect(isRunbookItemComplete(item({ gate: "None", status: "NotApplicable" }), template.version)).toBe(true);
    expect(isRunbookItemComplete(item({ templateVersion: "old" }), template.version)).toBe(false);
    expect(missingRunbookChecks([item({ status: "Blocked" })], template.version, "Start")).toHaveLength(1);
  });
});

describe("safe portable exports", () => {
  it("neutralizes spreadsheet formulas including leading whitespace", () => {
    for (const value of ["=HYPERLINK(\"x\")", " +1", "\t@SUM(1)", "\r-1"]) expect(csvCell(value)).toContain("'");
    expect(csvCell(3.7)).toBe('"3.7"');
    expect(csvCell('A,"B"\nC')).toBe('"A,""B""\nC"');
    expect(toCsv([["Name"], ["Alex"]])).toBe('\uFEFF"Name"\r\n"Alex"\r\n');
  });
  it("renders input as literal text, not executable markup", () => {
    const html = exportHtml("<script>alert(1)</script>", '<img src=x onerror="bad()">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img ");
    expect(html).toContain("&lt;img");
  });
});
