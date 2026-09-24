import { AppShell } from "@/components/layout/app-shell";
import { AccessDeniedError, canEdit, getCurrentUser, IS_DEV_AUTH, IS_DESKTOP_AUTH } from "@/lib/auth";
import { buildSearchIndex, listHackathons } from "@/lib/queries";
import Link from "next/link";
import type { MembershipRole } from "@/lib/schemas";
import { DevSessionRecovery } from "@/components/dev-session-recovery";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-semibold">Sign-in unavailable</h1>
        <p role="alert" className="mt-4 text-sm text-ink-soft">{error.message}</p>
        <p className="mt-3 text-sm text-ink-soft">Ask the application owner to check the authentication configuration. No workspace data has been loaded.</p>
      </main>
    );
  }

  // A clone with an empty database has no users at all — tell the developer what
  // to run instead of throwing an unhandled error.
  if (!user) return <NoUsers />;

  const [hackathons, searchItems] = await Promise.all([
    listHackathons(user.id),
    buildSearchIndex(user.id),
  ]);

  return (
    <AppShell
      hackathons={hackathons.map((h) => ({
        id: h.id,
        name: h.name,
        customer: h.customer,
        status: h.status,
        editable: !["Closed", "Archived"].includes(h.status) &&
          canEdit((h.memberships.find((m) => m.userId === user.id)?.role ?? null) as MembershipRole | null),
      }))}
      searchItems={searchItems}
      userName={user.name}
      isDevAuth={IS_DEV_AUTH}
      isDesktopAuth={IS_DESKTOP_AUTH}
    >
      {children}
    </AppShell>
  );
}

function NoUsers() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center shadow-[var(--shadow-card)]">
        <h1 className="text-lg font-semibold text-ink">Development sign-in unavailable</h1>
        <p className="mt-2 text-sm text-ink-soft">
          No allowed development identity was found. Use a seeded demo identity.
          For a new, empty local installation only, initialize the sample workspace:
        </p>
        <DevSessionRecovery />
        <pre className="mt-4 rounded-[var(--radius-inner)] bg-sunken px-4 py-3 text-left text-xs text-ink">
          npm run setup
        </pre>
        <Link
          href="/board"
          className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2"
        >
          Reload
        </Link>
      </div>
    </div>
  );
}
