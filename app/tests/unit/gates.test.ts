import { describe, expect, it } from "vitest";
import {
  evaluateDeterministicGates,
  isQualified,
  mapJudgementGates,
  mergeGates,
  type GateFacts,
} from "@/lib/domain/gates";
import { getMethodology } from "@/lib/methodology";

const { gates } = getMethodology();

const COMPLETE: GateFacts = {
  businessOwner: "Tomas Neder",
  dataSources: "Anonymized shipment export (CSV, 5000 rows)",
  sampleDataApproved: true,
  processOwnerConfirmed: true,
  smallestSlice: "Answer 'where is shipment X' in Teams with a citation",
  humanApprovalPoint: "Read-only for the MVP",
  agentOutput: "A grounded answer with a citation",
  teamRoleTypes: ["BusinessOwner", "IT"],
  hackathonRoleTypes: ["Sponsor", "BusinessOwner", "IT", "Data"],
};

function gate(results: ReturnType<typeof evaluateDeterministicGates>, id: string) {
  return results.find((r) => r.gate === id);
}

describe("evaluateDeterministicGates", () => {
  it("passes every gate for a fully specified use case", () => {
    const results = evaluateDeterministicGates(COMPLETE, gates);
    expect(results.every((r) => r.pass)).toBe(true);
  });

  it("only evaluates deterministic gates, never judgement ones", () => {
    const results = evaluateDeterministicGates(COMPLETE, gates);
    expect(results.every((r) => r.kind === "deterministic")).toBe(true);
    expect(results.some((r) => r.gate === "canDemoOnePath")).toBe(false);
  });

  it("fails hasBusinessOwner when nobody owns the outcome anywhere", () => {
    const results = evaluateDeterministicGates(
      {
        ...COMPLETE,
        businessOwner: null,
        teamRoleTypes: ["IT"],
        hackathonRoleTypes: ["IT", "Security"],
      },
      gates,
    );
    expect(gate(results, "hasBusinessOwner")?.pass).toBe(false);
  });

  it("accepts a business owner recorded only as a contact role", () => {
    const results = evaluateDeterministicGates(
      { ...COMPLETE, businessOwner: null },
      gates,
    );
    expect(gate(results, "hasBusinessOwner")?.pass).toBe(true);
  });

  it("fails processOwnerAttending when nobody senior is on the team", () => {
    const results = evaluateDeterministicGates(
      { ...COMPLETE, teamRoleTypes: ["IT", "Mentor"] },
      gates,
    );
    expect(gate(results, "processOwnerAttending")?.pass).toBe(false);
  });

  it("treats whitespace-only fields as empty", () => {
    const results = evaluateDeterministicGates(
      { ...COMPLETE, dataSources: "   " },
      gates,
    );
    expect(gate(results, "hasSampleData")?.pass).toBe(false);
  });

  it("attaches a reason and a remedy to every failure", () => {
    const results = evaluateDeterministicGates(
      { ...COMPLETE, dataSources: null, smallestSlice: null },
      gates,
    );
    for (const failure of results.filter((r) => !r.pass)) {
      expect(failure.reason).toBeTruthy();
      expect(failure.remedy).toBeTruthy();
    }
  });

  it("requires explicit review or read-only boundary even when output is absent", () => {
    const results = evaluateDeterministicGates(
      { ...COMPLETE, agentOutput: null, humanApprovalPoint: null },
      gates,
    );
    expect(gate(results, "hasHumanApproval")?.pass).toBe(false);
  });

  it("requires an approval point once the agent does produce an action", () => {
    const results = evaluateDeterministicGates(
      {
        ...COMPLETE,
        agentOutput: "Creates a supplier record",
        humanApprovalPoint: null,
      },
      gates,
    );
    expect(gate(results, "hasHumanApproval")?.pass).toBe(false);
  });
});

