"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

export interface BarDatum {
  label: string;
  value: number;
  /** Renders in the accent colour — used to spotlight the leading bar. */
  highlight?: boolean;
}

/**
 * Rounded bar chart with a hover tooltip, matching the dashboard's visual
 * language. Hand-rolled SVG rather than a chart library: the shapes are simple
 * and it keeps the dependency surface (and the React 19 peer risk) at zero.
 */
export function BarChart({
  data,
  className,
  valueSuffix = "",
  emptyLabel = "No data yet",
}: {
  data: BarDatum[];
  className?: string;
  valueSuffix?: string;
  emptyLabel?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex h-[220px] items-center justify-center text-sm text-ink-faint",
          className,
        )}
      >
        {emptyLabel}
      </div>
    );
  }

  const W = 560;
  const H = 240;
  const PAD = { top: 28, right: 8, bottom: 28, left: 8 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Guard against an all-zero series, which would divide by zero.
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = plotW / data.length;
  const barW = Math.min(46, slot * 0.56);

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Bar chart"
      >
        {data.map((d, i) => {
          const h = Math.max(3, (d.value / max) * plotH);
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const y = PAD.top + plotH - h;
          const isHover = hovered === i;
          const fill = d.highlight ? "var(--color-accent-bright)" :
            isHover ? "var(--color-chart-hover)" : "var(--color-chart-muted)";

          return (
            <g
              key={`${d.label}-${i}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Full-height hit area so the tooltip triggers anywhere in the column. */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.min(barW / 2, 12)}
                fill={fill}
                stroke="var(--color-ink-faint)"
                strokeWidth={1}
                className="transition-[fill]"
              />
              <text
                x={x + barW / 2}
                y={H - 8}
                textAnchor="middle"
                className={cn(
                  "text-[10px]",
                  d.highlight || isHover
                    ? "fill-ink font-semibold"
                    : "fill-ink-faint",
                )}
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {hovered !== null
          ? (() => {
              const d = data[hovered];
              const h = Math.max(3, (d.value / max) * plotH);
              const cx = PAD.left + hovered * slot + slot / 2;
              const y = PAD.top + plotH - h;
              const text = `${d.value}${valueSuffix}`;
              const boxW = Math.max(34, text.length * 8 + 12);
              const bx = Math.min(Math.max(cx - boxW / 2, 2), W - boxW - 2);

              return (
                <g className="pointer-events-none">
                  <rect
                    x={bx}
                    y={Math.max(2, y - 26)}
                    width={boxW}
                    height={20}
                    rx={6}
                    fill="var(--color-ink)"
                  />
                  <text
                    x={bx + boxW / 2}
                    y={Math.max(2, y - 26) + 14}
                    textAnchor="middle"
                    className="fill-white text-[10px] font-semibold"
                  >
                    {text}
                  </text>
                </g>
              );
            })()
          : null}
      </svg>
    </div>
  );
}

/** Horizontal progress bar used for rubric sub-scores. */
export function ScoreBar({
  score,
  max = 5,
  tone = "accent",
  className,
}: {
  score: number;
  max?: number;
  tone?: "accent" | "info" | "warn" | "danger";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const colors = {
    accent: "bg-accent",
    info: "bg-info",
    warn: "bg-warn",
    danger: "bg-danger",
  };

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-sunken", className)}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", colors[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Segmented distribution bar, e.g. High / Medium / Low counts. */
export function StackedBar({
  segments,
  className,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <div className={cn("h-2.5 w-full rounded-full bg-sunken", className)} />;
  }

  return (
    <div className={cn("flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full", className)}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.value}`}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
    </div>
  );
}
