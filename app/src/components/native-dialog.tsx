"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function NativeDialog({
  open,
  onClose,
  labelledBy,
  busy = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => { if (open && !busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-5 text-ink shadow-[var(--shadow-raised)] backdrop:bg-black/40 sm:p-6"
    >
      {open ? children : null}
    </dialog>
  );
}
