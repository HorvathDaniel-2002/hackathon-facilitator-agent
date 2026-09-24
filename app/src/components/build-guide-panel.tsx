"use client";

import { Badge, PLATFORM_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PLATFORM_LABELS, type Platform } from "@/lib/schemas";
import { formatDate } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import { BookOpen, Download, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export interface GuideVersion {
  id: string;
  version: number;
  platform: string;
  mvpGuideMd: string;
  productionPlanMd: string;
  status: string;
  model: string | null;
  generatedAt: Date;
  errorMessage?: string | null;
  useCaseVersion?: number | null;
}

export function BuildGuidePanel({
  hackathonId,
  useCaseId,
  useCaseCode,
  guides,
  platform,
  editable,
  hasEvaluation,
  evaluationIsCurrent = hasEvaluation,
}: {
  hackathonId: string;
  useCaseId: string;
  useCaseCode: string;
  guides: GuideVersion[];
  platform: Platform | null;
  editable: boolean;
  hasEvaluation: boolean;
  evaluationIsCurrent?: boolean;
}) {
  const [streaming, setStreaming] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [localGuide, setLocalGuide] = useState<GuideVersion | null>(null);
  const [observedAt, setObservedAt] = useState(() => Date.now());
  const outputRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const current = (localGuide && (guides.find((guide) => guide.id === localGuide.id) ?? localGuide)) ??
    guides.find((guide) => guide.id === selected) ?? guides[0];
  const displayedPlatform = current?.platform as Platform | undefined ?? platform;
  const interrupted = current?.status === "streaming" &&
    observedAt - new Date(current.generatedAt).getTime() > 180_000;
  const status = streaming ? "streaming" : interrupted ? "interrupted" : current?.status;
  useEffect(() => {
    if (streaming || status !== "streaming") return;
    const timer = setInterval(() => { setObservedAt(Date.now()); router.refresh(); }, 2_000);
    return () => clearInterval(timer);
  }, [router, status, streaming]);

  const displayed = streaming
    ? streamed
    : current
      ? [current.mvpGuideMd, current.productionPlanMd].filter(Boolean).join("\n\n")
      : "";

  const html = useMemo(() => renderMarkdown(displayed), [displayed]);

  async function generate() {
    setError(null);
    setStreamed("");
    setStreaming(true);
    setLocalGuide(null);
    let partial = "";
    let pendingGuide: GuideVersion | null = null;

    try {
      const response = await fetch("/api/build-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hackathonId, useCaseId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Generation failed (${response.status})`);
      }
      if (!response.body) throw new Error("No response body");
      pendingGuide = {
        id: response.headers.get("X-Guide-Id") ?? "pending",
        version: Number(response.headers.get("X-Guide-Version") ?? 1),
        platform: platform ?? "CopilotStudio", mvpGuideMd: "", productionPlanMd: "",
        status: "streaming", model: response.headers.get("X-Ai-Provider"),
        generatedAt: new Date(),
      };
      setLocalGuide(pendingGuide);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          partial += decoder.decode(value, { stream: true });
          setStreamed(partial);
          outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
        }
        partial += decoder.decode();
        setStreamed(partial);
      } finally {
        reader.releaseLock();
      }

      // The server persists on completion; refresh so the saved version appears
      // in the version list with its metadata.
      setStreaming(false);
      setLocalGuide({ ...pendingGuide, mvpGuideMd: partial, status: "complete" });
      setSelected(pendingGuide.id);
      router.refresh();
    } catch (err) {
      setStreaming(false);
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
      if (pendingGuide) {
        setLocalGuide({ ...pendingGuide, mvpGuideMd: partial, status: "failed", errorMessage: message });
      }
      router.refresh();
    }
  }

  function download() {
    if (!displayed) return;
    const blob = new Blob([displayed], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${useCaseCode}-build-guide-v${current?.version ?? 1}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader
        title="AI MVP build guide"
        subtitle={
          current
            ? `Version ${current.version} · ${formatDate(current.generatedAt)} · ${current.model ?? "unknown model"}`
            : "A hackathon-days MVP guide plus a production scaling plan."
        }
        action={
          <div className="flex items-center gap-2">
            {displayed && !streaming ? (
              <Button size="sm" onClick={download}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                .md
              </Button>
            ) : null}
            {editable && hasEvaluation ? (
              <Button
                size="sm"
                variant={guides.length === 0 ? "primary" : "secondary"}
                onClick={generate}
                disabled={streaming || status === "streaming" || !evaluationIsCurrent}
              >
                {streaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                )}
                {streaming
                  ? "Generating…"
                  : guides.length === 0
                    ? "Generate guide"
                    : "Regenerate"}
              </Button>
            ) : null}
          </div>
        }
      />

      {hasEvaluation && !evaluationIsCurrent ? (
        <p role="status" className="mb-4 text-sm text-warn">
          Saved guides remain available as historical drafts. Re-evaluate the current evidence before generating a new guide.
        </p>
      ) : null}

      {!hasEvaluation && guides.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="Evaluate the case first"
          description="The build guide follows the platform routing from the evaluator, so the case has to be evaluated before a guide can be generated."
        />
      ) : guides.length === 0 && !streaming && !displayed ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No guide generated yet"
          description={
            platform
              ? `Generates a ${PLATFORM_LABELS[platform]} guide scoped to one demoable path, plus what it would take to run it in production.`
              : "Generates an MVP guide plus a production scaling plan."
          }
          action={
            editable ? (
              <Button variant="primary" onClick={generate} disabled={streaming || !evaluationIsCurrent}>
                Generate guide
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {displayedPlatform ? (
              <Badge tone={PLATFORM_TONE[displayedPlatform]}>
                {PLATFORM_LABELS[displayedPlatform]}
              </Badge>
            ) : null}
            {displayedPlatform === "Hybrid" ? (
              <Badge tone="warn">
                Azure part = production dependency, not a Day-1 build
              </Badge>
            ) : null}
            {guides.length > 1 && !streaming ? (
              <div className="ml-auto flex items-center gap-1">
                {guides.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => { setSelected(g.id); setLocalGuide(null); setError(null); }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      g.id === current?.id
                        ? "bg-ink text-white"
                        : "bg-sunken text-ink-soft hover:bg-line"
                    }`}
                  >
                    v{g.version} · {g.status}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {status && status !== "complete" ? (
            <p className="mb-3 text-sm text-ink-soft" role="status">
              {status === "streaming"
                ? "Generation in progress. Partial output is not a completed guide."
                : `This version ${status === "interrupted" ? "was interrupted" : "failed"}; any output below is incomplete. ${current?.errorMessage ?? "Regenerate to try again."}`}
            </p>
          ) : null}
          <div
            ref={outputRef}
            className="hf-prose max-h-[560px] overflow-y-auto rounded-[var(--radius-inner)] border border-line bg-surface-muted p-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {streaming ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Streaming — partial checkpoints are saved. Closing this tab does not cancel generation.
            </p>
          ) : null}
        </>
      )}

      {error ? (
        <p role="alert" className="mt-4 rounded-[var(--radius-inner)] bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
