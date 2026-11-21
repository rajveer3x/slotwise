import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { AccessError, actorSelect, sessionIdentity } from "@/server/auth/session";
import { instant } from "@/domain/scheduling/timetable";
import { coverState, exactCandidate, invitationExpiry } from "@/domain/covers/consent";
import type { Candidate, Rejection } from "@/domain/resolution/engine";
import { coverCommand, type CoverCommand, type CoverResult, type CoverWorkspace, type ConsentCard } from "@/features/covers/schema";
import { buildResolutionBoard, recoveryPlanWhere, recoverySourceId, resolutionActor } from "./resolutions";
import { candidateJson, consentEvent, consentFingerprint, expireCovers } from "./consent-store";
import { liveEmergency } from "./emergency-store";
import { ScheduleError, type Tx } from "./scheduling-store";

const itemInclude = { plan: true, occurrence: { select: { leaveRequest: { select: { faculty: { select: { userId: true } } } } } } } as const;
async function actorFor(tx: Tx, id: string | null) {
  const actor = id ? await tx.user.findUnique({ where: { id }, select: actorSelect }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  if (actor.role === "STUDENT") throw new AccessError("FORBIDDEN");
  if (actor.department.timezone !== "Asia/Kolkata") throw new ScheduleError("VALIDATION_ERROR", "This pilot supports Asia/Kolkata only.");
  return actor;
}
const manager = (role: string) => ["ADMIN", "COORDINATOR"].includes(role);

// A missed replacement keeps its original leave provenance through its stable
// obligation. Neither its assigned teacher nor an original leave owner may
// approve that obligation's Saturday recovery.
async function recoveryOwnerIds(tx: Tx, occurrenceId: string) {
  const source = await tx.classOccurrence.findUniqueOrThrow({ where: { id: occurrenceId }, select: { faculty: { select: { userId: true } }, teachingObligation: { select: { occurrences: { where: { leaveRequestId: { not: null } }, select: { leaveRequest: { select: { faculty: { select: { userId: true } } } } } } } } } });
  return [...new Set([source.faculty.userId, ...source.teachingObligation.occurrences.flatMap(o => o.leaveRequest ? [o.leaveRequest.faculty.userId] : [])])];
}

/** Re-solve the saved whole batch against current resources; client candidate JSON is never trusted. */
async function currentSelection(tx: Tx, ownerId: string, leaveId: string, occurrenceId: string, candidateId: string) {
  const owner = await resolutionActor(tx, ownerId);
  const built = await buildResolutionBoard(tx, owner, leaveId);
  const item = built.plan?.items.find(i => i.occurrenceId === occurrenceId);
  const selected = built.board.items.find(i => i.original.occurrenceId === occurrenceId)?.selected;
  if (!item || item.status !== "DRAFT" || !selected || built.board.items.some(i => i.selectionError) || !exactCandidate(selected, candidateId) || item.selectedCandidateId !== candidateId) throw new ScheduleError("STALE_VERSION", "The saved candidate or current eligibility changed. Recompute, save and request fresh consent.");
  return { ...built, item, selected };
}
function failure(error: unknown): CoverResult {
  if (error instanceof AccessError) return { ok: false, code: error.code, message: error.code === "UNAUTHORIZED" ? "Sign in with an active account." : "You cannot perform this recovery operation." };
  if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Check the request fields. A Saturday request and decision each require a reason (up to 1,000 characters)." };
  if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return { ok: false, code: "CONFLICT", message: "Another response or draft change won. Refresh and review; nothing was partially saved." };
  console.error("Cover operation failed", error instanceof Error ? error.name : "Unknown error");
  return { ok: false, code: "ERROR", message: "Could not save this response. Retry or refresh; your input is retained." };
}
export async function mutateCover(input: unknown) { return changeCover(await sessionIdentity(), input); }
export async function changeCover(actorId: string | null, input: unknown): Promise<CoverResult> {
  try {
    const command = coverCommand.parse(input);
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const fingerprint = createHash("sha256").update(JSON.stringify({ feature: "cover", command })).digest("hex");
    return await getDb().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await actorFor(tx, actorId), departmentId = actor.departmentId;
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      // Authorize the entity before replaying receipts, independent of IDs and stale session roles.
      let cover, exception;
      if (command.operation === "invite" || command.operation === "request-exception") {
        if (!manager(actor.role)) throw new AccessError("FORBIDDEN");
        const plan = await tx.resolutionPlan.findFirst({ where: { departmentId, ownerId: actorId, ...recoveryPlanWhere(command.leaveId), items: { some: { occurrenceId: command.occurrenceId } } } });
        if (!plan) throw new AccessError("FORBIDDEN");
      } else if (command.operation === "approve-exception" || command.operation === "reject-exception") {
        exception = await tx.saturdayException.findFirst({ where: { id: command.id, departmentId }, include: { item: { include: itemInclude } } });
        if (!exception || actor.role !== "HOD" || exception.requestedById === actorId || (await recoveryOwnerIds(tx, exception.item.occurrenceId)).includes(actorId)) throw new AccessError("FORBIDDEN");
      } else {
        cover = await tx.substitutionRequest.findFirst({ where: { id: command.id, departmentId }, include: { item: { include: itemInclude } } });
        if (!cover) throw new AccessError("FORBIDDEN");
        if (command.operation === "cancel-cover") {
          if (!manager(actor.role) || cover.requestedById !== actorId) throw new AccessError("FORBIDDEN");
        } else {
          const faculty = await tx.faculty.findFirst({ where: { departmentId, userId: actorId, archived: false } });
          if (cover.invitedUserId !== actorId || !faculty || !(cover.candidate as unknown as Candidate).assignments.some(a => a.facultyId === faculty.id)) throw new AccessError("FORBIDDEN");
        }
      }
      const receipt = await tx.mutationReceipt.findUnique({ where: { id: command.requestId } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) throw new ScheduleError("CONFLICT", "This retry key belongs to another operation.");
        return receipt.result as unknown as CoverResult;
      }
      // Take time AFTER lock acquisition: waiting for a competing writer cannot extend the deadline.
      const now = new Date();
      await expireCovers(tx, departmentId, actorId, now);
      let result: CoverResult;
      if (command.operation === "invite" || command.operation === "request-exception") {
        result = await createRequest(tx, actorId, departmentId, command);
      } else if (exception && (command.operation === "approve-exception" || command.operation === "reject-exception")) {
        if (exception.status !== "PENDING") throw new ScheduleError("CONFLICT", "This exception already has a final decision or was invalidated. Refresh its history.");
        const candidate = exception.candidate as unknown as Candidate;
        if (command.operation === "approve-exception") {
          const current = await currentSelection(tx, exception.requestedById, recoverySourceId(exception.item.plan), exception.item.occurrenceId, candidate.id);
          if (current.selected.tier !== 5 || exception.candidateFingerprint !== consentFingerprint(current.selected.id) || ![1, 2, 3, 4].every(t => current.board.items.find(i => i.original.occurrenceId === exception!.item.occurrenceId)!.skippedTiers.includes(t))) throw new ScheduleError("CONFLICT", "Only an exact valid Saturday candidate with earlier-tier explanations can be approved.");
        }
        const decisionAt = new Date();
        if (command.operation === "approve-exception" && candidate.assignments.some(a => instant(a.date, a.startMinute) <= decisionAt)) throw new ScheduleError("STALE_VERSION", "This Saturday candidate has already started. Recompute before requesting approval.");
        const status = command.operation === "approve-exception" ? "APPROVED" : "REJECTED";
        await tx.saturdayException.update({ where: { id: exception.id }, data: { status, reviewerId: actorId, decisionReason: command.reason, decidedAt: decisionAt, closedAt: decisionAt } });
        await consentEvent(tx, departmentId, actorId, exception.id, `SATURDAY_${status}`, "PENDING", status, [exception.requestedById], { reason: command.reason, candidateFingerprint: exception.candidateFingerprint });
        result = { ok: true, id: exception.id, message: status === "APPROVED" ? "Exact Saturday candidate approved. It still awaits revalidation and publication." : "Saturday candidate rejected. Reason and history saved; coordinator can recompute." };
      } else if (cover) {
        const status = coverState(cover.status, cover.expiresAt, now);
        if (status === "EXPIRED") return { ok: false, code: "EXPIRED", message: "The response deadline has passed. This invitation is expired; ask the coordinator to recompute." };
        if (command.operation === "cancel-cover") {
          if (cover.item.status === "PUBLISHED" || !["PENDING", "ACCEPTED"].includes(status)) throw new ScheduleError("CONFLICT", "This invitation already has a final state.");
          await tx.substitutionRequest.update({ where: { id: cover.id }, data: { status: "CANCELLED", closedAt: now, closureReason: "Cancelled by the requesting coordinator." } });
          await consentEvent(tx, departmentId, actorId, cover.id, "COVER_CANCELLED", status, "CANCELLED", [cover.invitedUserId, cover.requestedById]);
          result = { ok: true, id: cover.id, message: "Invitation cancelled. Teaching is unchanged; a new invitation is needed for consent." };
        } else {
          if (status !== "PENDING") throw new ScheduleError("CONFLICT", "This invitation already has a final response or was cancelled. Refresh its history.");
          const candidate = cover.candidate as unknown as Candidate;
          if (command.operation === "accept") {
            const current = await currentSelection(tx, cover.requestedById, recoverySourceId(cover.item.plan), cover.item.occurrenceId, candidate.id);
            if (current.selected.tier !== 1 || cover.candidateFingerprint !== consentFingerprint(current.selected.id)) throw new ScheduleError("CONFLICT", "This exact candidate needs a new invitation.");
            const competing = await tx.substitutionRequest.findFirst({ where: { departmentId, obligationId: cover.obligationId, status: "ACCEPTED", id: { not: cover.id } } });
            if (competing) throw new ScheduleError("CONFLICT", "Another faculty response has already been accepted for this obligation.");
          }
          // Eligibility reads can take time too; recheck at the actual response write boundary.
          const respondedAt = new Date();
          if (respondedAt >= cover.expiresAt) {
            await expireCovers(tx, departmentId, actorId, respondedAt);
            return { ok: false, code: "EXPIRED", message: "The response deadline has passed. This invitation is expired; ask the coordinator to recompute." };
          }
          const finalStatus = command.operation === "accept" ? "ACCEPTED" : "DECLINED";
          await tx.substitutionRequest.update({ where: { id: cover.id }, data: { status: finalStatus, respondedAt, closedAt: respondedAt } });
          await consentEvent(tx, departmentId, actorId, cover.id, `COVER_${finalStatus}`, "PENDING", finalStatus, [cover.requestedById, cover.invitedUserId]);
          if (finalStatus === "ACCEPTED") {
            const others = await tx.substitutionRequest.findMany({ where: { departmentId, obligationId: cover.obligationId, status: "PENDING", id: { not: cover.id } } });
            for (const other of others) {
              await tx.substitutionRequest.update({ where: { id: other.id }, data: { status: "CANCELLED", closedAt: now, closureReason: "Another invited candidate was accepted for this obligation." } });
              await consentEvent(tx, departmentId, actorId, other.id, "COVER_COMPETING_CANCELLED", "PENDING", "CANCELLED", [other.requestedById, other.invitedUserId]);
            }
          }
          result = { ok: true, id: cover.id, message: finalStatus === "ACCEPTED" ? "Accepted—pending publication. Nothing is reserved; publication may still fail if the schedule changes." : "Cover declined. Response history saved; the coordinator can try the next candidate or tier." };
        }
      } else throw new AccessError("FORBIDDEN");
      await tx.mutationReceipt.create({ data: { id: command.requestId, departmentId, actorId, fingerprint, result: result as Prisma.InputJsonValue } });
      return result;
    }, { timeout: 30000, maxWait: 10000 });
  } catch (error) { return failure(error); }
}
async function createRequest(tx: Tx, actorId: string, departmentId: string, command: Extract<CoverCommand, { leaveId: string }>): Promise<CoverResult> {
  const current = await currentSelection(tx, actorId, command.leaveId, command.occurrenceId, command.candidateId);
  if (current.board.token !== command.expectedToken || current.board.planVersion !== command.expectedVersion) throw new ScheduleError("STALE_VERSION", "The schedule, responses or draft changed. Recompute and save before requesting consent.");
  const { selected, item } = current, a = selected.assignments[0];
  const startAt = instant(a.date, a.startMinute), endAt = instant(a.date, a.endMinute), now = new Date();
  if (startAt <= now) throw new ScheduleError("CONFLICT", "The candidate has already started.");
  if (command.operation === "invite") {
    if (await tx.emergencyRound.findFirst({ where: { departmentId, occurrenceId: item.occurrenceId, ...liveEmergency } })) throw new ScheduleError("CONFLICT", "An emergency round is open or filled for this class. Review it in Cover & exceptions.");
    if (selected.tier !== 1) throw new ScheduleError("VALIDATION_ERROR", "Only a saved substitute candidate can be invited.");
    const faculty = await tx.faculty.findFirst({ where: { id: a.facultyId, departmentId, archived: false, user: { active: true, role: { not: "STUDENT" } } }, select: { userId: true } });
    if (!faculty) throw new ScheduleError("CONFLICT", "The invited faculty profile is no longer active.");
    if (await tx.substitutionRequest.findFirst({ where: { departmentId, OR: [{ itemId: item.id, status: { in: ["PENDING", "ACCEPTED"] } }, { obligationId: a.obligationId, status: "ACCEPTED" }] } })) throw new ScheduleError("CONFLICT", "An invitation is already pending or a cover is accepted. Review or cancel it first.");
    const expiresAt = invitationExpiry(now, startAt, command.expiryHours);
    if (expiresAt <= now) throw new ScheduleError("CONFLICT", "This invitation would already be expired.");
    const r = await tx.substitutionRequest.create({ data: { departmentId, itemId: item.id, obligationId: a.obligationId, invitedUserId: faculty.userId, requestedById: actorId, candidateFingerprint: consentFingerprint(selected.id), candidate: candidateJson(selected), startAt, endAt, createdAt: now, expiresAt } });
    await consentEvent(tx, departmentId, actorId, r.id, "COVER_INVITED", "NONE", "PENDING", [faculty.userId, actorId], { candidateFingerprint: r.candidateFingerprint });
    return { ok: true, id: r.id, message: "Exact cover invitation sent in-app. Awaiting the invited faculty's response; no resources are reserved." };
  }
  const explanation = current.board.items.find(i => i.original.occurrenceId === command.occurrenceId)!;
  if (selected.tier !== 5 || ![1, 2, 3, 4].every(t => explanation.skippedTiers.includes(t))) throw new ScheduleError("VALIDATION_ERROR", "Only a saved Saturday candidate reached after earlier tiers can request an exception.");
  if (await tx.saturdayException.findFirst({ where: { departmentId, itemId: item.id, status: { in: ["PENDING", "APPROVED"] } } })) throw new ScheduleError("CONFLICT", "This item already has a pending or approved Saturday exception.");
  const owners = await recoveryOwnerIds(tx, command.occurrenceId);
  const hods = await tx.user.findMany({ where: { departmentId, active: true, role: "HOD", id: { notIn: [actorId, ...owners] } }, select: { id: true } });
  if (!hods.length) throw new ScheduleError("CONFLICT", "No eligible HoD approver is available. A different active departmental HoD must review this exception.");
  const r = await tx.saturdayException.create({ data: { departmentId, itemId: item.id, requestedById: actorId, candidateFingerprint: consentFingerprint(selected.id), candidate: candidateJson(selected), requestReason: command.reason, earlierTiers: explanation.rejections.filter(r => r.tier < 5) as unknown as Prisma.InputJsonValue } });
  await consentEvent(tx, departmentId, actorId, r.id, "SATURDAY_REQUESTED", "NONE", "PENDING", [actorId, ...hods.map(h => h.id)], { reason: command.reason, candidateFingerprint: r.candidateFingerprint });
  return { ok: true, id: r.id, message: "Exact Saturday exception requested with earlier-tier explanations. Awaiting a different HoD's decision." };
}

