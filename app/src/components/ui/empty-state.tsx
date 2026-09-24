import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-inner)]",
        "border border-dashed border-line-strong bg-surface-muted px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-ink-faint">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-semibold tracking-wide text-ink-faint uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Label/value row used across settings and exit-package read views. */
export function DefinitionRow({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-3", className)}>
      <dt className="text-xs font-medium text-ink-faint">{label}</dt>
      <dd className="mt-1 text-sm whitespace-pre-line text-ink">
        {value || <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  );
}
