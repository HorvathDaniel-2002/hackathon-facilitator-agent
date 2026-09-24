"use client";

import { PLATFORM_LABELS, type Platform } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface MatrixPoint {
  id: string;
  code: string;
  title: string;
  value: number;
  feasibility: number;
  reusability: number;
  platform: Platform;
  href: string;
}

const PLATFORM_FILL: Record<Platform, string> = {
  CopilotStudio: "var(--color-accent)",
  AzureAI: "var(--color-violet)",
  Hybrid: "var(--color-warn)",
};

/**
 * Value / feasibility portfolio matrix — spec M8.
 *
 * y = business value, x = feasibility, bubble size = reusability,
 * colour = recommended platform. Top-right is "do this first".
 */
export function BubbleMatrix({
  points,
  className,
}: {
  points: MatrixPoint[];
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const router = useRouter();

  const W = 520;
  const H = 380;
  const PAD = { top: 20, right: 20, bottom: 44, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Rubric scale is 1–5; pad by half a step so bubbles at the extremes aren't clipped.
  const MIN = 0.5;
  const MAX = 5.5;
  const sx = (v: number) => PAD.left + ((v - MIN) / (MAX - MIN)) * plotW;
  const sy = (v: number) => PAD.top + plotH - ((v - MIN) / (MAX - MIN)) * plotH;
  const radius = (reuse: number) => 7 + (reuse / 5) * 11;

  const ticks = [1, 2, 3, 4, 5];

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Portfolio matrix plotting business value against feasibility"
      >
        {/* Quadrant wash: top-right = high value + high feasibility. */}
        <rect
          x={sx(3)}
          y={PAD.top}
          width={sx(MAX) - sx(3)}
          height={sy(3) - PAD.top}
          fill="var(--color-accent-soft)"
          opacity="0.5"
        />

        {ticks.map((t) => (
          <g key={`grid-${t}`}>
            <line
              x1={sx(t)}
              y1={PAD.top}
              x2={sx(t)}
              y2={PAD.top + plotH}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <line
              x1={PAD.left}
              y1={sy(t)}
              x2={PAD.left + plotW}
              y2={sy(t)}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <text
              x={sx(t)}
              y={PAD.top + plotH + 18}
              textAnchor="middle"
              className="fill-ink-faint text-[10px]"
            >
              {t}
            </text>
            <text
              x={PAD.left - 10}
              y={sy(t) + 3}
              textAnchor="end"
              className="fill-ink-faint text-[10px]"
            >
              {t}
            </text>
          </g>
        ))}

        <text
          x={PAD.left + plotW / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-ink-soft text-[11px] font-medium"
        >
          Feasibility →
        </text>
        <text
          x={-(PAD.top + plotH / 2)}
          y={13}
          textAnchor="middle"
          transform="rotate(-90)"
          className="fill-ink-soft text-[11px] font-medium"
        >
          Business value →
        </text>

        {points.map((p) => {
          const isHover = hovered === p.id;
          return (
            // A Next.js <Link> renders an HTML anchor, which does not behave as a
            // link inside an SVG document — it serialises href as [object Object]
            // and never navigates. Driving the router directly is the reliable
            // way to make an SVG shape clickable.
            <g
              key={p.id}
              role="link"
              tabIndex={0}
              aria-label={`${p.code} ${p.title}, value ${p.value} of 5, feasibility ${p.feasibility} of 5`}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(p.id)}
              onBlur={() => setHovered(null)}
              onClick={() => router.push(p.href)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(p.href);
                }
              }}
              className="cursor-pointer focus:outline-none"
            >
              <circle
                cx={sx(p.feasibility)}
                cy={sy(p.value)}
                r={radius(p.reusability)}
                fill={PLATFORM_FILL[p.platform]}
                fillOpacity={isHover ? 0.42 : 0.22}
                stroke={PLATFORM_FILL[p.platform]}
                strokeWidth={isHover ? 2.5 : 1.5}
              />
              <text
                x={sx(p.feasibility)}
                y={sy(p.value) + 3}
                textAnchor="middle"
                className="pointer-events-none fill-ink text-[9px] font-semibold"
              >
                {p.code.replace("UC-", "")}
              </text>
            </g>
          );
        })}

        {/* Tooltip is drawn last so it always sits above the bubbles. */}
        {hovered
          ? (() => {
              const p = points.find((x) => x.id === hovered);
              if (!p) return null;
              const label = `${p.code} · ${p.title}`;
              const boxW = Math.min(230, 8 + label.length * 5.6);
              // Flip the tooltip to the left near the right edge so it stays in frame.
              const cx = sx(p.feasibility);
              const flip = cx + boxW + 14 > W;
              const bx = flip ? cx - boxW - 12 : cx + 12;
              const by = Math.max(PAD.top, sy(p.value) - 34);

              return (
                <g className="pointer-events-none">
                  <rect
                    x={bx}
                    y={by}
                    width={boxW}
                    height={30}
                    rx={8}
                    fill="var(--color-ink)"
                  />
                  <text
                    x={bx + 8}
                    y={by + 13}
                    className="fill-white text-[10px] font-semibold"
                  >
                    {label.length > 38 ? `${label.slice(0, 37)}…` : label}
                  </text>
                  <text
                    x={bx + 8}
                    y={by + 24}
                    className="fill-accent-soft text-[9px]"
                  >
                    {PLATFORM_LABELS[p.platform]} · reuse {p.reusability}/5
                  </text>
                </g>
              );
            })()
          : null}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {(Object.keys(PLATFORM_FILL) as Platform[]).map((pf) => (
          <span key={pf} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: PLATFORM_FILL[pf] }}
            />
            {PLATFORM_LABELS[pf]}
          </span>
        ))}
        <span className="text-xs text-ink-faint">Bubble size = reusability</span>
      </div>
    </div>
  );
}
