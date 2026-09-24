import { describe, expect, it } from "vitest";
import { resolvePlatform } from "@/lib/domain/routing";
import { getMethodology } from "@/lib/methodology";

const { routing } = getMethodology();

describe("resolvePlatform", () => {
  it("routes a purely conversational, M365-grounded case to Copilot Studio", () => {
    const result = resolvePlatform(
      [
        "conversational",
        "grounded-in-m365",
        "distributed-via-teams",
        "human-approval",
      ],
      routing,
    );
    expect(result.platform).toBe("CopilotStudio");
    expect(result.band).toBe("Strong");
    expect(result.azureSignals).toHaveLength(0);
  });

  it("routes a document-processing and ML case to Azure AI", () => {
    const result = resolvePlatform(
      ["high-volume-doc-processing", "vision-extraction", "custom-ml"],
      routing,
    );
    expect(result.platform).toBe("AzureAI");
  });

  it("routes a mixed case to Hybrid", () => {
    const result = resolvePlatform(
      ["conversational", "grounded-in-m365", "high-volume-doc-processing"],
      routing,
    );
    expect(result.platform).toBe("Hybrid");
  });

  it("treats a single genuine Azure need as Hybrid, not pure Copilot Studio", () => {
    // The methodology's definition of Hybrid: Copilot Studio is the user-facing
    // layer while Azure does specialist processing. Strong conversational
    // signals must not hide a real Azure dependency.
    const result = resolvePlatform(
      [
        "conversational",
        "grounded-in-m365",
        "distributed-via-teams",
        "power-platform-connectors",
        "custom-ml",
      ],
      routing,
    );
    expect(result.platform).toBe("Hybrid");
  });

  it("routes a vision plus extraction case to Azure AI despite one CS signal", () => {
    const result = resolvePlatform(
      ["human-approval", "vision-extraction", "high-volume-doc-processing"],
      routing,
    );
    expect(result.platform).toBe("AzureAI");
  });

  it("only calls a case Strong Copilot Studio fit when no Azure signal fired", () => {
    const pure = resolvePlatform(
      ["conversational", "grounded-in-m365", "distributed-via-teams"],
      routing,
    );
    expect(pure.platform).toBe("CopilotStudio");
    expect(pure.band).toBe("Strong");

    const tainted = resolvePlatform(
      ["conversational", "grounded-in-m365", "distributed-via-teams", "custom-ml"],
      routing,
    );
    expect(tainted.platform).not.toBe("CopilotStudio");
  });

  it("is deterministic — identical signals always route identically", () => {
    const signals = ["conversational", "power-platform-connectors"];
    const a = resolvePlatform(signals, routing);
    const b = resolvePlatform(signals, routing);
    expect(a).toEqual(b);
  });

  it("ignores signal order", () => {
    const a = resolvePlatform(["conversational", "custom-ml"], routing);
    const b = resolvePlatform(["custom-ml", "conversational"], routing);
    expect(a.platform).toBe(b.platform);
    expect(a.band).toBe(b.band);
  });

  it("deduplicates repeated signals so they cannot inflate a count", () => {
    const inflated = resolvePlatform(
      ["conversational", "conversational", "conversational", "conversational"],
      routing,
    );
    const single = resolvePlatform(["conversational"], routing);
    expect(inflated.copilotStudioSignals).toHaveLength(1);
    expect(inflated.platform).toBe(single.platform);
  });

  it("quarantines unknown signals instead of letting them affect routing", () => {
    const result = resolvePlatform(
      ["conversational", "totally-made-up-signal"],
      routing,
    );
    expect(result.unknownSignals).toEqual(["totally-made-up-signal"]);
    expect(result.copilotStudioSignals).toEqual(["conversational"]);
  });

  it("always returns a platform, even with no signals at all", () => {
    const result = resolvePlatform([], routing);
    expect(["CopilotStudio", "AzureAI", "Hybrid"]).toContain(result.platform);
  });

  it("reports the rule that matched, so a recommendation is explainable", () => {
    const result = resolvePlatform(
      ["conversational", "grounded-in-m365", "human-approval"],
      routing,
    );
    expect(result.matchedRule).toBeTruthy();
  });
});
