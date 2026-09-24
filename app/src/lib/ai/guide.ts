import { loadPrompt } from "@/lib/ai/prompts";
import { getAiProvider } from "@/lib/ai/provider";
import { renderUseCaseCanvas, type UseCaseForEvaluation } from "@/lib/ai/evaluator";
import { getMethodology } from "@/lib/methodology";
import { PLATFORM_LABELS, type Platform } from "@/lib/schemas";
import { AiError } from "./errors";

/**
 * AI MVP Build-Guide Generator — spec M7.
 *
 * Copilot Studio and Azure AI get genuinely different prompts. Hybrid uses the
 * Copilot Studio prompt plus an addendum that forces the Azure component to be
 * treated as a *production dependency* rather than a Day-1 build — which is the
 * methodology's rule for hybrid cases, and the mistake teams most often make.
 */

export interface GuideContext {
  useCase: UseCaseForEvaluation;
  platform: Platform;
  priorityBand?: string | null;
  weightedScore?: number | null;
  failedGates?: Array<{ label: string; reason?: string }>;
  format?: string;
}

export interface GuidePrompt {
  system: string;
  user: string;
  promptVersion: string;
  methodologyVersion: string;
}

export function buildGuidePrompt(ctx: GuideContext): GuidePrompt {
  const methodology = getMethodology();

  const base =
    ctx.platform === "AzureAI"
      ? loadPrompt("guide-azure-ai")
      : loadPrompt("guide-copilot-studio");

  let system = base.body;
  let promptVersion = base.version;

  if (ctx.platform === "Hybrid") {
    const addendum = loadPrompt("guide-hybrid-addendum");
    system = `${system}\n\n---\n\n${addendum.body}\n\nHybrid rule from the methodology: ${methodology.routing.hybridRule}`;
    promptVersion = `${base.version}+hybrid@${addendum.version}`;
  }

  const duration = ctx.format === "3day" ? "3-day hackathon" :
    ctx.format === "2day" ? "2-day hackathon" : null;
  const gateNotes =
    ctx.failedGates && ctx.failedGates.length > 0
      ? ctx.failedGates
          .map((g) => `- ${g.label}${g.reason ? `: ${g.reason}` : ""}`)
          .join("\n")
      : "- None outstanding.";

  const user = [
    renderUseCaseCanvas(ctx.useCase),
    "",
    "---",
    "",
    `Recommended platform: ${ctx.platform} (${PLATFORM_LABELS[ctx.platform]})`,
    ctx.priorityBand ? `Priority band: ${ctx.priorityBand}` : "",
    ctx.weightedScore != null ? `Weighted score: ${ctx.weightedScore}/5` : "",
    duration
      ? `Event format: ${duration}`
      : "Event duration is not specified. Propose short implementation steps and confirm timeboxes with the owner; do not invent event dates or a milestone plan.",
    "",
    "Open qualification gates the guide must work around:",
    gateNotes,
    "",
    "Build rhythm rules the guide must respect:",
    ...methodology.agendas.buildRhythmRules.map((r) => `- ${r}`),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    system,
    user,
    promptVersion,
    methodologyVersion: methodology.version,
  };
}

export async function streamBuildGuide(
  ctx: GuideContext,
  signal?: AbortSignal,
): Promise<AsyncIterable<string>> {
  const { system, user } = buildGuidePrompt(ctx);
  return getAiProvider().stream({ system, user, platform: ctx.platform, signal });
}

/**
 * Splits the generated markdown into the two persisted halves.
 *
 * Completion requires both mandated headings and actual content in each section.
 */
export function splitGuide(markdown: string): {
  mvpGuideMd: string;
  productionPlanMd: string;
} {
  const normalized = markdown.trim();
  const headings = sectionHeadings(normalized);
  if (
    headings.length !== 2 ||
    headings[0].index !== 0 ||
    headings[0].title !== "Hackathon MVP" ||
    headings[1].title !== "Production scaling"
  ) {
    throw new AiError("The guide did not contain the two required sections. The partial version was saved as failed.");
  }
  const boundary = headings[1].index;
  const hasContent = (text: string) => /[\p{L}\p{N}]/u.test(
    text.replace(/<!--[\s\S]*?-->/g, "").replace(/^#{1,6}[^\r\n]*$/gm, ""),
  );
  if (!hasContent(normalized.slice(headings[0].length, boundary)) ||
      !hasContent(normalized.slice(boundary + headings[1].length))) {
    throw new AiError("The guide contains an empty section. The partial version was saved as failed.");
  }
  return {
    mvpGuideMd: normalized.slice(0, boundary).trim(),
    productionPlanMd: normalized.slice(boundary).trim(),
  };
}

export function splitPartialGuide(markdown: string) {
  const match = sectionHeadings(markdown).find((heading) => heading.title === "Production scaling");
  return match
    ? { mvpGuideMd: markdown.slice(0, match.index).trim(), productionPlanMd: markdown.slice(match.index).trim() }
    : { mvpGuideMd: markdown.trim(), productionPlanMd: "" };
}

/** Heading-looking lines in fenced prompt/code examples are literal content. */
function sectionHeadings(markdown: string) {
  const headings: Array<{ title: string; index: number; length: number }> = [];
  let fence: { marker: string; length: number } | null = null;
  let index = 0;
  for (const line of markdown.split(/(?<=\n)/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*?)(?:\r?\n)?$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (marker) {
      fence = { marker: marker[1][0], length: marker[1].length };
    } else {
      const heading = /^##[ \t]+(.+?)[ \t]*\r?(?:\n)?$/.exec(line);
      if (heading) headings.push({ title: heading[1], index, length: line.trimEnd().length });
    }
    index += line.length;
  }
  return headings;
}
