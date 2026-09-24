"use client";

import { useRef, useSyncExternalStore, useTransition } from "react";
import type { ActionError } from "@/lib/actions/guard";

export function useActionTransition(onError: (error: ActionError) => void) {
  const [pending, startTransition] = useTransition();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const inFlight = useRef(false);

  function start(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        await action();
      } catch {
        // Transport failures reject before a Server Action can return its typed error.
        onError({
          ok: false,
          code: "error",
          error: "The request could not be confirmed. Your entries are still here. Check your connection before trying again. If you were creating a record, check the list first to avoid a duplicate.",
        });
      } finally {
        inFlight.current = false;
      }
    });
  }

  // Before React attaches handlers, native form submission could leak values
  // into the URL and hydration can replace text typed into an uncontrolled input.
  return [pending || !hydrated, start] as const;
}

function subscribe() { return () => {}; }
