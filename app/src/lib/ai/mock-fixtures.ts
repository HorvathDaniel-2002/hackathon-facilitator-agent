import { platformSchema, type AiEvaluation, type Platform } from "@/lib/schemas";

/**
 * Deterministic fixtures for AI_PROVIDER=mock (plan R-9).
 *
 * These are keyword heuristics, not a model. The goal is that a clone with no
 * Azure OpenAI key still demonstrates the full lifecycle end to end, and that
 * tests get stable, non-flaky output. Same input always produces same output.
 */

function has(text: string, ...words: string[]): boolean {
  return words.some((w) => {
    // Word-boundary matching: "vision" must not match inside another word, and
    // multi-word phrases are matched literally.
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(text);
  });
}

/**
 * Parses the rendered canvas back into a field map.
 *
 * The canvas is "Label: value" per line, and several labels contain trigger
 * words themselves — "Production vision" would fire the `vision-extraction`
 * signal on every single use case, and "Success metric" would make every case
 * look measurable. Reading specific fields is both correct and more honest than
 * keyword-matching one big blob.
 */
function parseCanvas(canvas: string): {
  fields: Record<string, string>;
  allValues: string;
} {
  const fields: Record<string, string> = {};

  for (const line of canvas.split(/\r?\n/)) {
    const idx = line.indexOf(": ");
    if (idx === -1) continue;
    const label = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 2).trim();
    if (value && value !== "(not provided)") fields[label] = value;
  }

  return { fields, allValues: Object.values(fields).join("\n") };
}

const filled = (v?: string): boolean => Boolean(v && v.trim().length > 0);

/** Stable pseudo-score so different cases don't all land on the same numbers. */
function jitter(text: string, base: number, spread = 1): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  const offset = (hash % (spread * 2 + 1)) - spread;
  return Math.max(1, Math.min(5, base + offset));
}

