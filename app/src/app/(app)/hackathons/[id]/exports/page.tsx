import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getHackathon } from "@/lib/queries";
import { Card, CardHeader } from "@/components/ui/card";

export default async function ExportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!await getHackathon(user.id, id)) notFound();
  const kinds = [
    ["portfolio", "Use-case portfolio", "One row per use case with scores, gates, operational stages, delivery routes, owners and decisions."],
    ["readout", "Final readout", "Demo evidence, outcomes, limitations, decisions and follow-up schedule."],
    ["runbook", "Facilitator evidence", "Readiness, confirmations, blockers and source references."],
  ];
  return <div className="space-y-4">
    <Card><CardHeader title="Export the event package" subtitle="Portable artifacts for the sponsor readout and handoff." />
      <p className="text-sm text-ink-soft">Exports are not automatically sensitivity-labeled. Check the content, apply the required Microsoft labeling and get sharing approval before distribution. Print-ready views can be saved as PDF using your browser. Native DOCX/XLSX/PPTX generation is not included.</p>
    </Card>
    {kinds.map(([kind, title, description]) => <Card key={kind}>
      <CardHeader title={title} subtitle={description} />
      <div className="flex flex-wrap gap-4 text-sm font-medium">
        <a className="underline" href={`/api/export?hackathonId=${id}&kind=${kind}&format=markdown`}>Download Markdown</a>
        <a className="underline" href={`/api/export?hackathonId=${id}&kind=${kind}&format=html`} target="_blank" rel="noopener noreferrer">Open print-ready view</a>
        {kind === "portfolio" && <a className="underline" href={`/api/export?hackathonId=${id}&kind=portfolio&format=csv`}>Download Excel-compatible CSV</a>}
      </div>
    </Card>)}
  </div>;
}
