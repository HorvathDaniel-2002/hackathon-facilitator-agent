"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { useActionTransition } from "@/components/use-action-transition";
import { Button } from "@/components/ui/button";
import type { ActionError } from "@/lib/actions/guard";
import { deleteUseCase, duplicateUseCase } from "@/lib/actions/usecase";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UseCaseActions({ hackathonId, useCaseId, version, title, owner }: {
  hackathonId: string; useCaseId: string; version: number; title: string; owner: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useActionTransition(setError);

  function duplicate() {
    setError(null);
    start(async () => {
      const result = await duplicateUseCase(hackathonId, useCaseId);
      if (result.ok) {
        router.push(`/hackathons/${hackathonId}/usecases/${result.data.id}/edit`);
        router.refresh();
      } else setError(result);
    });
  }

  function remove() {
    if (!window.confirm(`Permanently delete "${title}" and its evaluations, build guides, team assignments and handoff? This cannot be undone.`)) return;
    setError(null);
    start(async () => {
      const result = await deleteUseCase(hackathonId, useCaseId, version);
      if (result.ok) {
        router.push(`/hackathons/${hackathonId}/usecases`);
        router.refresh();
      } else setError(result);
    });
  }

  return <div className="mt-4 border-t border-line pt-4">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={pending} onClick={duplicate}>Duplicate / re-scope</Button>
      {owner ? <Button size="sm" variant="danger" disabled={pending} onClick={remove}>Delete use case</Button> : null}
    </div>
    <p className="mt-2 text-xs text-ink-soft">Duplicate creates a draft canvas without evaluations, build guides or handoff.</p>
    <ActionFeedback error={error} onRefresh={() => { setError(null); router.refresh(); }} />
  </div>;
}
