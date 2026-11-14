import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { Candidate } from "@/domain/resolution/engine";
import { coverState, exactCandidate } from "@/domain/covers/consent";
import type { ConsentHistory } from "@/features/covers/schema";
import { type Tx, ScheduleError } from "./scheduling-store";
export const consentFingerprint = (candidateId: string) => createHash("sha256").update(candidateId).digest("hex");

export async function consentHistory(tx: Tx, departmentId: string, occurrenceIds: string[], now: Date): Promise<ConsentHistory[]> {
  const where = { departmentId, item: { occurrenceId: { in: occurrenceIds } } };
  const covers = await tx.substitutionRequest.findMany({ where, include: { item: { select: { occurrenceId: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const exceptions = await tx.saturdayException.findMany({ where, include: { item: { select: { occurrenceId: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return [
    ...covers.map(r => ({ id: r.id, itemId: r.itemId, occurrenceId: r.item.occurrenceId, kind: "cover" as const, candidateId: (r.candidate as unknown as Candidate).id, status: coverState(r.status, r.expiresAt, now), createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), ...(r.respondedAt ? { respondedAt: r.respondedAt.toISOString() } : {}), ...(r.closureReason ? { closedReason: r.closureReason } : {}) })),
    ...exceptions.map(r => ({ id: r.id, itemId: r.itemId, occurrenceId: r.item.occurrenceId, kind: "saturday" as const, candidateId: (r.candidate as unknown as Candidate).id, status: r.status, createdAt: r.createdAt.toISOString(), ...(r.decidedAt ? { respondedAt: r.decidedAt.toISOString() } : {}), reason: r.requestReason, ...(r.decisionReason ? { decisionReason: r.decisionReason } : {}), ...(r.closureReason ? { closedReason: r.closureReason } : {}) })),
  ];
}
export async function consentEvent(tx: Tx, departmentId: string, actorId: string, entityId: string, action: string, before: string, after: string, recipients: string[], details: { candidateFingerprint?: string; reason?: string } = {}) {
  await tx.auditEvent.create({ data: { departmentId, actorId, entityId, action, before: { status: before }, after: { status: after, ...details } } });
  await tx.notification.createMany({ data: [...new Set(recipients)].map(recipientId => ({ departmentId, recipientId, changeId: `${entityId}:${action}`, message: `Recovery request: ${action.startsWith("SATURDAY") || action.startsWith("EXCEPTION") ? "Saturday exception" : "Cover invitation"} ${after.toLowerCase()}. Review Cover & exceptions. Teaching is unchanged pending publication.` })), skipDuplicates: true });
}
/** Persist expiration only in a locked write; every read still derives expiry from server time. */
export async function expireCovers(tx: Tx, departmentId: string, actorId: string, now: Date) {
  const expired = await tx.substitutionRequest.findMany({ where: { departmentId, status: "PENDING", expiresAt: { lte: now } } });
  for (const r of expired) {
    await tx.substitutionRequest.update({ where: { id: r.id }, data: { status: "EXPIRED", closedAt: now, closureReason: "Response deadline passed." } });
    await consentEvent(tx, departmentId, actorId, r.id, "COVER_EXPIRED", "PENDING", "EXPIRED", [r.requestedById, r.invitedUserId]);
  }
}
/** Stable plan items preserve history. Changed/cleared choices revoke all live consent on that item. */
export async function invalidateItemConsent(tx: Tx, departmentId: string, actorId: string, itemId: string, selectedId: string | null, now: Date) {
  const fingerprint = selectedId ? consentFingerprint(selectedId) : "";
  const covers = await tx.substitutionRequest.findMany({ where: { itemId, departmentId, status: { in: ["PENDING", "ACCEPTED"] }, candidateFingerprint: { not: fingerprint } } });
  for (const r of covers) {
    await tx.substitutionRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", closedAt: now, closureReason: "Saved candidate changed or was cleared. A new invitation is required." } });
    await consentEvent(tx, departmentId, actorId, r.id, "COVER_INVALIDATED", r.status, "CANCELLED", [r.invitedUserId, r.requestedById]);
  }
  const exceptions = await tx.saturdayException.findMany({ where: { itemId, departmentId, status: { in: ["PENDING", "APPROVED"] }, candidateFingerprint: { not: fingerprint } } });
  for (const r of exceptions) {
    await tx.saturdayException.update({ where: { id: r.id }, data: { status: "CANCELLED", closedAt: now, closureReason: "Saved candidate changed or was cleared. New HoD approval is required." } });
    await consentEvent(tx, departmentId, actorId, r.id, "EXCEPTION_INVALIDATED", r.status, "CANCELLED", [r.requestedById, ...(r.reviewerId ? [r.reviewerId] : [])]);
  }
}
/** Feature 007 must also rebuild/revalidate the schedule; this guard supplies exact consent only. */
export async function assertExactConsent(tx: Tx, departmentId: string, itemId: string, candidate: Candidate) {
  const item = await tx.resolutionItem.findFirst({ where: { id: itemId, departmentId } });
  if (!item || !exactCandidate(candidate, item.selectedCandidateId)) throw new ScheduleError("CONFLICT", "The saved candidate changed; new consent is required.");
  const fingerprint = consentFingerprint(candidate.id);
  if (candidate.tier === 1) {
    const r = await tx.substitutionRequest.findFirst({ where: { departmentId, itemId, candidateFingerprint: fingerprint, status: "ACCEPTED" } });
    if (!r || (r.candidate as unknown as Candidate).id !== candidate.id) throw new ScheduleError("CONFLICT", "This exact candidate needs an accepted cover response.");
  }
  if (candidate.tier === 5) {
    const r = await tx.saturdayException.findFirst({ where: { departmentId, itemId, candidateFingerprint: fingerprint, status: "APPROVED" } });
    if (!r || (r.candidate as unknown as Candidate).id !== candidate.id) throw new ScheduleError("CONFLICT", "This exact Saturday candidate needs HoD approval.");
  }
}
export const candidateJson = (candidate: Candidate) => candidate as unknown as Prisma.InputJsonValue;