export async function readCoverWorkspace(actorId: string | null): Promise<CoverWorkspace> {
  return getDb().$transaction(async tx => {
    const actor = await actorFor(tx, actorId), departmentId = actor.departmentId;
    const now = new Date(), computedAt = now.toISOString();
    const covers = await tx.substitutionRequest.findMany({ where: { departmentId, OR: [{ invitedUserId: actor.id }, ...(manager(actor.role) ? [{ requestedById: actor.id }] : [])] }, include: { item: { include: itemInclude }, requestedBy: { select: { name: true } }, invitedUser: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    const exceptions = await tx.saturdayException.findMany({ where: { departmentId, ...(actor.role === "HOD" ? {} : { requestedById: actor.id }) }, include: { item: { include: itemInclude }, requestedBy: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    // Labels use explicit safe projections; private leave reasons and authentication fields never leave the server.
    const labels: Record<string, string> = {};
    for (const f of await tx.faculty.findMany({ where: { departmentId }, select: { id: true, user: { select: { name: true } } } })) labels[f.id] = f.user.name;
    for (const r of await tx.room.findMany({ where: { departmentId }, select: { id: true, code: true } })) labels[r.id] = r.code;
    for (const s of await tx.section.findMany({ where: { departmentId }, select: { id: true, code: true } })) labels[s.id] = s.code;
    for (const a of await tx.courseAllocation.findMany({ where: { departmentId }, select: { id: true, course: { select: { code: true, name: true } } } })) labels[a.id] = `${a.course.code} · ${a.course.name}`;
    const profile = await tx.faculty.findFirst({ where: { departmentId, userId: actor.id, archived: false }, select: { id: true } });
    const boards = new Map<string, Awaited<ReturnType<typeof buildResolutionBoard>> | null>();
    async function valid(item: (typeof covers)[number]["item"], candidate: Candidate) {
      if (!boards.has(item.plan.id)) {
        try { boards.set(item.plan.id, await buildResolutionBoard(tx, await resolutionActor(tx, item.plan.ownerId), recoverySourceId(item.plan))); }
        catch (error) { if (!(error instanceof AccessError)) throw error; boards.set(item.plan.id, null); }
      }
      const board = boards.get(item.plan.id)?.board;
      return !!board && !board.items.some(i => i.selectionError) && exactCandidate(candidate, item.selectedCandidateId) && board.items.find(i => i.original.occurrenceId === item.occurrenceId)?.selected?.id === candidate.id;
    }
    const coverCards: ConsentCard[] = [];
    for (const r of covers) {
      const candidate = r.candidate as unknown as Candidate, status = coverState(r.status, r.expiresAt, now), current = await valid(r.item, candidate);
      const own = r.invitedUserId === actor.id && candidate.assignments[0].facultyId === profile?.id;
      // Return labels for this card only, rather than identities from the entire department.
      const cardLabels = Object.fromEntries(candidate.assignments.flatMap(a => [a.allocationId, a.facultyId, a.sectionId, a.roomId ?? ""]).map(id => [id, labels[id] ?? "Unavailable record"]));
      coverCards.push({ id: r.id, itemId: r.itemId, occurrenceId: r.item.occurrenceId, kind: "cover", candidateId: candidate.id, candidate, labels: cardLabels, status, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), respondedAt: r.respondedAt?.toISOString(), closedReason: r.closureReason ?? undefined, requestedBy: r.requestedBy.name, invitedName: r.invitedUser.name, canRespond: own && status === "PENDING" && current, published: r.item.status === "PUBLISHED", canCancel: r.item.status !== "PUBLISHED" && r.requestedById === actor.id && manager(actor.role) && ["PENDING", "ACCEPTED"].includes(status), canReview: false, stale: r.item.status !== "PUBLISHED" && ["PENDING", "ACCEPTED"].includes(status) && !current });
    }
    const exceptionCards: ConsentCard[] = [];
    for (const r of exceptions) {
      const candidate = r.candidate as unknown as Candidate, current = await valid(r.item, candidate);
      const cardLabels = Object.fromEntries(candidate.assignments.flatMap(a => [a.allocationId, a.facultyId, a.sectionId, a.roomId ?? ""]).map(id => [id, labels[id] ?? "Unavailable record"]));
      exceptionCards.push({ id: r.id, itemId: r.itemId, occurrenceId: r.item.occurrenceId, kind: "saturday", candidateId: candidate.id, candidate, labels: cardLabels, status: r.status, createdAt: r.createdAt.toISOString(), respondedAt: r.decidedAt?.toISOString(), reason: r.requestReason, decisionReason: r.decisionReason ?? undefined, closedReason: r.closureReason ?? undefined, requestedBy: r.requestedBy.name, canRespond: false, canCancel: false, canReview: actor.role === "HOD" && r.requestedById !== actor.id && !(await recoveryOwnerIds(tx, r.item.occurrenceId)).includes(actor.id) && r.status === "PENDING" && current, earlierTiers: r.earlierTiers as unknown as Rejection[], published: r.item.status === "PUBLISHED", stale: r.item.status !== "PUBLISHED" && ["PENDING", "APPROVED"].includes(r.status) && !current });
    }
    const notifications = await tx.notification.findMany({ where: { departmentId, recipientId: actor.id, message: { startsWith: "Recovery request:" } }, select: { id: true, message: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 });
    return { covers: coverCards, exceptions: exceptionCards, notifications: notifications.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })), computedAt };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
