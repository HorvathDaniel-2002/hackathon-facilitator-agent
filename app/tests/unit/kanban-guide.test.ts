import { describe, expect, it } from "vitest";
import { buildGuidePrompt } from "@/lib/ai/guide";

describe("guide generation after Charter removal", () => {
  it("does not invent event timing when workspace date/format fields no longer exist", () => {
    const prompt = buildGuidePrompt({
      useCase: { code: "UC-01", title: "Synthetic scoped case" },
      platform: "CopilotStudio",
    });
    expect(prompt.user).toContain("Event duration is not specified");
    expect(prompt.user).toContain("do not invent event dates or a milestone plan");
    expect(prompt.user).not.toContain("Event format: 2-day");
  });
  it("can still describe an explicitly provided reusable guide format", () => {
    const prompt = buildGuidePrompt({
      useCase: { code: "UC-01", title: "Synthetic scoped case" },
      platform: "CopilotStudio", format: "3day",
    });
    expect(prompt.user).toContain("Event format: 3-day hackathon");
  });
});
