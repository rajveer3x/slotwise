import "server-only";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireSession, sessionIdentity, actorSelect, AccessError } from "@/server/auth/session";
import { requireScope } from "@/server/auth/permissions";

export async function listAccounts() {
  const actor = await requireSession();
  requireScope(actor, ["ADMIN"], actor.departmentId);
  return getDb().user.findMany({ where: { departmentId: actor.departmentId }, select: { id: true, name: true, email: true, role: true, active: true }, orderBy: { email: "asc" } });
}
const changeSchema = z.object({ userId: z.string().min(1).max(100), active: z.boolean(), expectedActive: z.boolean() });
export async function setAccountActive(input: unknown) {
  const actorId = await sessionIdentity();
  return changeAccountActive(actorId, input);
}
// Only called with the server-resolved identity. Separate entry allows real-DB checks.
export async function changeAccountActive(actorId: string | null, input: unknown) {
  if (!actorId) throw new AccessError("UNAUTHORIZED");
  const change = changeSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    // Lock actor and target in stable order: revocations/role changes serialize
    // against this write, and competing status submissions detect stale input.
    // NO KEY UPDATE permits notification FKs to reference users while another
    // manager waits for the department lock, avoiding a publication deadlock.
    const ids = [...new Set([actorId, change.userId])].sort();
    for (const id of ids) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR NO KEY UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: actorSelect });
    if (!actor?.active) throw new AccessError("UNAUTHORIZED");
    requireScope(actor, ["ADMIN"], actor.departmentId);
    const target = await tx.user.findUnique({ where: { id: change.userId }, select: { departmentId: true, active: true } });
    if (!target || target.departmentId !== actor.departmentId || change.userId === actorId) throw new AccessError("FORBIDDEN");
    if (target.active !== change.expectedActive) return { ok: false as const, code: "STALE_VERSION", message: "Account access changed. Refresh before trying again." };
    await tx.user.update({ where: { id: change.userId }, data: { active: change.active } });
    return { ok: true as const, message: change.active ? "Account activated." : "Account revoked. Protected requests now require an active account." };
  });
}
