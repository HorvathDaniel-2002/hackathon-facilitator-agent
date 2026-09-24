"use client";

import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import type { ActionError } from "@/lib/actions/guard";
import { Card, CardHeader } from "@/components/ui/card";
import { DummyDataHint, Field, Input, Select, Textarea } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/empty-state";
import { createUseCase, updateUseCase } from "@/lib/actions/usecase";
import { INFLUENCE_LEVELS, USECASE_STATUSES } from "@/lib/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface CanvasValues {
  title: string;
  description: string;
  businessOwner: string;
  targetUser: string;
  currentProcess: string;
  painPoints: string;
  desiredOutcome: string;
  dataSources: string;
  systemsConnectors: string;
  agentOutput: string;
  humanApprovalPoint: string;
  successMetric: string;
  constraints: string;
  reusePotential: string;
  smallestSlice: string;
  productionVision: string;
  manualImpact: string;
  status: string;
}

const EMPTY: CanvasValues = {
  title: "",
  description: "",
  businessOwner: "",
  targetUser: "",
  currentProcess: "",
  painPoints: "",
  desiredOutcome: "",
  dataSources: "",
  systemsConnectors: "",
  agentOutput: "",
  humanApprovalPoint: "",
  successMetric: "",
  constraints: "",
  reusePotential: "",
  smallestSlice: "",
  productionVision: "",
  manualImpact: "",
  status: "Draft",
};

/**
 * The intake canvas — spec M2.
 *
 * Structured fields, not a free-text "idea" box. The grouping mirrors the order a
 * scoping conversation actually goes in, and each group maps to what the
 * evaluator and the gates need: without `dataSources` and `smallestSlice` a case
 * cannot pass its deterministic gates, which is why they are called out.
 */
