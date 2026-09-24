"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

export function RecoveryPanel({ reference, retry }: { reference?: string; retry: () => void }) {
  return <main className="mx-auto my-12 max-w-xl rounded-3xl border border-line bg-surface p-6">
    <h1 className="text-2xl font-semibold">This page could not be loaded</h1>
    <p role="alert" className="mt-4 text-sm text-ink-soft">
      Try loading the page again. If a save was interrupted, check the saved record before repeating it.
      Unsaved form changes may need to be re-entered.
    </p>
    <p className="mt-3 text-sm text-ink-soft">
      If the problem continues, ask the application owner to check the service and database configuration.
      Do not reset or re-seed an existing database to resolve an error.
    </p>
    {reference && <p className="mt-3 text-xs text-ink-soft">Support reference: {reference}</p>}
    <div className="mt-5 flex flex-wrap gap-3">
      <Button onClick={retry} variant="primary">Try loading again</Button>
      <Link href="/hackathons" className="self-center text-sm underline">Back to workspaces</Link>
    </div>
  </main>;
}
