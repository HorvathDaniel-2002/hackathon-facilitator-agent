import { canEdit, getUserRole, requireUser } from "@/lib/auth";
import { getHackathon, listContacts } from "@/lib/queries";
import { notFound } from "next/navigation";
import { ContactsBoard } from "./contacts-board";
import { isWorkspaceFrozen } from "@/components/workspace-state";

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const hackathon = await getHackathon(user.id, id);
  if (!hackathon) notFound();

  const role = await getUserRole(user.id, id);
  const contacts = await listContacts(id);

  return (
    <ContactsBoard
      hackathonId={id}
      editable={canEdit(role) && !isWorkspaceFrozen(hackathon.status)}
      contacts={contacts.map((c) => ({
        id: c.id,
        version: c.version,
        name: c.name,
        email: c.email,
        org: c.org,
        roleType: c.roleType,
        influence: c.influence,
        notes: c.notes,
        useCases: c.teamMembers.map((tm) => tm.useCase),
      }))}
    />
  );
}
