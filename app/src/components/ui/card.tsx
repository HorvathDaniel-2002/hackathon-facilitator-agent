import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("flex items-start justify-between gap-4 mb-5", className)}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** Inset panel used for the "card inside a card" nesting in the reference layout. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-inner)] border border-line bg-surface-muted p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