describe("mapJudgementGates", () => {
  it("requires an explicit slice and rejects conflicting duplicate model answers", () => {
    const answers = [{ gate: "canDemoOnePath", pass: true }];
    expect(mapJudgementGates(answers, gates).find((g) => g.gate === "canDemoOnePath")?.pass).toBe(false);
    expect(mapJudgementGates([...answers, ...answers], gates, COMPLETE).find((g) => g.gate === "canDemoOnePath")?.pass).toBe(false);
    expect(mapJudgementGates(answers, gates, COMPLETE).find((g) => g.gate === "canDemoOnePath")?.pass).toBe(true);
  });
  it("marks a gate the model did not answer as failing, not passing", () => {
    const results = mapJudgementGates([], gates);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => !r.pass)).toBe(true);
  });

  it("keeps the model's reason when it fails a gate", () => {
    const results = mapJudgementGates(
      [{ gate: "canDemoOnePath", pass: false, reason: "Scope is too broad" }],
      gates,
      COMPLETE,
    );
    expect(results.find((r) => r.gate === "canDemoOnePath")?.reason).toBe(
      "Scope is too broad",
    );
  });

  it("labels every judgement gate as a model assessment", () => {
    const results = mapJudgementGates([], gates);
    expect(results.every((r) => r.kind === "judgement")).toBe(true);
  });
});

describe("mergeGates / isQualified", () => {
  it.each([
    null, undefined, {}, "[]", Array(8).fill(null),
    Array(8).fill({ gate: "hasBusinessOwner", kind: "deterministic", pass: "true" }),
  ])("fails closed for malformed persisted gate results (%j)", (results) => {
    expect(() => isQualified(results as never)).not.toThrow();
    expect(isQualified(results as never)).toBe(false);
  });

  it("qualifies only when every hard gate passes", () => {
    const deterministic = evaluateDeterministicGates(COMPLETE, gates);
    const judgement = mapJudgementGates(
      gates.gates
        .filter((g) => g.kind === "judgement")
        .map((g) => ({ gate: g.id, pass: true })),
      gates,
      COMPLETE,
    );
    expect(isQualified(mergeGates(deterministic, judgement))).toBe(true);
  });

  describe("hard-gate evidence", () => {
    it("has exactly the eight source qualification gates", () => {
      expect(gates.gates).toHaveLength(8);
    });

    it("does not accept an unrelated workspace contact as owner", () => {
      const results = evaluateDeterministicGates({
        ...COMPLETE, businessOwner: null, teamRoleTypes: [], hackathonRoleTypes: ["BusinessOwner"],
      }, gates);
      expect(gate(results, "hasBusinessOwner")?.pass).toBe(false);
    });

    it.each([undefined, false])("does not infer sample approval or attendance from descriptions (%s)", (approval) => {
      const results = evaluateDeterministicGates({
        ...COMPLETE, sampleDataApproved: approval, processOwnerConfirmed: approval,
      }, gates);
      expect(gate(results, "hasSampleData")?.pass).toBe(false);
      expect(gate(results, "processOwnerAttending")?.pass).toBe(false);
    });

    it("never qualifies empty, incomplete, duplicate or unknown gate results", () => {
      const all = mergeGates(
        evaluateDeterministicGates(COMPLETE, gates),
        mapJudgementGates(gates.gates.filter((g) => g.kind === "judgement").map((g) => ({ gate: g.id, pass: true })), gates, COMPLETE),
      );
      expect(isQualified(all)).toBe(true);
      expect(isQualified([])).toBe(false);
      expect(isQualified(all.slice(1))).toBe(false);
      expect(isQualified([...all.slice(1), all[1]])).toBe(false);
      expect(isQualified([...all.slice(1), { ...all[0], gate: "unknown" }])).toBe(false);
    });
  });

  it("disqualifies when a single judgement gate fails", () => {
    const deterministic = evaluateDeterministicGates(COMPLETE, gates);
    const judgement = mapJudgementGates(
      gates.gates
        .filter((g) => g.kind === "judgement")
        .map((g, i) => ({ gate: g.id, pass: i !== 0 })),
      gates,
    );
    expect(isQualified(mergeGates(deterministic, judgement))).toBe(false);
  });
});
