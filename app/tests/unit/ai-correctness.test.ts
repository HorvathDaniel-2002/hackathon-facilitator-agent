import { describe, expect, it } from "vitest";
import { createEvaluationSchema, evaluationWireValue } from "@/lib/ai/output-schema";
import { mockEvaluation, mockGuide } from "@/lib/ai/mock-fixtures";
import { evaluateUseCase, renderUseCaseCanvas } from "@/lib/ai/evaluator";
import { splitGuide, splitPartialGuide } from "@/lib/ai/guide";
import { resolveProviderName, validateAzureConfig } from "@/lib/ai/provider";
import { getMethodology } from "@/lib/methodology";
import { parseJsonField } from "@/lib/db";
import { readEvaluationGates, toEffectiveEvaluation, type RawEvaluation } from "@/lib/domain/evaluation";
import { assertAiRequestOrigin, guideRequestSchema } from "@/lib/ai/input-validation";
import { gateFactsFromUseCase } from "@/lib/ai/provenance";

const methodology = getMethodology();
const signalIds = [...methodology.routing.signals.copilotStudio, ...methodology.routing.signals.azureAI].map((signal) => signal.id);
const { schema, jsonSchema } = createEvaluationSchema(
  methodology.gates.gates.filter((gate) => gate.kind === "judgement").map((gate) => gate.id),
  signalIds,
);
const canvas = {
  code: "UC-01", title: "Internal policy assistant", description: "Answer questions in Teams",
  dataSources: "Synthetic policy sample", businessOwner: "Owner",
  smallestSlice: "Answer one policy question", successMetric: "Time saved",
};
const valid = () => evaluationWireValue(mockEvaluation(renderUseCaseCanvas(canvas)), signalIds);

describe("strict AI output contract", () => {
  it("accepts complete mock assessments and emits enum-restricted provider JSON", () => {
    expect(schema.safeParse(valid()).success).toBe(true);
    const properties = jsonSchema.properties as Record<string, { required?: string[] }>;
    expect(properties.routingSignals.required).toContain("conversational");
    expect(JSON.stringify(jsonSchema)).not.toMatch(/minLength|maxLength|minimum|maximum|minItems|uniqueItems/);
    expect(JSON.stringify(jsonSchema)).toContain('"additionalProperties":false');
  });
  it.each(["missing", "duplicate", "unknown"] as const)("rejects %s judgement gates", (mode) => {
    const data = valid();
    const gate = Object.keys(data.judgementGates)[0];
    if (mode === "missing") delete data.judgementGates[gate];
    if (mode === "duplicate") {
      expect(schema.safeParse({ ...data, judgementGates: [
        { gate, ...data.judgementGates[gate] }, { gate, ...data.judgementGates[gate] },
      ] }).success).toBe(false);
      return;
    }
    if (mode === "unknown") data.judgementGates.fabricated = { pass: true, reason: "Invented" };
    expect(schema.safeParse(data).success).toBe(false);
  });
  it("rejects unknown/duplicate routing signals, fractional scores, blank reasons and extra fields", () => {
    for (const patch of [
      { routingSignals: ["fabricated"] },
      { routingSignals: ["conversational", "conversational"] },
      { scores: { ...valid().scores, value: 2.5 } },
      { rationale: " " },
      { recommendedPlatform: "AzureAI" },
      { judgementGates: Object.fromEntries(Object.entries(valid().judgementGates).map(([id, gate]) => [id, { ...gate, reason: undefined }])) },
    ]) expect(schema.safeParse({ ...valid(), ...patch }).success).toBe(false);
  });
  it("computes gates and scoring in code and records the exact rubric", async () => {
    const result = await evaluateUseCase(canvas, { teamRoleTypes: [], hackathonRoleTypes: [] });
    expect(result.gateResults.some((gate) => !gate.pass)).toBe(true);
    expect(result.gateResults).toHaveLength(methodology.gates.gates.length);
    expect(JSON.parse(result.rubricSnapshot)).toEqual(methodology.rubric);
    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });
  it("rejects oversized canvas fields before a model request", () => {
    expect(() => renderUseCaseCanvas({ ...canvas, description: "x".repeat(8_001) })).toThrow(/too long/);
  });
  it("does not invent a conversational signal when the canvas has no routing evidence", () => {
    const data = mockEvaluation(renderUseCaseCanvas({ code: "UC-02", title: "Unknown use case" }));
    expect(data.routingSignals).toEqual([]);
    expect(data.rationale).toContain("default route is provisional");
  });
  it("excludes legacy cross-workspace team contacts from ownership evidence", () => {
    const facts = gateFactsFromUseCase({
      ...canvas, hackathonId: "workspace", processOwnerConfirmed: true,
      teamMembers: [
        { contact: { roleType: "BusinessOwner", hackathonId: "other-workspace" } },
        { contact: { roleType: "Sponsor" } },
        { contact: { roleType: "IT", hackathonId: "workspace" } },
      ],
    });
    expect(facts.teamRoleTypes).toEqual(["IT"]);
  });
});

