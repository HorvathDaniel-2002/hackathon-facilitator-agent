import { selectDashboardHackathon } from "@/components/layout/workspace-selection";
import { requireUser } from "@/lib/auth";
import { listHackathons } from "@/lib/queries";
import { notFound, redirect } from "next/navigation";

export default async function BoardHome({
  searchParams,
}: {
  searchParams: Promise<{ hackathon?: string | string[] }>;
}) {
  const user = await requireUser();
  const { hackathon } = await searchParams;
  const workspaces = await listHackathons(user.id);
  const active = selectDashboardHackathon(workspaces, hackathon);
  if (hackathon !== undefined && !active) notFound();
  if (!active) redirect("/hackathons");
  redirect(`/hackathons/${active.id}/usecases`);
}