export function mockEvaluation(userPrompt: string): AiEvaluation {
  const { fields, allValues } = parseCanvas(userPrompt);
  const t = allValues.toLowerCase();

  /**
   * Platform signals are read only from the fields that describe *what is being
   * built*. "Reuse potential" and "production vision" describe a possible future,
   * so a passing mention of invoices in a reuse note must not route the case to
   * Azure AI.
   */
  const solutionText = [
    fields["description"],
    fields["current process"],
    fields["pain points"],
    fields["desired outcome"],
    fields["data sources"],
    fields["systems & connectors"],
    fields["agent output / action"],
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const signals: string[] = [];

  if (
    has(
      solutionText,
      "chat",
      "conversation",
      "conversational",
      "ask",
      "question",
      "questions",
      "assistant",
      "guided",
      "self-service",
    )
  )
    signals.push("conversational");
  if (
    has(
      solutionText,
      "sharepoint",
      "m365",
      "teams",
      "dataverse",
      "outlook",
      "onedrive",
      "policy document",
      "policy library",
    )
  )
    signals.push("grounded-in-m365");
  if (
    has(
      solutionText,
      "power automate",
      "approval",
      "approvals",
      "connector",
      "connectors",
      "flow",
      "ticket",
      "workflow",
    )
  )
    signals.push("power-platform-connectors");
  if (has(solutionText, "teams", "m365", "employee", "internal user"))
    signals.push("distributed-via-teams");
  if (
    has(
      solutionText,
      "business team",
      "citizen",
      "low-code",
      "mixed team",
      "hr",
      "procurement",
      "operations",
    )
  )
    signals.push("mixed-business-it-team");
  if (
    has(
      t,
      "approve",
      "approves",
      "human review",
      "sign-off",
      "confirm",
      "confirms",
      "review before",
    )
  )
    signals.push("human-approval");
  if (has(t, "reusable", "other teams", "other countries", "scale to", "template"))
    signals.push("reusable-low-code-agent");

  // Azure signals need genuine evidence: a single incidental noun (a PDF
  // handbook, a mention of invoices) is not a document-processing pipeline.
  if (
    has(
      solutionText,
      "document processing",
      "extract",
      "extraction",
      "extracted",
      "ocr",
      "scanned",
      "high volume",
      "rekeying",
    )
  )
    signals.push("high-volume-doc-processing");
  if (
    has(
      solutionText,
      "image",
      "images",
      "photo",
      "photos",
      "computer vision",
      "damage",
      "inspection",
      "video",
    )
  )
    signals.push("vision-extraction");
  if (
    has(
      solutionText,
      "forecast",
      "predict",
      "prediction",
      "propensity",
      "churn",
      "anomaly",
      "machine learning",
      "model training",
    )
  )
    signals.push("custom-ml");
  if (
    has(
      solutionText,
      "orchestration",
      "orchestrate",
      "multi-agent",
      "pipeline",
      "custom model",
    )
  )
    signals.push("bespoke-orchestration");
  if (
    has(
      solutionText,
      "millions",
      "large corpus",
      "vector",
      "semantic search",
      "retrieval",
    )
  )
    signals.push("large-scale-retrieval");
  if (
    has(solutionText, "microservice", "ci/cd", "infrastructure", "custom code", "sdk")
  )
    signals.push("custom-code-infra");
  if (
    has(solutionText, "latency", "throughput", "real-time", "sub-second", "high volume")
  )
    signals.push("latency-throughput-control");

  // Read the specific fields the rubric actually cares about, rather than
  // keyword-matching the whole canvas.
  const dataMentioned = filled(fields["data sources"]);
  const hasMetric = filled(fields["success metric"]);
  const hasSlice = filled(fields["smallest demoable slice"]);
  const isBroad = has(
    t,
    "entire",
    "company-wide",
    "all departments",
    "full rollout",
    "production rollout",
    "all 22 sites",
  );

  const scores = {
    value: jitter(userPrompt, hasMetric ? 4 : 3),
    feasibility: jitter(userPrompt + "f", isBroad ? 2 : 4),
    dataReadiness: jitter(userPrompt + "d", dataMentioned ? 4 : 2),
    reusability: jitter(userPrompt + "r", has(t, "reusable", "other teams") ? 4 : 3),
  };

  return {
    scores,
    scoreRationale: {
      value: hasMetric
        ? "A measurable outcome is stated, so the business case can be tracked after the event."
        : "The outcome is plausible but no success metric is stated, which weakens the value case.",
      feasibility: isBroad
        ? "The described scope reads as a rollout rather than a single demoable path."
        : "A mixed team can realistically show one useful path within the event window.",
      dataReadiness: dataMentioned
        ? "Concrete data sources are named and can be used in anonymized form."
        : "No usable sample or synthetic data is identified on the canvas yet.",
      reusability:
        "The pattern could extend to adjacent teams with moderate rework.",
    },
    routingSignals: signals,
    judgementGates: [
      {
        gate: "canDemoOnePath",
        pass: !isBroad && hasSlice,
        reason:
          !isBroad && hasSlice
            ? "One bounded demo path is stated."
            : "No single demoable path is agreed; the described scope is too broad for the event window.",
      },
      {
        gate: "noProductionIntegrationBlock",
        pass: !has(t, "sap", "mainframe", "core banking", "erp integration"),
        reason: has(t, "sap", "mainframe", "core banking", "erp integration")
          ? "Depends on a core system integration that cannot be stood up before the event."
          : "No blocking production integration is stated.",
      },
      {
        gate: "accessResolvable",
        pass: !has(t, "no access", "pending approval", "blocked by security"),
        reason: has(t, "no access", "pending approval", "blocked by security")
          ? "Required access or approval is still outstanding and has no mocked alternative."
          : "No unresolved access blocker is stated; verify before the event.",
      },
      {
        gate: "notProductionRollout",
        pass: !isBroad,
        reason: isBroad
          ? "The stated target is a production rollout rather than a hackathon MVP."
          : "The stated scope is an MVP, not a rollout.",
      },
    ],
    confidence: dataMentioned && hasMetric ? 0.82 : 0.61,
    rationale:
      `Mock assessment (AI_PROVIDER=mock — no model was called). ` +
      (signals.length
        ? `Signals detected: ${signals.join(", ")}. `
        : "No agent-routing evidence detected; the local default route is provisional. Consider ordinary code or existing SaaS before a custom agent. ") +
      `${hasMetric ? "A measurable outcome is stated. " : "No success metric is stated, which limits the value case. "}` +
      `${dataMentioned ? "Sample data is identified." : "Sample data still needs to be identified before the event."}`,
  };
}

export function mockGuide(userPrompt: string, explicitPlatform?: Platform): string {
  const platform = platformSchema.parse(explicitPlatform ??
    /^Recommended platform: (CopilotStudio|AzureAI|Hybrid)\b/m.exec(userPrompt)?.[1]);
  const azure = platform === "AzureAI";
  const hybrid = platform === "Hybrid";
  const platformName = azure ? "Microsoft Foundry / Azure AI" : "Copilot Studio";

  return `## Hackathon MVP

> **Mock output — generic demonstration, not a validated design.** \`AI_PROVIDER=mock\`, so no model was called. Real generation requires the Azure OpenAI endpoint, API key and deployment configuration. No tools are executed by this facilitator.

1. **Environment & sandbox** — Use a dedicated dev environment with approved synthetic sample data. Confirm access on the prep day, not on Day 1.${azure ? " An authorized owner must verify deployment availability, region and quota." : " A Copilot Studio trial permits authoring/test chat but not publishing; use the test panel unless publishing entitlement is confirmed."}
2. **Knowledge sources** — Connect only the single source needed for the demo path in ${platformName}. Leave everything else disconnected until after the event.
3. **${azure ? "Prompt & pipeline" : "Agent topics & instructions"}** — ${azure ? "Use a minimal input → process → review harness with one deployed model. Do not introduce extra services without a demonstrated need." : "Create one greeting topic and one task topic. Keep instructions to a short, explicit paragraph naming the allowed source."}
4. **Actions & connectors** — Read-only for the event. Any write is mocked.
5. **Human approval point** — A person confirms before anything is written back to a system of record.
6. **Test steps** — Three representative inputs plus one deliberately out-of-scope input, to show the agent declines gracefully.
7. **Demo script** — Setup line, happy path, value statement, pilot ask. Three minutes, no live debugging.
8. **Fallback / mock path** — Prepare precomputed responses and a screen recording. Confirm this works by end of Day 1.
${hybrid ? "\n### Azure production dependencies\n\nUse precomputed JSON sample outputs behind the Copilot Studio conversation. Azure processing, retrieval indexes and model integration are deferred production dependencies, not a Day-1 build. Record the mocked request/response contract and its owner.\n" : ""}

## Production scaling

1. **ALM & environments** — Dev/test/prod separation with ${azure ? "versioned code, infrastructure and deployment pipelines" : "managed solutions and a promotion pipeline"}.
2. **Security, DLP & identity** — ${azure ? "Managed identity, Azure RBAC, approved data boundaries" : "Connector DLP policies, least-privilege service identity"}, audit trail on every consequential action.
3. **Monitoring & analytics** — Instrument resolution rate, escalation rate and time saved; these are the numbers that justify the pilot.
4. **Governance & human-in-the-loop** — Named owner, review cadence, and an escalation path for low-confidence answers.
5. **Pilot plan** — Proposed local planning assumption: one team for four weeks, subject to owner agreement; not a Microsoft-mandated duration. Agree the success metric before the pilot starts.
6. **Recommended next engagement** — Route via the handoff module once the portfolio decision is recorded.
${hybrid ? "7. **Deferred Azure integration** — Validate the specialist Azure service, access, cost and quality before replacing the stub. Use an authenticated API contract and preserve human approval. No production readiness is implied by the mocked demo.\n" : ""}

*Production deployment is out of hackathon scope by design.*

### References and assumptions

Reviewed public guidance (2026-09-09), not tenant-specific approval:
- [Hackathon preparation and follow-up](https://learn.microsoft.com/en-us/power-platform/guidance/adoption/hackathons)
${azure ? "- [AI agent adoption: Microsoft Foundry and governance](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/)" : "- [Licensing and trial limits](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-licensing-subscriptions)\n- [Data-policy enforcement](https://learn.microsoft.com/en-us/microsoft-copilot-studio/admin-data-loss-prevention) — no enforcement bypass; use a disconnected mock if policy blocks access."}
`;
}
