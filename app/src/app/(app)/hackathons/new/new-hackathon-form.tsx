"use client";

import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import type { ActionError } from "@/lib/actions/guard";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { createHackathon } from "@/lib/actions/hackathon";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewHackathonForm() {
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);

  function onSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await createHackathon(Object.fromEntries(formData.entries()));
      if (result.ok) router.push(`/hackathons/${result.data.id}/usecases`);
      else setError(result);
    });
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }} aria-busy={pending}>
      <fieldset disabled={pending} className="min-w-0">
        <Card>
          <CardHeader title="New workspace" subtitle="Start in Planning, then collect use cases and readiness evidence." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Hackathon name" required htmlFor="name" error={error?.fieldErrors?.name?.[0]}>
              <Input id="name" name="name" required placeholder="Contoso Logistics — AI Agents Hackathon" />
            </Field>
            <Field label="Customer" required htmlFor="customer" error={error?.fieldErrors?.customer?.[0]}>
              <Input id="customer" name="customer" required placeholder="Contoso Logistics" />
            </Field>
          </div>
          <ActionFeedback error={error} />
          <div className="mt-6 flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating…" : "Create hackathon"}</Button>
            <Button type="button" onClick={() => router.push("/hackathons")} disabled={pending}>Cancel</Button>
          </div>
        </Card>
      </fieldset>
    </form>
  );
}
