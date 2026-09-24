import type { Prisma } from "@prisma/client";
import { assertWorkspaceWriteAccess, type WorkspaceWriteActor } from "@/lib/actions/guard";
import { AccessDeniedError } from "@/lib/auth";
import { AiError } from "./errors";

/** Lock lifecycle state before checking membership, then commit AI changes in the same transaction. */
export async function lockAiWorkspace(tx: Prisma.TransactionClient, hackathonId: string, actor: WorkspaceWriteActor) {
  const changed = await tx.hackathon.updateMany({
    where: { id: hackathonId }, data: { version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new AiError("Workspace not found.", 404);
  try {
    await assertWorkspaceWriteAccess(hackathonId, actor, tx);
  } catch (error) {
    if (error instanceof AccessDeniedError) throw new AiError("Your workspace access changed. Reload before generating or editing AI artifacts.", 403);
    if (typeof error === "object" && error !== null && "__validation" in error) {
      throw new AiError("AI changes are disabled for a closed or archived event. Reopen it to Planning first.", 409);
    }
    throw error;
  }
}
