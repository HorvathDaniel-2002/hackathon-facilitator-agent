"use client";

import { Button } from "@/components/ui/button";
import type { ActionError } from "@/lib/actions/guard";

export function ActionFeedback({
  error,
  onRefresh,
  refreshHint = "Copy any unsaved changes before loading the latest saved record.",
}: {
  error: ActionError | null;
  onRefresh?: () => void;
  refreshHint?: string;
}) {
  if (!error) return null;
  return (
    <div role="alert" className="my-4 rounded-[var(--radius-inner)] bg-danger-soft px-4 py-3 text-sm text-danger">
      <p>{error.error}</p>
      {error.fieldErrors ? <ul className="mt-2 list-inside list-disc">
        {Object.entries(error.fieldErrors).flatMap(([field, messages]) =>
          messages.map((message) => <li key={`${field}-${message}`}>{field}: {message}</li>),
        )}
      </ul> : null}
      {error.code === "conflict" && onRefresh ? (
        <div className="mt-3">
          <p className="mb-2 text-xs">{refreshHint}</p>
          <Button type="button" size="sm" onClick={onRefresh}>Refresh latest</Button>
        </div>
      ) : null}
    </div>
  );
}
