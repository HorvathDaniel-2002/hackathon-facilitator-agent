import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "danger"
  | "warn"
  | "info"
  | "violet";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-soft border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  info: "bg-info-soft text-info border-transparent",
  violet: "bg-violet-soft text-violet border-transparent",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  icon,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Semantic mappings so a band/status/platform always reads the same colour app-wide. */
export const BAND_TONE: Record<string, BadgeTone> = {
  High: "accent",
  Medium: "warn",
  Low: "danger",
};

export const PLATFORM_TONE: Record<string, BadgeTone> = {
  CopilotStudio: "info",
  AzureAI: "violet",
  Hybrid: "warn",
};

export const STATUS_TONE: Record<string, BadgeTone> = {
  Draft: "neutral",
  Qualified: "info",
  Selected: "violet",
  Building: "warn",
  Demoed: "accent",
  Closed: "accent",
  Parked: "neutral",
  Planning: "neutral",
  Ready: "info",
  Running: "warn",
  Archived: "neutral",
  NotStarted: "neutral",
  InProgress: "warn",
  Done: "accent",
  Blocked: "danger",
};

export const DECISION_TONE: Record<string, BadgeTone> = {
  Stop: "danger",
  CustomerLed: "info",
  PartnerLed: "violet",
  MicrosoftMotion: "accent",
};

/** Splits "NotStarted" / "CustomerLed" into readable words for labels. */
export function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}
