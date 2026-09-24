"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { ActionError } from "@/lib/actions/guard";
import type { HandoffDraft } from "@/lib/kanban";
import {
  CAF_STATUSES, DELIVERY_LABELS, DELIVERY_ROUTES, PORTFOLIO_DECISIONS,
  PORTFOLIO_DECISION_LABELS, PROGRESS_LABELS, PROGRESS_STAGES,
} from "@/lib/schemas";
import { Sparkles } from "lucide-react";

export interface EngagementSuggestion {
  label: string;
  rationale: string;
}

export function HandoffForm({
  id, draft, onChange, editable, closed, pending, dirty, canClose,
  error, notice, suggestion, onSuggest, onSave, onCloseCase, onRefresh,
}: {
  id: string;
  draft: HandoffDraft;
  onChange: <K extends keyof HandoffDraft>(field: K, value: HandoffDraft[K]) => void;
  editable: boolean;
  closed: boolean;
  pending: boolean;
  dirty: boolean;
  canClose: boolean;
  error: ActionError | null;
  notice: string | null;
  suggestion: EngagementSuggestion | null;
  onSuggest: () => void;
  onSave: () => void;
  onCloseCase: () => void;
  onRefresh: () => void;
}) {
  const fieldId = (field: keyof HandoffDraft) => `handoff-${id}-${field}`;
  const fieldError = (field: keyof HandoffDraft) => error?.fieldErrors?.[field]?.[0];
  const ownerRequired = draft.progressStage === "InProduction" || draft.cafStatus === "Submitted";

  return (
    <form
      noValidate
      aria-label="Handoff record"
      aria-busy={pending}
      onSubmit={(event) => { event.preventDefault(); if (editable && !pending) onSave(); }}
      className="space-y-6"
    >
      <fieldset disabled={pending || !editable} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-ink">Progress and delivery</legend>
        <Field label="Progress stage" htmlFor={fieldId("progressStage")} error={fieldError("progressStage")}>
          <Select id={fieldId("progressStage")} name="progressStage" value={draft.progressStage}
            onChange={(event) => onChange("progressStage", event.target.value as HandoffDraft["progressStage"])}>
            {PROGRESS_STAGES.map((stage) => <option key={stage} value={stage}>{PROGRESS_LABELS[stage]}</option>)}
          </Select>
        </Field>
        <Field label="Delivery route" htmlFor={fieldId("deliveryRoute")} error={fieldError("deliveryRoute")}
          hint="A manual classification, not the evaluator's platform recommendation.">
          <Select id={fieldId("deliveryRoute")} name="deliveryRoute" value={draft.deliveryRoute}
            onChange={(event) => onChange("deliveryRoute", event.target.value as HandoffDraft["deliveryRoute"])}>
            {DELIVERY_ROUTES.map((route) => <option key={route} value={route}>{DELIVERY_LABELS[route]}</option>)}
          </Select>
        </Field>
        <p className="sm:col-span-2 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-xs text-info">
          Pilot and In production record human-reported activity outside this app. CAF status records an external
          submission; saving never deploys anything or submits to CAF. A score or suggestion is not approval.
        </p>
        <Field label="Production evidence / reference" htmlFor={fieldId("productionReference")}
          required={draft.progressStage === "InProduction"} error={fieldError("productionReference")}
          hint="For In production, record a rollout, approval, ticket or other verifiable reference."
          className="sm:col-span-2">
          <Input id={fieldId("productionReference")} name="productionReference" maxLength={2000}
            value={draft.productionReference} onChange={(event) => onChange("productionReference", event.target.value)} />
        </Field>
        <Field label="CAF submission status" htmlFor={fieldId("cafStatus")} error={fieldError("cafStatus")}>
          <Select id={fieldId("cafStatus")} name="cafStatus" value={draft.cafStatus}
            onChange={(event) => onChange("cafStatus", event.target.value as HandoffDraft["cafStatus"])}>
            {CAF_STATUSES.map((status) => <option key={status} value={status}>
              {status === "Submitted" ? "Submitted to CAF (external)" : "Not submitted"}
            </option>)}
          </Select>
        </Field>
        <Field label="CAF submitted on" htmlFor={fieldId("cafSubmittedOn")} error={fieldError("cafSubmittedOn")}
          hint="Optional date of the external submission.">
          <Input id={fieldId("cafSubmittedOn")} name="cafSubmittedOn" type="date"
            value={draft.cafSubmittedOn} onChange={(event) => onChange("cafSubmittedOn", event.target.value)} />
        </Field>
        <Field label="CAF submission reference" htmlFor={fieldId("cafReference")} required={draft.cafStatus === "Submitted"}
          error={fieldError("cafReference")} hint="Submitted requires a named business owner and an external submission reference."
          className="sm:col-span-2">
          <Input id={fieldId("cafReference")} name="cafReference" maxLength={2000} value={draft.cafReference}
            onChange={(event) => onChange("cafReference", event.target.value)} />
        </Field>
      </fieldset>

      <fieldset disabled={pending || !editable} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-ink">Exit package and ownership</legend>
        <Field label="What was built" htmlFor={fieldId("whatWasBuilt")} error={fieldError("whatWasBuilt")}
          className="sm:col-span-2">
          <Textarea id={fieldId("whatWasBuilt")} name="whatWasBuilt" value={draft.whatWasBuilt}
            readOnly={closed} onChange={(event) => onChange("whatWasBuilt", event.target.value)} />
        </Field>
        <Field label="Demo or blocker" htmlFor={fieldId("demoOrBlocker")} error={fieldError("demoOrBlocker")}>
          <Textarea id={fieldId("demoOrBlocker")} name="demoOrBlocker" value={draft.demoOrBlocker}
            readOnly={closed} onChange={(event) => onChange("demoOrBlocker", event.target.value)} />
        </Field>
        <Field label="Outcome demonstrated" htmlFor={fieldId("outcomeDemonstrated")} error={fieldError("outcomeDemonstrated")}
          hint="Record actual value with a measurement period or decision reference.">
          <Textarea id={fieldId("outcomeDemonstrated")} name="outcomeDemonstrated" value={draft.outcomeDemonstrated}
            onChange={(event) => onChange("outcomeDemonstrated", event.target.value)} />
        </Field>
        <Field label="Business owner" htmlFor={fieldId("businessOwner")} required={ownerRequired}
          error={fieldError("businessOwner")} hint="Name a person. Required for closure, In production and Submitted to CAF.">
          <Input id={fieldId("businessOwner")} name="businessOwner" value={draft.businessOwner}
            readOnly={closed} onChange={(event) => onChange("businessOwner", event.target.value)} />
        </Field>
        <Field label="Technical owner" htmlFor={fieldId("technicalOwner")} error={fieldError("technicalOwner")}>
          <Input id={fieldId("technicalOwner")} name="technicalOwner" value={draft.technicalOwner}
            onChange={(event) => onChange("technicalOwner", event.target.value)} />
        </Field>
        <Field label="Delivery owner" htmlFor={fieldId("deliveryOwner")} error={fieldError("deliveryOwner")}>
          <Input id={fieldId("deliveryOwner")} name="deliveryOwner" value={draft.deliveryOwner}
            onChange={(event) => onChange("deliveryOwner", event.target.value)} />
        </Field>
        <Field label="Portfolio decision" htmlFor={fieldId("portfolioDecision")} error={fieldError("portfolioDecision")}
          hint="Required before closing; independent of the board's progress stage.">
          <Select id={fieldId("portfolioDecision")} name="portfolioDecision" value={draft.portfolioDecision}
            disabled={closed} onChange={(event) => onChange("portfolioDecision", event.target.value)}>
            <option value="">Not decided</option>
            {PORTFOLIO_DECISIONS.map((decision) => <option key={decision} value={decision}>
              {PORTFOLIO_DECISION_LABELS[decision]}
            </option>)}
          </Select>
        </Field>
      </fieldset>

      <fieldset disabled={pending || !editable} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-ink">Follow-up</legend>
        <Field label="Next engagement" htmlFor={fieldId("nextEngagement")} error={fieldError("nextEngagement")}
          className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            <Input id={fieldId("nextEngagement")} name="nextEngagement" value={draft.nextEngagement}
              onChange={(event) => onChange("nextEngagement", event.target.value)} />
            {editable ? <Button type="button" onClick={onSuggest} disabled={pending}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />Suggest
            </Button> : null}
          </div>
        </Field>
        <Field label="Next action" htmlFor={fieldId("nextMilestone")} error={fieldError("nextMilestone")}
          hint="Required before closing.">
          <Input id={fieldId("nextMilestone")} name="nextMilestone" value={draft.nextMilestone}
            onChange={(event) => onChange("nextMilestone", event.target.value)} />
        </Field>
        <Field label="Next action date" htmlFor={fieldId("nextMilestoneDate")} error={fieldError("nextMilestoneDate")}
          hint="Required before closing; optional for a draft.">
          <Input id={fieldId("nextMilestoneDate")} name="nextMilestoneDate" type="date" value={draft.nextMilestoneDate}
            onChange={(event) => onChange("nextMilestoneDate", event.target.value)} />
        </Field>
        <Field label="Rollout scope" htmlFor={fieldId("rolloutScope")} error={fieldError("rolloutScope")}>
          <Textarea id={fieldId("rolloutScope")} name="rolloutScope" value={draft.rolloutScope}
            onChange={(event) => onChange("rolloutScope", event.target.value)} />
        </Field>
        <Field label="Gaps" htmlFor={fieldId("gaps")} error={fieldError("gaps")}>
          <Textarea id={fieldId("gaps")} name="gaps" value={draft.gaps}
            onChange={(event) => onChange("gaps", event.target.value)} />
        </Field>
      </fieldset>

      {suggestion ? <div className="rounded-xl border border-accent/25 bg-accent-soft/50 px-4 py-3">
        <p className="text-xs font-semibold text-accent">Proposed next engagement: {suggestion.label}</p>
        <p className="mt-1 text-sm text-ink-soft">{suggestion.rationale}</p>
        <p className="mt-2 text-xs text-ink-soft">
          A proposal, not a decision or entitlement. Confirm scope, readiness, delivery ownership, availability
          and program eligibility with the responsible team. This does not change the delivery route or CAF status.
        </p>
      </div> : null}
      {notice ? <p role="status" className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">{notice}</p> : null}
      <ActionFeedback error={error} onRefresh={onRefresh}
        refreshHint="Your draft has been kept. Copy it before discarding it to load the latest saved record." />
      {editable ? <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Working…" : "Save exit package"}</Button>
        {canClose ? <Button type="button" onClick={onCloseCase} disabled={pending || dirty}>Close use case</Button> : null}
        {dirty ? <span className="text-xs font-medium text-warn">Unsaved changes</span> : null}
        <p className="w-full text-xs text-ink-soft">
          Drafts can omit a decision or date. Save before closing; closure checks the saved business owner,
          decision, next action and date. Closing the exit package does not mean production deployment.
        </p>
      </div> : null}
    </form>
  );
}
