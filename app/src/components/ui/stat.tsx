import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Headline metric tile: label + icon, oversized number, optional delta pill.
 */
export function Stat({
  label,
  value,
  icon,
  delta,
  caption,
  highlight = false,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  caption?: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-inner)] p-5",
        highlight
          ? "border border-line bg-surface shadow-[var(--shadow-card)]"
          : "border border-transparent bg-transparent",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-ink-soft">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="text-4xl leading-none font-semibold tracking-tight text-ink tabular-nums">
          {value}
        </span>
        {delta ? <DeltaPill {...delta} /> : null}
      </div>

      {caption ? (
        <p className="mt-2 text-xs text-ink-faint">{caption}</p>
      ) : null}
    </div>
  );
}

export function DeltaPill({
  value,
  direction,
}: {
  value: string;
  direction: "up" | "down" | "flat";
}) {
  const tone =
    direction === "up"
      ? "bg-accent-soft text-accent"
      : direction === "down"
        ? "bg-danger-soft text-danger"
        : "bg-sunken text-ink-soft";

  const Icon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        tone,
      )}
    >
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {value}
    </span>
  );
}

/** Compact metric for dense rollup rows. */
export function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "accent" | "danger" | "warn" | "info";
}) {
  const tones = {
    neutral: "text-ink",
    accent: "text-accent",
    danger: "text-danger",
    warn: "text-warn",
    info: "text-info",
  };

  return (
    <div className="rounded-[var(--radius-inner)] border border-line bg-surface-muted px-4 py-3">
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl leading-none font-semibold tabular-nums",
          tones[tone],
        )}
      >
        {value}
      </p>
    </div>
  );
}