describe("provider configuration", () => {
  it("uses mock only with no real configuration or explicit opt-in", () => {
    expect(resolveProviderName({})).toBe("mock");
    expect(resolveProviderName({ AZURE_OPENAI_API_KEY: "configured" })).toBe("azure-openai");
    expect(resolveProviderName({ AZURE_OPENAI_DEPLOYMENT: "configured" })).toBe("azure-openai");
    expect(resolveProviderName({ AI_PROVIDER: "mock", AZURE_OPENAI_ENDPOINT: "broken" })).toBe("mock");
    expect(() => resolveProviderName({ AI_PROVIDER: "typo" })).toThrow(/AI_PROVIDER/);
  });
  it("requires deployment and HTTPS configuration for real generation", () => {
    expect(() => validateAzureConfig({
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com", AZURE_OPENAI_API_KEY: "key",
    })).toThrow(/DEPLOYMENT/);
    expect(() => validateAzureConfig({
      AZURE_OPENAI_ENDPOINT: "http://example.com", AZURE_OPENAI_API_KEY: "key", AZURE_OPENAI_DEPLOYMENT: "reasoning-model",
    })).toThrow(/HTTPS/);
  });
});

describe("guide integrity", () => {
  it.each([
    "", "some prose", "## Hackathon MVP\nbody", "## Production scaling\nbody",
    "## Hackathon MVP\n## Production scaling\nbody",
    "## Hackathon MVP\nbody\n## Production scaling\n",
    "## Production scaling\nbody\n## Hackathon MVP\nbody",
    "## Hackathon MVP\nbody\n## Production scaling\nbody\n## Extra\nbody",
    "## Hackathon MVP\n### Empty subsection\n## Production scaling\nbody",
  ])("rejects malformed or empty guide %j", (text) => {
    expect(() => splitGuide(text)).toThrow();
  });
  it.each(["CopilotStudio", "AzureAI", "Hybrid"] as const)("follows explicit %s, not incidental vision keywords", (platform) => {
    const text = mockGuide("Production vision: document processing", platform);
    const parts = splitGuide(text);
    expect(parts.mvpGuideMd).toContain(platform === "AzureAI" ? "Microsoft Foundry" : "Copilot Studio");
    if (platform === "Hybrid") {
      expect(parts.mvpGuideMd).toContain("precomputed JSON");
      expect(parts.mvpGuideMd).toContain("deferred production dependencies");
    }
    expect(parts.productionPlanMd).not.toBe("");
  });
  it("accepts CRLF and nested content headings", () => {
    expect(splitGuide("## Hackathon MVP\r\n### Step\r\nUseful steps\r\n## Production scaling\r\nPlan").productionPlanMd)
      .toContain("Plan");
  });
  it.each(["```", "~~~", "````"])("ignores example headings inside %s fenced blocks", (fence) => {
    const text = `## Hackathon MVP\nBuild one path.\n${fence}markdown\n## Role\nRead-only assistant.\n## Production scaling\nExample, not the actual boundary.\n${fence}\n\n## Production scaling\nPilot plan.`;
    const guide = splitGuide(text);
    expect(guide.mvpGuideMd).toContain("## Role");
    expect(guide.mvpGuideMd).toContain("Example, not the actual boundary.");
    expect(guide.productionPlanMd).toBe("## Production scaling\nPilot plan.");
    expect(splitPartialGuide(text)).toEqual(guide);
  });
  it("does not accept a required heading that exists only inside an example", () => {
    expect(() => splitGuide("## Hackathon MVP\nBuild.\n```\n## Production scaling\nNot a real section.\n```")).toThrow();
  });
});

