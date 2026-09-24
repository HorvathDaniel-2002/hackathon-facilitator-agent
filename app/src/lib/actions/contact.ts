"use server";

import { requireId, requireVersion, validationFailure, withAccess, workspaceTransaction } from "@/lib/actions/guard";
import { ConcurrencyConflictError } from "@/lib/db";
import { contactInputSchema, contactUpdateInputSchema } from "@/lib/schemas";
import { invalidateRunbookChecks } from "@/lib/runbook";
import { revalidatePath } from "next/cache";

export const createContact = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, raw: unknown) => {
    const parsed = contactInputSchema.safeParse(raw);
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const input = parsed.data;

    const contact = await workspaceTransaction(hackathonId, ctx, (tx) => tx.contact.create({
      data: {
        hackathonId,
        name: input.name,
        email: input.email || null,
        org: input.org || null,
        roleType: input.roleType,
        influence: input.influence,
        notes: input.notes || null,
      },
    }));

    revalidatePath(`/hackathons/${hackathonId}/contacts`);
    // Sponsor / BusinessOwner presence feeds the deterministic gates, so any
    // page showing gate state has to be refreshed too.
    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    return { id: contact.id };
  },
);

export const updateContact = withAccess(
  "Contributor",
  async (
    ctx,
    hackathonId: string,
    contactId: string,
    raw: unknown,
    expectedVersion: number,
  ) => {
    requireId(contactId, "contactId");
    requireVersion(expectedVersion);
    const parsed = contactUpdateInputSchema.safeParse(raw);
    if (!parsed.success) validationFailure(parsed.error.flatten().fieldErrors);
    const input = parsed.data;

    await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const current = await tx.contact.findFirst({ where: { id: contactId, hackathonId } });
    if (!current || current.version !== expectedVersion) throw new ConcurrencyConflictError("This contact");
    const result = await tx.contact.updateMany({
      where: { id: contactId, hackathonId, version: expectedVersion },
      data: {
        ...Object.fromEntries(
          Object.entries(input)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, v === "" ? null : v]),
        ),
        version: { increment: 1 },
      },
    });

    if (result.count === 0) throw new ConcurrencyConflictError("This contact");
    const roleChanged = input.roleType !== undefined && input.roleType !== current.roleType;
    const identityChanged = (input.name !== undefined && input.name !== current.name) ||
      (input.email !== undefined && (input.email || null) !== current.email);
    if (roleChanged || identityChanged) {
      const closedCase = await tx.useCase.findFirst({
        where: { hackathonId, status: "Closed", teamMembers: { some: { contactId } } },
      });
      if (closedCase) validationFailure({ name: ["Reopen linked closed use cases before changing a team member's identity or role."] });
      const processOwnerAffected = ["BusinessOwner", "Sponsor"].includes(current.roleType) ||
        (input.roleType !== undefined && ["BusinessOwner", "Sponsor"].includes(input.roleType));
      const affected = await tx.useCase.updateMany({
        where: { hackathonId, teamMembers: { some: { contactId } } },
        data: {
          version: { increment: 1 },
          ...(processOwnerAffected ? { processOwnerConfirmed: false } : {}),
        },
      });
      if (affected.count > 0) await invalidateRunbookChecks(hackathonId, "All", tx);
    }
    });

    revalidatePath(`/hackathons/${hackathonId}/contacts`);
    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    revalidatePath(`/hackathons/${hackathonId}/runbook`);
    return { updated: true };
  },
);

export const deleteContact = withAccess(
  "Contributor",
  async (ctx, hackathonId: string, contactId: string, expectedVersion: number) => {
    requireId(contactId, "contactId");
    requireVersion(expectedVersion);
    await workspaceTransaction(hackathonId, ctx, async (tx) => {
    const current = await tx.contact.findFirst({ where: { id: contactId, hackathonId } });
    if (!current || current.version !== expectedVersion) throw new ConcurrencyConflictError("This contact");
    const closedCase = await tx.useCase.findFirst({
      where: { hackathonId, status: "Closed", teamMembers: { some: { contactId } } },
    });
    if (closedCase) validationFailure({ name: ["Reopen linked closed use cases before deleting their team member."] });
    const affected = await tx.useCase.updateMany({
      where: { hackathonId, teamMembers: { some: { contactId } } },
      data: {
        version: { increment: 1 },
        ...(["BusinessOwner", "Sponsor"].includes(current.roleType) ? { processOwnerConfirmed: false } : {}),
      },
    });
    const result = await tx.contact.deleteMany({ where: { id: contactId, hackathonId, version: expectedVersion } });
    if (result.count !== 1) throw new ConcurrencyConflictError("This contact");
    if (affected.count > 0) await invalidateRunbookChecks(hackathonId, "All", tx);
    });
    revalidatePath(`/hackathons/${hackathonId}/contacts`);
    revalidatePath(`/hackathons/${hackathonId}/usecases`);
    revalidatePath(`/hackathons/${hackathonId}/runbook`);
    return { deleted: true };
  },
);
