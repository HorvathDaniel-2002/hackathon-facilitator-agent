"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function DevSessionRecovery() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function reset() {
    setPending(true);
    setError(null);
    try {
      const result = await fetch("/api/dev-session/reset", { method: "POST" });
      if (!result.ok) {
        setError("The demo session could not be reset. Ask the app owner to check local authentication.");
        return;
      }
      router.replace("/board");
      router.refresh();
    } catch {
      setError("The application could not be reached. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }
  return <div className="mt-4">
    <Button onClick={reset} disabled={pending} variant="primary">{pending ? "Resetting session..." : "Restore default demo sign-in"}</Button>
    <p className="mt-2 text-xs text-ink-soft">Clears this browser&apos;s demo cookie only. No workspace data is deleted.</p>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </div>;
}
