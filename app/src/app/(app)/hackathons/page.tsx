import { Badge, humanize, STATUS_TONE } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth";
import { listHackathons } from "@/lib/queries";
import { Lightbulb, Sparkles, Users } from "lucide-react";
import Link from "next/link";

export default async function HackathonsPage() {
  const user = await requireUser();
  const hackathons = await listHackathons(user.id);

  if (hackathons.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="No hackathons yet"
          description="A workspace holds the use-case Kanban board, stakeholder map, readiness evidence and handoff."
          action={
            <LinkButton href="/hackathons/new" variant="primary">
              Create hackathon
            </LinkButton>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {hackathons.map((h) => {
        const myRole = h.memberships.find((m) => m.userId === user.id)?.role;
        return (
          <Link key={h.id} href={`/hackathons/${h.id}/usecases`} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-[var(--shadow-raised)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink">
                    {h.name}
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">
                    {h.customer}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[h.status] ?? "neutral"}>
                  {humanize(h.status)}
                </Badge>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-2">
                <Metric
                  icon={<Lightbulb className="h-3.5 w-3.5" />}
                  label="Cases"
                  value={h._count.useCases}
                />
                <Metric
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="People"
                  value={h._count.contacts}
                />
              </dl>

              <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                <span className="text-xs text-ink-faint">
                  Open use-case board
                </span>
                {myRole ? <Badge tone="neutral">{myRole}</Badge> : null}
              </div>
            </Card>
          </Link>
        );
      })}

      <Link href="/hackathons/new" className="group">
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-transparent p-6 text-center transition-colors group-hover:border-ink/25 group-hover:bg-surface/60">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-ink-soft">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <span className="mt-3 text-sm font-semibold text-ink">
            New hackathon
          </span>
          <span className="mt-1 text-xs text-ink-soft">
            Create a workspace
          </span>
        </div>
      </Link>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[var(--radius-inner)] bg-surface-muted px-3 py-2.5">
      <dt className="flex items-center gap-1 text-xs text-ink-faint">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-lg leading-none font-semibold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}
