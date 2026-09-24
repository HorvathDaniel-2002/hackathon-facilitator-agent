"use client";

import { NavHackathon, Sidebar } from "@/components/layout/sidebar";
import { Topbar, type SearchItem } from "@/components/layout/topbar";
import { selectDashboardHackathon } from "@/components/layout/workspace-selection";
import { isWorkspaceFrozen } from "@/components/workspace-state";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Client half of the app shell.
 *
 * The layout is a server component (it does the data fetching), but the sidebar
 * has to know which hackathon is active, and that only exists in the URL. Rather
 * than threading route params through nested layouts, the shell resolves it from
 * the pathname here.
 */
export function AppShell({
  hackathons,
  searchItems,
  userName,
  isDevAuth,
  isDesktopAuth = false,
  children,
}: {
  hackathons: NavHackathon[];
  searchItems: SearchItem[];
  userName: string;
  isDevAuth: boolean;
  isDesktopAuth?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isBoard = /\/usecases$/.test(pathname);

  const match = pathname.match(/^\/hackathons\/([^/]+)/);
  const activeId = match && match[1] !== "new"
    ? match[1]
    : pathname === "/dashboard" ? searchParams.get("hackathon") : null;
  const active = activeId !== null
    ? hackathons.find((h) => h.id === activeId) ?? null
    : pathname === "/dashboard"
      ? selectDashboardHackathon(hackathons, null)
      : null;

  const { title, subtitle } = deriveTitle(pathname, active);

  const createHref = active
    ? active.editable && !isWorkspaceFrozen(active.status) ? `/hackathons/${active.id}/usecases/new` : undefined
    : "/hackathons/new";
  const createLabel = active ? "New use case" : "New hackathon";

  return (
    <div className={`flex min-h-screen flex-col md:flex-row ${isBoard ? "xl:h-dvh xl:min-h-0 xl:overflow-hidden" : ""}`}>
      <Sidebar hackathon={active} compact={isBoard} />

      <div className={`flex min-w-0 flex-1 flex-col px-4 md:pr-5 md:pl-1 ${isBoard ? "min-h-0 pb-2" : "pb-5"}`}>
        <Topbar
          title={title}
          subtitle={subtitle}
          userName={userName}
          createHref={createHref}
          createLabel={createLabel}
          searchItems={searchItems}
          exportsHref={active ? `/hackathons/${active.id}/exports` : undefined}
          compact={isBoard}
        />

        {isDevAuth ? <DevAuthBanner /> : null}
        {isDesktopAuth ? <div className="mb-3 shrink-0 rounded-[var(--radius-inner)] border border-info/25 bg-info-soft px-3 py-2 text-xs text-info">
          <strong>Local desktop preview.</strong>{" "}Single-user data in this Windows profile. Mock AI; not Microsoft Entra sign-in or corporate approval.
        </div> : null}
        {active && isWorkspaceFrozen(active.status) ? (
          <div role="status" className="mb-4 rounded-[var(--radius-inner)] border border-info/25 bg-info-soft px-4 py-3 text-sm text-info">
            {active.status === "Archived"
              ? "Archived workspace: content is read-only. An Owner must restore it to Planning before making changes."
              : "Closed workspace: scope, contacts and AI changes are paused. Follow-up outcomes and eligible follow-up runbook checks remain editable."}
            {" "}<Link href={`/hackathons/${active.id}/settings`} className="font-medium underline">Open Settings to reopen or restore.</Link>
          </div>
        ) : null}

        <main className={`min-w-0 flex-1 ${isBoard ? "xl:min-h-0 xl:overflow-hidden" : ""}`}>{children}</main>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 pt-3 text-[11px] text-ink-faint">
          <span>Created by <strong className="font-semibold text-ink-soft">Daniel Horvath</strong></span>
          <a className="underline decoration-line-strong underline-offset-2 hover:text-accent" href="mailto:dahorvath@microsoft.com">
            dahorvath@microsoft.com
          </a>
        </footer>
      </div>
    </div>
  );
}

function deriveTitle(
  pathname: string,
  active: NavHackathon | null,
): { title: string; subtitle?: string } {
  const sub = active ? `${active.name} · ${active.customer}` : undefined;

  if (pathname.startsWith("/dashboard")) return { title: "Dashboard", subtitle: sub };
  if (pathname === "/hackathons") return { title: "Hackathons" };
  if (pathname === "/hackathons/new") return { title: "New hackathon" };
  if (/\/usecases\/new$/.test(pathname))
    return { title: "New use case", subtitle: sub };
  if (/\/usecases\/[^/]+\/edit$/.test(pathname))
    return { title: "Edit use case", subtitle: sub };
  if (/\/usecases\/[^/]+$/.test(pathname))
    return { title: "Use case", subtitle: sub };
  if (pathname.endsWith("/usecases")) return { title: "Use-case board", subtitle: sub };
  if (pathname.endsWith("/contacts")) return { title: "Contacts", subtitle: sub };
  if (pathname.endsWith("/settings"))
    return { title: "Workspace settings", subtitle: sub };
  if (pathname.endsWith("/handoff")) return { title: "Handoff", subtitle: sub };
  if (pathname.endsWith("/runbook")) return { title: "Facilitator runbook", subtitle: sub };
  if (pathname.endsWith("/exports")) return { title: "Exports", subtitle: sub };
  if (/^\/hackathons\/[^/]+$/.test(pathname))
    return { title: "Use cases", subtitle: sub };

  return { title: "Hackathon Facilitator", subtitle: sub };
}

/**
 * R-10: dev auth has no real identity check, so it must be impossible to
 * mistake for the real thing. The build also refuses to start in production
 * with AUTH_MODE=dev.
 */
function DevAuthBanner() {
  return (
    <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-inner)] border border-info/25 bg-info-soft px-3 py-2 text-xs text-info">
      <strong className="font-semibold">Development sign-in.</strong>
      <span>
        No real identity check — anyone with access to this server is signed in as
        a seeded user. Use anonymized or synthetic data only.
      </span>
    </div>
  );
}
