import { describe, expect, it } from "vitest";
import {
  canClose,
  missingClosureRequirements,
  recommendNextEngagement,
} from "@/lib/domain/handoff";
import { getMethodology } from "@/lib/methodology";
import type { GateResult } from "@/lib/schemas";

const { handoff, gates } = getMethodology();
const passedGates: GateResult[] = gates.gates.map((g) => ({ gate: g.id, label: g.label, kind: g.kind, pass: true }));

describe("recommendNextEngagement", () => {
  it("archives a stopped case without routing it anywhere", () => {
    const result = recommendNextEngagement({ decision: "Stop" }, handoff);
    expect(result?.route).toBe("Stop");
  });

  it("routes a customer-led decision to the customer-led motion", () => {
    const result = recommendNextEngagement(
      { decision: "CustomerLed", platform: "CopilotStudio" },
      handoff,
    );
    expect(result?.route).toBe("CustomerLed");
  });

  it("routes a partner-led decision to the partner pilot", () => {
    const result = recommendNextEngagement(
      { decision: "PartnerLed", platform: "Hybrid" },
      handoff,
    );
    expect(result?.route).toBe("PartnerLed");
  });

  it("routes a validated Copilot Studio agent to the AI Agents Pilot", () => {
    const result = recommendNextEngagement(
      {
        decision: "MicrosoftMotion",
        platform: "CopilotStudio",
        priorityBand: "High",
        gateResults: passedGates,
      },
      handoff,
    );
    expect(result?.route).toBe("AIAgentsPilot");
  });

  it("routes to Governance when an access or approval gate failed", () => {
    const failed: GateResult[] = [
      {
        gate: "accessResolvable",
        label: "Access can be resolved",
        kind: "judgement",
        pass: false,
        reason: "DLP approval outstanding",
      },
    ];
    const result = recommendNextEngagement(
      {
        decision: "MicrosoftMotion",
        platform: "CopilotStudio",
        priorityBand: "High",
        gateResults: failed,
      },
      handoff,
    );
    // A governance gap outranks the pilot: fix the gap before piloting.
    expect(result?.route).toBe("AIAgentsGovernance");
  });

  it("falls back to FastTrack for a low-band Copilot Studio case", () => {
    const result = recommendNextEngagement(
      {
        decision: "MicrosoftMotion",
        platform: "CopilotStudio",
        priorityBand: "Low",
        gateResults: [],
      },
      handoff,
    );
    expect(result?.route).toBe("FastTrack");
  });

  it("never infers Factory implementation readiness or eligibility from a high score", () => {
    const result = recommendNextEngagement(
      {
        decision: "MicrosoftMotion",
        platform: "AzureAI",
        priorityBand: "High",
        gateResults: [],
      },
      handoff,
    );
    expect(result?.route).toBe("SolutionAssessment");
    expect(result?.provisional).toBe(true);
    expect(result?.requiresConfirmation).toBe(true);
    expect(result?.rationale).toContain("does not establish production or implementation readiness");
  });

  it("considers Factory only with independent readiness and eligibility confirmation", () => {
    const input = { decision: "MicrosoftMotion" as const, platform: "AzureAI" as const, priorityBand: "Low" as const };
    expect(recommendNextEngagement({ ...input, implementationReadyConfirmed: true }, handoff)?.route).toBe("SolutionAssessment");
    expect(recommendNextEngagement({ ...input, implementationReadyConfirmed: true, programEligibilityConfirmed: true }, handoff)?.route).toBe("CloudAccelerateFactory");
  });

  it("does not treat missing qualification as a validated pilot", () => {
    expect(recommendNextEngagement({ decision: "MicrosoftMotion", platform: "CopilotStudio", priorityBand: "High", gateResults: [] }, handoff)?.route).toBe("FastTrack");
  });

  it.each(["Low", "Medium", "High"] as const)("does not use priority %s as program eligibility", (priorityBand) => {
    const result = recommendNextEngagement({
      decision: "MicrosoftMotion", platform: "CopilotStudio", priorityBand, gateResults: passedGates,
    }, handoff);
    expect(result).toMatchObject({ route: "AIAgentsPilot", provisional: true, requiresConfirmation: true });
  });

  it("rejects an unknown portfolio decision", () => {
    expect(recommendNextEngagement({ decision: "Administrator" as never }, handoff)).toBeNull();
  });

  it("routes a lower-band Azure case to Solution Assessment instead", () => {
    const result = recommendNextEngagement(
      {
        decision: "MicrosoftMotion",
        platform: "AzureAI",
        priorityBand: "Medium",
        gateResults: [],
      },
      handoff,
    );
    expect(result?.route).toBe("SolutionAssessment");
  });

  it("always explains itself", () => {
    const result = recommendNextEngagement(
      {
        decision: "MicrosoftMotion",
        platform: "Hybrid",
        priorityBand: "High",
        gateResults: [],
      },
      handoff,
    );
    expect(result?.rationale.length).toBeGreaterThan(10);
  });
});

describe("closure requirements", () => {
  it("blocks closing a case with nothing recorded", () => {
    expect(canClose(null, handoff)).toBe(false);
    expect(missingClosureRequirements(null, handoff)).toEqual(
      handoff.closureRequirements,
    );
  });

  it("blocks closing when the next milestone is missing", () => {
    const partial = {
      portfolioDecision: "CustomerLed",
      businessOwner: "Tomas Neder",
      nextMilestone: "",
    };
    expect(canClose(partial, handoff)).toBe(false);
    expect(missingClosureRequirements(partial, handoff)).toContain(
      "nextMilestone",
    );
  });

  it("allows closing once decision, owner and dated next milestone all exist", () => {
    const complete = {
      portfolioDecision: "MicrosoftMotion",
      businessOwner: "Tomas Neder",
      nextMilestone: "Scope the pilot with the sponsor",
      nextMilestoneDate: new Date("2026-09-30"),
    };
    expect(canClose(complete, handoff)).toBe(true);
    expect(missingClosureRequirements(complete, handoff)).toEqual([]);
  });

  it("treats a whitespace-only value as missing", () => {
    const sloppy = {
      portfolioDecision: "CustomerLed",
      businessOwner: "   ",
      nextMilestone: "Kick off",
    };
    expect(canClose(sloppy, handoff)).toBe(false);
  });

  it("rejects invalid stored decisions and non-string ownership evidence", () => {
    expect(canClose({ portfolioDecision: "INVALID", businessOwner: "Owner", nextMilestone: "Next" }, handoff)).toBe(false);
    expect(canClose({ portfolioDecision: "Stop", businessOwner: false, nextMilestone: "Next" }, handoff)).toBe(false);
  });

  it.each([undefined, null, "", "2026-02-30", "tomorrow", new Date("invalid")])("requires a valid milestone date (%s)", (nextMilestoneDate) => {
    expect(canClose({
      portfolioDecision: "Stop", businessOwner: "Owner", nextMilestone: "Capture learning", nextMilestoneDate,
    }, handoff)).toBe(false);
  });

  it("accepts a valid date-only input as closure evidence", () => {
    expect(canClose({
      portfolioDecision: "CustomerLed", businessOwner: "Owner", nextMilestone: "Pilot scoping", nextMilestoneDate: "2026-09-30",
    }, handoff)).toBe(true);
  });
});
