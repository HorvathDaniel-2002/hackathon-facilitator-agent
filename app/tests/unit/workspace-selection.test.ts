import { describe, expect, it } from "vitest";
import { selectDashboardHackathon } from "@/components/layout/workspace-selection";

const workspaces = [
  { id: "archived", status: "Archived" },
  { id: "first", status: "Planning" },
  { id: "second", status: "Live" },
];

describe("dashboard workspace selection", () => {
  it("uses the first non-archived workspace only when selection is absent", () => {
    expect(selectDashboardHackathon(workspaces, undefined)?.id).toBe("first");
    expect(selectDashboardHackathon(workspaces, null)?.id).toBe("first");
  });

  it("preserves explicitly selected workspaces, including archived ones", () => {
    expect(selectDashboardHackathon(workspaces, "second")?.id).toBe("second");
    expect(selectDashboardHackathon(workspaces, "archived")?.id).toBe("archived");
  });

  it.each(["missing", "", ["first", "second"]])("never silently switches on an invalid explicit selection %j", (selected) => {
    expect(selectDashboardHackathon(workspaces, selected)).toBeNull();
  });

  it("handles empty portfolios and all-archived portfolios", () => {
    expect(selectDashboardHackathon([], undefined)).toBeNull();
    expect(selectDashboardHackathon([workspaces[0]], undefined)?.id).toBe("archived");
  });
});
