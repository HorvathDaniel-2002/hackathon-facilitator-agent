import { redirect } from "next/navigation";

export default async function RetiredMilestonesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/hackathons/${encodeURIComponent(id)}/usecases`);
}
