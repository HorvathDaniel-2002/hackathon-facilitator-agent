"use client";

import { ScoreBar } from "@/components/charts/bar-chart";
import {
  Badge,
  BAND_TONE,
  PLATFORM_TONE,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, SectionLabel } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  clearOverride,
  evaluateUseCaseAction,
  overrideEvaluation,
} from "@/lib/actions/evaluation";
import type { EffectiveEvaluation } from "@/lib/domain/evaluation";
import {
  CS_FIT_BANDS,
  PLATFORMS,
  PLATFORM_LABELS,
  type GateResult,
} from "@/lib/schemas";
import { cn, formatDate } from "@/lib/utils";
import { useActionTransition } from "@/components/use-action-transition";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  History,
  Pencil,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type OverrideDraft = Record<"valueScore" | "feasibilityScore" | "dataReadinessScore" | "reusabilityScore" | "recommendedPlatform" | "csFitBand" | "reason", string>;

export function EvaluatorPanel({
  hackathonId,
  useCaseId,
  evaluation,
  history,
  editable,
  aiProvider,
}: {
  hackathonId: string;
  useCaseId: string;
  evaluation: EffectiveEvaluation | null;
  history: EffectiveEvaluation[];
  editable: boolean;
  aiProvider: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useActionTransition((failure) => setError(failure.error));
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; version: number | null } | null>(null);
  const [draft, setDraft] = useState<OverrideDraft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const router = useRouter();

  function change(field: keyof OverrideDraft, value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : null);
  }

  function runEvaluation() {
    setError(null);
    start(async () => {
      const result = await evaluateUseCaseAction(hackathonId, useCaseId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function onOverride(formData: FormData) {
    if (!evaluation || !editTarget) return;
    setError(null);
    setConflict(false);

    const input = {
      valueScore: Number(formData.get("valueScore")),
      feasibilityScore: Number(formData.get("feasibilityScore")),
      dataReadinessScore: Number(formData.get("dataReadinessScore")),
      reusabilityScore: Number(formData.get("reusabilityScore")),
      csFitBand: String(formData.get("csFitBand")),
      recommendedPlatform: String(formData.get("recommendedPlatform")),
      reason: String(formData.get("reason") || ""),
    };

    start(async () => {
      const result = await overrideEvaluation(
        hackathonId,
        useCaseId,
        editTarget.id,
        input,
        editTarget.version,
      );
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
        setConflict(result.code === "conflict");
      }
    });
  }

  function onClearOverride() {
    if (!evaluation) return;
    setError(null);
    start(async () => {
      const result = await clearOverride(hackathonId, useCaseId, evaluation.id, evaluation.overrideVersion);
      if (result.ok) { setEditing(false); router.refresh(); }
      else { setError(result.error); setConflict(result.code === "conflict"); }
    });
  }

  if (!evaluation) {
    return (
      <Card>
        <CardHeader
          title="Copilot Studio fit evaluator"
          subtitle="Scores business impact and routes the case to Copilot Studio, Azure AI or Hybrid."
        />
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="Not evaluated yet"
          description={
            editable
              ? "The evaluator advises on four local rubric dimensions, checks gates and recommends a platform. Human review is required; scores and routing can be overridden."
              : "Ask a contributor to run the evaluator on this case."
          }
          action={
            editable ? (
              <Button variant="primary" onClick={runEvaluation} disabled={pending}>
                {pending ? "Evaluating…" : "Run evaluator"}
              </Button>
            ) : undefined
          }
        />
        {aiProvider === "mock" ? <MockNotice /> : null}
        {error ? <ErrorNote message={error} /> : null}
      </Card>
    );
  }

  const failed = evaluation.gateResults.filter((g) => !g.pass);
  const passed = evaluation.gateResults.filter((g) => g.pass);

  return (
    <Card>
      <CardHeader
        title="Copilot Studio fit evaluator"
        subtitle={`Version ${evaluation.version} · ${formatDate(evaluation.generatedAt)} · ${
          evaluation.model ?? "unknown model"
        }`}
        action={
            <div className="flex flex-wrap items-center gap-2">
              {history.length > 1 ? (
                <Button size="sm" aria-label="Show evaluation history" aria-expanded={showHistory} onClick={() => setShowHistory((s) => !s)}>
                  <History className="h-3.5 w-3.5" aria-hidden />
                  {history.length}
                </Button>
              ) : null}
              {editable ? <>
              <Button size="sm" onClick={() => {
                if (!editing) {
                  setEditTarget({ id: evaluation.id, version: evaluation.overrideVersion });
                  setDraft({
                    valueScore: String(evaluation.valueScore), feasibilityScore: String(evaluation.feasibilityScore),
                    dataReadinessScore: String(evaluation.dataReadinessScore), reusabilityScore: String(evaluation.reusabilityScore),
                    recommendedPlatform: evaluation.recommendedPlatform, csFitBand: evaluation.csFitBand,
                    reason: evaluation.overrideReason ?? "",
                  });
                }
                setEditing((e) => !e);
              }}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Override
              </Button>
              <Button size="sm" onClick={runEvaluation} disabled={pending}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {pending ? "Running…" : "Re-evaluate"}
              </Button>
              </> : null}
            </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={BAND_TONE[evaluation.priorityBand]}>
          {evaluation.priorityBand} priority
        </Badge>
        <Badge tone={PLATFORM_TONE[evaluation.recommendedPlatform]}>
          {PLATFORM_LABELS[evaluation.recommendedPlatform]}
        </Badge>
        <Badge tone="neutral">{evaluation.csFitBand} fit</Badge>
        <Badge tone="neutral">
          {evaluation.source === "mock" || evaluation.model === "mock-model" ? "Demo self-rating" : "Model self-rating"} {evaluation.confidence.toFixed(2)}/1 · not a probability
        </Badge>
        {evaluation.isEdited ? (
          <Badge tone="violet" icon={<Pencil className="h-2.5 w-2.5" />}>
            Human-edited
          </Badge>
        ) : (
          <Badge tone="neutral" icon={<Bot className="h-3 w-3" />}>
            {evaluation.source === "mock" || evaluation.model === "mock-model" ? "Demo fixture" : "Model output"}
          </Badge>
        )}
      </div>

      <div className="mt-5 flex items-end gap-4 rounded-[var(--radius-inner)] border border-line bg-surface-muted p-5">
        <div>
          <p className="text-xs font-medium text-ink-faint">Weighted score</p>
          <p className="mt-1 text-4xl leading-none font-semibold tabular-nums text-ink">
            {evaluation.weightedScore.toFixed(1)}
            <span className="ml-1 text-lg font-normal text-ink-faint">/5</span>
          </p>
        </div>
        <p className="mb-1 flex-1 text-xs text-ink-faint">
          Computed from the evaluation&apos;s recorded rubric. Local facilitation advice,
          not an official Microsoft assessment or approval.
        </p>
      </div>
      {evaluation.scoreWarning ? <ErrorNote message={evaluation.scoreWarning} /> : null}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ScoreRow
          label="Business value"
          score={evaluation.valueScore}
          weight={evaluation.scoreWeights ? `${Math.round(evaluation.scoreWeights.value * 100)}%` : "historical"}
          edited={evaluation.overriddenFields.includes("valueScore")}
        />
        <ScoreRow
          label="Feasibility"
          score={evaluation.feasibilityScore}
          weight={evaluation.scoreWeights ? `${Math.round(evaluation.scoreWeights.feasibility * 100)}%` : "historical"}
          edited={evaluation.overriddenFields.includes("feasibilityScore")}
        />
        <ScoreRow
          label="Data readiness"
          score={evaluation.dataReadinessScore}
          weight={evaluation.scoreWeights ? `${Math.round(evaluation.scoreWeights.dataReadiness * 100)}%` : "historical"}
          edited={evaluation.overriddenFields.includes("dataReadinessScore")}
        />
        <ScoreRow
          label="Reusability"
          score={evaluation.reusabilityScore}
          weight={evaluation.scoreWeights ? `${Math.round(evaluation.scoreWeights.reusability * 100)}%` : "historical"}
          edited={evaluation.overriddenFields.includes("reusabilityScore")}
        />
      </div>

      {editing && draft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onOverride(new FormData(event.currentTarget));
          }}
          className="mt-6 rounded-[var(--radius-inner)] border border-violet/25 bg-violet-soft/40 p-5"
        >
          <p className="mb-4 text-sm font-semibold text-ink">
            Override the evaluation
          </p>
          <p className="mb-4 text-xs text-ink-soft">
            The model&apos;s answer is kept intact — your changes are recorded
            separately and marked as human-edited.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Value" htmlFor="o-value">
              <Input
                id="o-value"
                name="valueScore"
                type="number"
                min={1}
                max={5}
                value={draft.valueScore}
                onChange={(event) => change("valueScore", event.target.value)}
              />
            </Field>
            <Field label="Feasibility" htmlFor="o-feas">
              <Input
                id="o-feas"
                name="feasibilityScore"
                type="number"
                min={1}
                max={5}
                value={draft.feasibilityScore}
                onChange={(event) => change("feasibilityScore", event.target.value)}
              />
            </Field>
            <Field label="Data" htmlFor="o-data">
              <Input
                id="o-data"
                name="dataReadinessScore"
                type="number"
                min={1}
                max={5}
                value={draft.dataReadinessScore}
                onChange={(event) => change("dataReadinessScore", event.target.value)}
              />
            </Field>
            <Field label="Reuse" htmlFor="o-reuse">
              <Input
                id="o-reuse"
                name="reusabilityScore"
                type="number"
                min={1}
                max={5}
                value={draft.reusabilityScore}
                onChange={(event) => change("reusabilityScore", event.target.value)}
              />
            </Field>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Platform" htmlFor="o-platform">
              <Select
                id="o-platform"
                name="recommendedPlatform"
                value={draft.recommendedPlatform}
                onChange={(event) => change("recommendedPlatform", event.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Copilot Studio fit" htmlFor="o-fit">
              <Select
                id="o-fit"
                name="csFitBand"
                value={draft.csFitBand}
                onChange={(event) => change("csFitBand", event.target.value)}
              >
                {CS_FIT_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Why are you overriding?"
            htmlFor="o-reason"
            className="mt-3"
          >
            <Textarea
              id="o-reason"
              name="reason"
              required
              maxLength={2000}
              value={draft.reason}
              onChange={(event) => change("reason", event.target.value)}
              placeholder="The sponsor confirmed the data is already approved, so data readiness is higher than the canvas suggests."
            />
          </Field>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save override"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            {evaluation.isEdited ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={onClearOverride}
                disabled={pending}
              >
                Revert to model output
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      <SectionLabel className="mt-8 mb-3">
        Qualification gates ({passed.length}/{evaluation.gateResults.length} passing)
      </SectionLabel>
      <ul className="space-y-2">
        {[...failed, ...passed].map((g) => (
          <GateRow key={g.gate} gate={g} />
        ))}
      </ul>

      {evaluation.routingSignals.length > 0 ? (
        <>
          <SectionLabel className="mt-8 mb-3">Routing signals</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {evaluation.routingSignals.map((s) => (
              <Badge key={s} tone="info">
                {s}
              </Badge>
            ))}
          </div>
        </>
      ) : null}

      <SectionLabel className="mt-8 mb-2">Rationale</SectionLabel>
      <p className="text-sm leading-relaxed text-ink-soft">{evaluation.rationale}</p>

      {evaluation.overrideReason ? (
        <div className="mt-4 rounded-[var(--radius-inner)] border border-violet/25 bg-violet-soft/40 px-4 py-3">
          <p className="text-xs font-semibold text-violet">
            Facilitator override
          </p>
          <p className="mt-1 text-sm text-ink-soft">{evaluation.overrideReason}</p>
        </div>
      ) : null}

      {showHistory ? (
        <>
          <SectionLabel className="mt-8 mb-3">Evaluation history</SectionLabel>
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li
                key={h.id}
                className="py-2.5 text-sm"
              >
                <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                <span className="text-ink-soft">
                  v{h.version} · {formatDate(h.generatedAt)}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={BAND_TONE[h.priorityBand]}>
                    {h.weightedScore.toFixed(1)}
                  </Badge>
                  <Badge tone={PLATFORM_TONE[h.recommendedPlatform]}>
                    {PLATFORM_LABELS[h.recommendedPlatform]}
                  </Badge>
                  {h.isEdited ? <Badge tone="violet">Edited</Badge> : null}
                </span>
                </summary>
                <p className="mt-3 text-ink-soft">{h.rationale}</p>
                <p className="mt-2 text-xs text-ink-soft">Recorded model: {h.model ?? "Unknown"} · methodology: {h.methodologyVersion ?? "Unknown"}</p>
                {h.overrideReason && <p className="mt-2 text-xs text-violet">Human override rationale: {h.overrideReason}</p>}
                <ul className="mt-2 list-inside list-disc text-xs text-ink-soft">{h.gateResults.filter((gate) => !gate.pass).map((gate) => <li key={gate.gate}>{gate.label}: {gate.reason}</li>)}</ul>
                </details>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-6 border-t border-line pt-4 text-xs text-ink-faint">
        Methodology {evaluation.methodologyVersion ?? "unknown"}
      </p>

      {aiProvider === "mock" ? <MockNotice /> : null}
      {error ? <ErrorNote message={error} /> : null}
      {conflict ? <Button size="sm" className="mt-3" onClick={() => {
        setEditing(false); setConflict(false); setError(null); router.refresh();
      }}>Reload latest evaluation</Button> : null}
    </Card>
  );
}

function ScoreRow({
  label,
  score,
  weight,
  edited,
}: {
  label: string;
  score: number;
  weight: string;
  edited: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-ink">
          {label}
          <span className="text-xs text-ink-faint">{weight}</span>
          {edited ? (
            <Pencil className="h-3 w-3 text-violet" aria-label="Edited" />
          ) : null}
        </span>
        <span className="text-sm font-semibold tabular-nums text-ink">
          {score}/5
        </span>
      </div>
      <ScoreBar
        score={score}
        tone={score >= 4 ? "accent" : score >= 3 ? "warn" : "danger"}
      />
    </div>
  );
}

function GateRow({ gate }: { gate: GateResult }) {
  return (
    <li
      className={cn(
        "rounded-[var(--radius-inner)] border px-4 py-3",
        gate.pass
          ? "border-line bg-surface-muted"
          : "border-danger/25 bg-danger-soft/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        {gate.pass ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {gate.label}
            {gate.kind === "judgement" ? (
              <Badge tone="neutral" icon={<Bot className="h-2.5 w-2.5" />}>
                Model assessment
              </Badge>
            ) : null}
          </p>
          {!gate.pass && gate.reason ? (
            <p className="mt-1 text-xs text-danger">{gate.reason}</p>
          ) : null}
          {!gate.pass && gate.remedy ? (
            <p className="mt-1 text-xs text-ink-soft">
              <strong className="font-medium">Fix:</strong> {gate.remedy}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function MockNotice() {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-[var(--radius-inner)] border border-info/25 bg-info-soft px-4 py-3 text-xs text-info">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Running with <code className="font-mono">AI_PROVIDER=mock</code> — results
        come from deterministic fixtures, not a model. Set{" "}
        <code className="font-mono">AZURE_OPENAI_ENDPOINT</code> and{" "}
        <code className="font-mono">AZURE_OPENAI_API_KEY</code> for real
        evaluations.
      </span>
    </p>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-4 rounded-[var(--radius-inner)] bg-danger-soft px-4 py-2.5 text-sm text-danger">
      {message}
    </p>
  );
}
