"use client";

import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Route,
  Users,
  Settings,
  Sparkles,
  ListChecks,
  Columns3,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavHackathon {
  id: string;
  name: string;
  customer: string;
  status: string;
  editable: boolean;
}

const ICONS = {
  dashboard: LayoutGrid,
  usecases: Columns3,
  contacts: Users,
  handoff: Route,
  runbook: ListChecks,
} as const;

export function Sidebar({ hackathon, compact = false }: { hackathon: NavHackathon | null; compact?: boolean }) {
  const pathname = usePathname();

  const items = hackathon
    ? [
        {
          href: `/hackathons/${hackathon.id}/usecases`,
          label: "Use cases",
          icon: ICONS.usecases,
        },
        { href: `/dashboard?hackathon=${hackathon.id}`, label: "Dashboard", icon: ICONS.dashboard },
        {
          href: `/hackathons/${hackathon.id}/contacts`,
          label: "Contacts",
          icon: ICONS.contacts,
        },
        {
          href: `/hackathons/${hackathon.id}/runbook`,
          label: "Facilitator runbook",
          icon: ICONS.runbook,
        },
        {
          href: `/hackathons/${hackathon.id}/handoff`,
          label: "Handoff",
          icon: ICONS.handoff,
        },
      ]
    : [
        { href: "/board", label: "Use cases", icon: ICONS.usecases },
        { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard },
      ];

  return (
    <aside className={cn("flex w-full shrink-0 flex-col gap-3 px-3 pt-3 pb-2 md:w-[204px] md:gap-5 md:py-4",
      compact && "xl:w-[76px] xl:px-2")}>
      <Link href={hackathon ? `/hackathons/${hackathon.id}/usecases` : "/board"} aria-label="Hackathon Facilitator"
        title="Hackathon Facilitator" className={cn("flex items-center gap-3 px-2", compact && "xl:justify-center xl:px-0")}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-[var(--shadow-card)]">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <span className={cn("min-w-0", compact && "xl:sr-only")}>
          <span className="block truncate text-sm font-semibold text-ink">
            Hackathon
          </span>
          <span className="block truncate text-xs text-ink-faint">
            Facilitator
          </span>
        </span>
      </Link>

      <nav className="grid grid-cols-2 gap-1 min-[400px]:grid-cols-3 md:flex md:flex-col" aria-label="Main">
        {items.map((item) => {
          const itemPath = item.href.split("?")[0];
          const active = pathname === itemPath || pathname.startsWith(`${itemPath}/`);

          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-[var(--radius-inner)] px-2 py-2.5 text-xs font-medium transition-colors md:gap-3 md:px-3 md:text-sm",
                compact && "xl:justify-center xl:px-2 xl:py-3",
                active
                  ? "border border-accent/20 bg-accent-soft text-accent shadow-[var(--shadow-card)]"
                  : "border border-transparent text-ink-soft hover:bg-surface/70 hover:text-ink",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className={cn("break-words", compact && "xl:sr-only")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {hackathon ? <nav aria-label="Workspace" className="border-t border-line pt-3">
        <Link href={`/hackathons/${hackathon.id}/settings`}
          title="Settings"
          aria-current={pathname.endsWith("/settings") ? "page" : undefined}
          className={cn("flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-2.5 text-sm font-medium",
            compact && "xl:justify-center xl:px-2",
            pathname.endsWith("/settings") ? "bg-accent-soft text-accent shadow-[var(--shadow-card)]" : "text-ink-soft hover:bg-surface/70")}>
          <Settings className="h-[18px] w-[18px] shrink-0" aria-hidden /><span className={compact ? "xl:sr-only" : undefined}>Settings</span>
        </Link>
      </nav> : null}

      {hackathon ? (
        <div className={cn("rounded-[var(--radius-inner)] border border-line bg-surface p-3 md:mt-auto md:p-4", compact && "xl:border-0 xl:bg-transparent xl:p-0")}>
          <p className={cn("text-xs font-medium text-ink-faint", compact && "xl:sr-only")}>Active hackathon</p>
          <p className={cn("mt-1 truncate text-sm font-semibold text-ink", compact && "xl:sr-only")}>
            {hackathon.name}
          </p>
          <p className={cn("truncate text-xs text-ink-soft", compact && "xl:sr-only")}>{hackathon.customer}</p>
          <Link
            href="/hackathons"
            title="Switch hackathon"
            className={cn("mt-3 inline-flex items-center gap-2 text-xs font-medium text-ink underline underline-offset-2 hover:text-accent",
              compact && "xl:m-0 xl:w-full xl:justify-center xl:rounded-xl xl:bg-surface xl:p-3")}
          >
            {compact ? <LayoutGrid className="hidden h-5 w-5 xl:block" aria-hidden /> : null}
            <span className={compact ? "xl:sr-only" : undefined}>Switch hackathon</span>
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