describe("historical evaluations and corrupt JSON", () => {
  const ev: RawEvaluation = {
    id: "ev", version: 1, valueScore: 4, feasibilityScore: 3, dataReadinessScore: 4, reusabilityScore: 3,
    weightedScore: 3.6, priorityBand: "Medium", csFitBand: "Strong", recommendedPlatform: "CopilotStudio",
    confidence: .7, routingSignals: "[]", gateResults: "[]", rationale: "Rationale",
    source: "ai", model: null, promptVersion: null, methodologyVersion: "rubric@old",
    generatedAt: new Date(),
  };
  it("preserves historical totals without silently applying today's weights", () => {
    const current = { ...methodology.rubric, weights: { value: 1, feasibility: 0, dataReadiness: 0, reusability: 0 } };
    const result = toEffectiveEvaluation(ev, current);
    expect(result.weightedScore).toBe(3.6);
    expect(result.scoreWarning).toContain("Historical rubric");
  });
  it("recomputes overrides using the snapshot, not a changed current rubric", () => {
    const current = { ...methodology.rubric, weights: { value: 1, feasibility: 0, dataReadiness: 0, reusability: 0 } };
    const result = toEffectiveEvaluation({
      ...ev, rubricSnapshot: JSON.stringify(methodology.rubric),
      override: {
        id: "override", overriddenFields: '["valueScore"]', valueScore: 5,
        feasibilityScore: null, dataReadinessScore: null, reusabilityScore: null,
        csFitBand: null, recommendedPlatform: null, rationale: null, reason: "new evidence",
        overriddenBy: "user", overriddenAt: new Date(),
      },
    }, current);
    expect(result.weightedScore).toBe(4);
    expect(result.scoreWarning).toBeNull();
  });
  it.each(["null", "{}", '"string"', '[{"pass":true}]', "[]", "{bad"])("fails closed for corrupt gates %s", (raw) => {
    expect(readEvaluationGates(raw).some((gate) => !gate.pass)).toBe(true);
    expect(parseJsonField(raw, [])).toBeInstanceOf(Array);
  });
  it("cannot present partial or invented stored gates as a qualified evaluation", () => {
    const complete = methodology.gates.gates.map((gate) => ({
      gate: gate.id, label: gate.label, kind: gate.kind, pass: true,
    }));
    expect(readEvaluationGates(JSON.stringify(complete)).every((gate) => gate.pass)).toBe(true);
    for (const gates of [
      complete.slice(0, 1),
      [...complete.slice(1), { ...complete[0], gate: "invented-pass" }],
      [...complete.slice(1), { ...complete[0], kind: complete[0].kind === "judgement" ? "deterministic" : "judgement" }],
    ]) {
      expect(readEvaluationGates(JSON.stringify(gates))).toEqual([expect.objectContaining({
        gate: "invalidStoredGates", pass: false,
      })]);
    }
  });
});

describe("AI request validation", () => {
  it.each([null, {}, { hackathonId: {}, useCaseId: "valid" }, { hackathonId: "id", useCaseId: "../other" },
    { hackathonId: "id", useCaseId: "id", extra: true }])("rejects malformed request %j", (body) => {
    expect(guideRequestSchema.safeParse(body).success).toBe(false);
  });
  it("requires an explicit matching Origin", () => {
    expect(() => assertAiRequestOrigin(new Request("http://localhost/api/build-guide"))).toThrow();
    expect(() => assertAiRequestOrigin(new Request("http://localhost/api/build-guide", {
      headers: { origin: "http://evil.test" },
    }))).toThrow();
    expect(() => assertAiRequestOrigin(new Request("http://localhost/api/build-guide", {
      headers: { origin: "http://localhost" },
    }))).not.toThrow();
  });
  it("compares the browser Host, not an internal Next listener URL", () => {
    expect(() => assertAiRequestOrigin(new Request("http://localhost:3101/api/build-guide", {
      headers: { host: "127.0.0.1:3101", origin: "http://127.0.0.1:3101" },
    }))).not.toThrow();
    expect(() => assertAiRequestOrigin(new Request("http://localhost:3101/api/build-guide", {
      headers: { host: "127.0.0.1:3101", origin: "https://evil.test", "x-forwarded-host": "evil.test" },
    }))).toThrow();
  });
});