export function UseCaseCanvasForm({
  hackathonId,
  useCaseId,
  version,
  initial,
}: {
  hackathonId: string;
  useCaseId?: string;
  version?: number;
  initial?: Partial<CanvasValues>;
}) {
  const values = { ...EMPTY, ...initial };
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const isEdit = Boolean(useCaseId);

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    const input = Object.fromEntries(formData.entries());

    start(async () => {
      const result = isEdit
        ? await updateUseCase(hackathonId, useCaseId!, input, version ?? 0)
        : await createUseCase(hackathonId, input);

      if (result.ok) {
        router.push(
          isEdit
            ? `/hackathons/${hackathonId}/usecases/${useCaseId}`
            : `/hackathons/${hackathonId}/usecases/${(result.data as { id: string }).id}`,
        );
        router.refresh();
      } else {
        setError(result);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }} aria-busy={pending} className="flex flex-col gap-4">
      <fieldset disabled={pending} className="min-w-0">
      <Card>
        <CardHeader
          title="Intake canvas"
          subtitle="Structured capture, not a free-form idea. The evaluator scores what you record here."
        />

        <SectionLabel className="mb-3">The scenario</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Title"
            required
            htmlFor="title"
            className="sm:col-span-2"
            error={fieldErrors.title?.[0]}
          >
            <Input
              id="title"
              name="title"
              required
              defaultValue={values.title}
              placeholder="Shipment status self-service agent"
            />
          </Field>

          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <Textarea
              id="description"
              name="description"
              defaultValue={values.description}
              placeholder="What the agent does, for whom, grounded in what."
            />
          </Field>

          <Field
            label="Business owner"
            htmlFor="businessOwner"
            hint="Who owns the outcome? A case without an owner fails a hard gate."
          >
            <Input
              id="businessOwner"
              name="businessOwner"
              defaultValue={values.businessOwner}
            />
          </Field>

          <Field label="Target user" htmlFor="targetUser">
            <Input
              id="targetUser"
              name="targetUser"
              defaultValue={values.targetUser}
              placeholder="Customer service agents (approx. 40 people)"
            />
          </Field>

          <Field label="Current process" htmlFor="currentProcess" className="sm:col-span-2">
            <Textarea
              id="currentProcess"
              name="currentProcess"
              defaultValue={values.currentProcess}
              placeholder="How it works today, with numbers if you have them."
            />
          </Field>

          <Field label="Pain points" htmlFor="painPoints">
            <Textarea
              id="painPoints"
              name="painPoints"
              defaultValue={values.painPoints}
            />
          </Field>

          <Field label="Desired outcome" htmlFor="desiredOutcome">
            <Textarea
              id="desiredOutcome"
              name="desiredOutcome"
              defaultValue={values.desiredOutcome}
            />
          </Field>
        </div>

        <SectionLabel className="mt-8 mb-3">Data &amp; systems</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Data sources"
            htmlFor="dataSources"
            hint={<DummyDataHint />}
          >
            <Textarea
              id="dataSources"
              name="dataSources"
              defaultValue={values.dataSources}
              placeholder="Anonymized shipment export (CSV, 5000 rows), synthetic policy library."
            />
          </Field>

          <Field
            label="Systems & connectors"
            htmlFor="systemsConnectors"
            hint={<DummyDataHint />}
          >
            <Textarea
              id="systemsConnectors"
              name="systemsConnectors"
              defaultValue={values.systemsConnectors}
              placeholder="SharePoint, Dataverse, Teams, Power Automate"
            />
          </Field>

          <Field
            label="Agent output or action"
            htmlFor="agentOutput"
            hint="What does the agent actually produce or do?"
          >
            <Textarea
              id="agentOutput"
              name="agentOutput"
              defaultValue={values.agentOutput}
            />
          </Field>

          <Field
            label="Human approval point"
            htmlFor="humanApprovalPoint"
            hint="Where does a person confirm before anything consequential happens?"
          >
            <Textarea
              id="humanApprovalPoint"
              name="humanApprovalPoint"
              defaultValue={values.humanApprovalPoint}
            />
          </Field>
        </div>

        <SectionLabel className="mt-8 mb-3">Value &amp; scope</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Success metric"
            htmlFor="successMetric"
            hint="A measurable outcome the sponsor would recognise."
          >
            <Input
              id="successMetric"
              name="successMetric"
              defaultValue={values.successMetric}
              placeholder="Reduce average handling time by 40%"
            />
          </Field>

          <Field label="Constraints" htmlFor="constraints">
            <Input
              id="constraints"
              name="constraints"
              defaultValue={values.constraints}
            />
          </Field>

          <Field
            label="Smallest demoable slice"
            htmlFor="smallestSlice"
            className="sm:col-span-2"
            hint="The one path the team will show at the end. Without this the case fails a hard gate."
          >
            <Textarea
              id="smallestSlice"
              name="smallestSlice"
              defaultValue={values.smallestSlice}
              placeholder="Answer 'where is shipment X' for the anonymized sample set, in Teams, with a citation."
            />
          </Field>

          <Field label="Reuse potential" htmlFor="reusePotential">
            <Textarea
              id="reusePotential"
              name="reusePotential"
              defaultValue={values.reusePotential}
            />
          </Field>

          <Field
            label="Production vision"
            htmlFor="productionVision"
            hint="Where this goes after the hackathon — not what gets built during it."
          >
            <Textarea
              id="productionVision"
              name="productionVision"
              defaultValue={values.productionVision}
            />
          </Field>

          <Field
            label="Facilitator impact call"
            htmlFor="manualImpact"
            hint="Your gut read before the evaluator runs."
          >
            <Select
              id="manualImpact"
              name="manualImpact"
              defaultValue={values.manualImpact}
            >
              <option value="">Not set</option>
              {INFLUENCE_LEVELS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status" error={fieldErrors.status?.[0]}>
            <Select id="status" name="status" defaultValue={values.status}>
              {USECASE_STATUSES.filter((s) => !isEdit
                ? s === "Draft" || s === "Parked"
                : (s !== "Closed" && s !== "Qualified") || s === values.status).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-ink-soft">
              New cases start as Draft or Parked. Save canvas changes, then re-evaluate before advancing to Selected, Building or Demoed: all current gates must pass.
              Evaluation qualifies a case; Handoff closes it after saving its decision, owner and dated next action.
            </p>
          </Field>
        </div>

        <ActionFeedback error={error} onRefresh={() => {
          if (window.confirm("Discard this canvas's unsaved changes and load the latest saved record?")) window.location.reload();
        }} />

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create use case"}
          </Button>
          <Button type="button" onClick={() => router.push(isEdit ? `/hackathons/${hackathonId}/usecases/${useCaseId}` : `/hackathons/${hackathonId}/usecases`)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </Card>
      </fieldset>
    </form>
  );
}
