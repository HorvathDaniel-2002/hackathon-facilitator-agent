"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover border-transparent disabled:bg-accent/40",
  secondary:
    "bg-surface text-ink border-line-strong hover:bg-sunken disabled:text-ink-faint",
  ghost:
    "bg-transparent text-ink-soft border-transparent hover:bg-sunken hover:text-ink",
  danger:
    "bg-danger-soft text-danger border-transparent hover:bg-danger hover:text-white",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-xl border font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  children,
  href,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}

/** Circular icon-only button used in the top bar. */
export function IconButton({
  className,
  children,
  label,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        "border border-line bg-surface text-ink-soft transition-colors",
        "hover:bg-sunken hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
