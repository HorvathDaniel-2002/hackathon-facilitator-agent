"use client";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Download, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface SearchItem {
  id: string;
  label: string;
  sublabel: string;
  href: string;
  group: string;
}

export function Topbar({
  title,
  subtitle,
  userName,
  createHref,
  createLabel = "Create",
  searchItems,
  exportsHref,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  userName: string;
  createHref?: string;
  createLabel?: string;
  searchItems: SearchItem[];
  exportsHref?: string;
  compact?: boolean;
}) {
  return (
    <header className={`flex shrink-0 flex-wrap items-center gap-3 px-1 ${compact ? "py-3" : "py-5"}`}>
      <div className="min-w-0 flex-1">
        <h1 className={`truncate font-semibold tracking-tight text-ink ${compact ? "text-2xl" : "text-3xl"}`}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-sm text-ink-soft">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex w-full flex-wrap items-center gap-2.5 lg:w-auto">
        <CommandSearch items={searchItems} />

        {createHref ? <Link
          href={createHref}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-white",
            "transition-colors hover:bg-accent-hover",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {createLabel}
        </Link> : null}

        {exportsHref ? <Link href={exportsHref} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink hover:bg-sunken">
          <Download className="h-4 w-4" aria-hidden />
          Exports
        </Link> : null}

        <Avatar name={userName} size="md" />
      </div>
    </header>
  );
}

function CommandSearch({ items }: { items: SearchItem[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const q = query.trim().toLowerCase();
  const results = q
    ? items
        .filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            i.sublabel.toLowerCase().includes(q),
        )
        .slice(0, 8)
    : [];

  // Reset the highlight when the result set changes, so Enter cannot navigate to
  // whatever happened to be at the old index. Done in the event handler rather
  // than an effect — setting state in an effect body causes a cascading render.
  function updateQuery(next: string) {
    setQuery(next);
    setActiveIndex(0);
    setOpen(true);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) {
        setOpen(false);
        setQuery("");
        router.push(target.href);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
      <Search
        className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        placeholder="Search anything..."
        aria-label="Search use cases, contacts and hackathons"
        aria-controls={open && q.length > 0 ? "command-search-results" : undefined}
        aria-describedby="command-search-hint"
        onChange={(e) => updateQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(
          "h-10 w-full rounded-xl border border-line-strong bg-surface pr-4 pl-10 text-sm text-ink sm:w-[220px]",
          "placeholder:text-ink-faint focus:outline-2 focus:outline-offset-0 focus:outline-ink/10",
        )}
      />
      <p id="command-search-hint" role="status" className="sr-only">
        {open && q ? results.length
          ? `${results.length} results. Use Up and Down to choose, Enter to open, Escape to dismiss. Selected: ${results[activeIndex]?.label ?? results[0].label}.`
          : "No matches."
          : "Search use cases, contacts and hackathons by name."}
      </p>

      {open && q.length > 0 ? (
        <div id="command-search-results" className="absolute top-12 right-0 left-0 z-50 overflow-hidden rounded-[var(--radius-inner)] border border-line bg-surface shadow-[var(--shadow-raised)]">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-faint">No matches</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={r.id}>
                  <Link
                    href={r.href}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-2.5 text-sm",
                      i === activeIndex ? "bg-sunken" : "bg-transparent",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {r.label}
                      </span>
                      <span className="block truncate text-xs text-ink-faint">
                        {r.sublabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
                      {r.group}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
