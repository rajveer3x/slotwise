import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma, type EmergencyRound } from "@/generated/prisma/client";
import { exactCandidate, invitationExpiry } from "@/domain/covers/consent";
import { resolveBatch, type Candidate, type Decisions } from "@/domain/resolution/engine";
import { localDate } from "@/domain/scheduling/timetable";
import { emergencyCommand, type EmergencyResult } from "@/features/emergency-cover/schema";
import { AccessError, actorSelect } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { candidateJson, consentHistory, expireCovers } from "./consent-store";
import { emergencyWorkerActor, isCoordinator, liveEmergency, skipEmergencySubstitutes, type Fallback } from "./emergency-store";
import { resolutionSnapshot, ScheduleError, type Tx } from "./scheduling-store";

const responseHours = 5 / 60;
const transactionOptions = { timeout: 30000, maxWait: 10000 };
const facultyRoles = ["FACULTY", "HOD"];
const unresolvedSource = {
  schedulingStatus: "CANCELLED", deliveryStatus: "PENDING", resolved: false, replacement: null,
  leaveRequest: { status: "APPROVED" }, entry: { timetableVersion: { status: "PUBLISHED" } },
  teachingObligation: { occurrences: { none: { OR: [{ schedulingStatus: "ACTIVE" }, { deliveryStatus: "HELD" }] } } },
} satisfies Prisma.ClassOccurrenceWhereInput;

async function actorFor(tx: Tx, id: string | null) {
  const actor = id ? await tx.user.findUnique({ where: { id }, select: actorSelect }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  if (!isCoordinator(actor.role) && !facultyRoles.includes(actor.role)) throw new AccessError("FORBIDDEN");
  if (actor.department.timezone !== "Asia/Kolkata") throw new ScheduleError("VALIDATION_ERROR", "This pilot supports Asia/Kolkata only.");
  return actor;
}

async function lockRound(tx: Tx, id: string, departmentId: string) {
  await tx.$queryRaw`SELECT id FROM "EmergencyRound" WHERE id = ${id} AND "departmentId" = ${departmentId} FOR UPDATE`;
  return tx.emergencyRound.findFirst({ where: { id, departmentId }, include: { offers: true, occurrence: { select: { replacement: { select: { id: true } } } } } });
}
type LockedRound = NonNullable<Awaited<ReturnType<typeof lockRound>>>;

const topics = {
  OPENED: "Emergency cover offers",
  WON: "Emergency cover filled",
  CANCELLED: "Emergency cover cancelled",
  EXPIRED: "Emergency cover expired",
};

async function roundEvent(tx: Tx, round: EmergencyRound, actorId: string, event: keyof typeof topics, notices: { recipientId: string; message: string }[], fallback?: Fallback) {
  const action = `EMERGENCY_${event}`;
  await tx.auditEvent.create({ data: {
    departmentId: round.departmentId, entityId: round.id, actorId, action,
    before: { status: event === "OPENED" ? "NONE" : event === "CANCELLED" ? round.status : "OPEN" },
    after: { status: event === "OPENED" ? "OPEN" : event, ...(fallback && { nextTier: fallback.candidate?.tier ?? null }) },
  } });
  await tx.notification.createMany({ data: notices.map(({ recipientId, message }) => ({
    departmentId: round.departmentId, recipientId, changeId: `${round.id}:${action}`,
    message: `Recovery request: ${topics[event]}. ${message}`,
  })), skipDuplicates: true });
}

async function previousRejections(tx: Tx, departmentId: string, occurrenceId: string, ownerId: string, now: Date) {
  const saved = await tx.resolutionItem.findFirst({ where: { departmentId, occurrenceId, plan: { ownerId, leaveRequestId: { not: null } } }, select: { rejectedCandidates: true } });
  const history = await consentHistory(tx, departmentId, [occurrenceId], now);
  return [
    ...((saved?.rejectedCandidates as Decisions["rejected"][string] | undefined) ?? []),
    ...history.filter(h => ["DECLINED", "EXPIRED", "REJECTED"].includes(h.status))
      .map(h => ({ candidateId: h.candidateId, reason: `Previous recovery response: ${h.status.toLowerCase()}.` })),
  ];
}

async function substituteOptions(tx: Tx, departmentId: string, occurrenceId: string, ownerId: string, now: Date, selected?: Candidate) {
  const snapshot = await resolutionSnapshot(tx, departmentId, [occurrenceId], undefined, { now, publishedOnly: true });
  const rejected = await previousRejections(tx, departmentId, occurrenceId, ownerId, now);
  // Keep the full tier-1 result for offers. The board still displays at most three.
  return resolveBatch(snapshot, {
    selected: selected ? { [occurrenceId]: selected.id } : {},
    rejected: { [occurrenceId]: rejected },
  }, { allSubstitutes: true })[0];
}

async function launch(tx: Tx, actorId: string, departmentId: string, occurrenceId: string, clock: () => Date) {
  const source = await tx.classOccurrence.findFirst({
    where: { id: occurrenceId, departmentId, ...unresolvedSource },
    select: { id: true, localDate: true, startAt: true, teachingObligationId: true },
  });
  const now = clock();
  if (!source || source.localDate !== localDate(now) || source.startAt <= now) throw new ScheduleError("CONFLICT", "Emergency cover requires an unresolved class on approved leave today, before class start.");
  const existing = await tx.emergencyRound.findFirst({ where: { departmentId, occurrenceId: source.id, ...liveEmergency } });
  if (existing) throw new ScheduleError("CONFLICT", "A round is already open or filled. Review its expiry or cancel it in Cover & exceptions.");
  await expireCovers(tx, departmentId, actorId, now);
  if (await tx.substitutionRequest.findFirst({ where: { departmentId, obligationId: source.teachingObligationId, status: { in: ["PENDING", "ACCEPTED"] } } })) {
    throw new ScheduleError("CONFLICT", "Review or cancel the outstanding cover invitation before starting an emergency round.");
  }
  const options = await substituteOptions(tx, departmentId, source.id, actorId, now);
  if (!options?.searchComplete) throw new ScheduleError("CONFLICT", "The substitute search was incomplete. Review the recovery board.");
  if (options.tier !== 1) throw new ScheduleError("CONFLICT", "No eligible substitutes are available. Review the recovery board for the next tier.");
  const byFaculty = new Map(options.candidates.map(candidate => [candidate.assignments[0].facultyId, candidate]));
  const recipients = await tx.faculty.findMany({
    where: { id: { in: [...byFaculty.keys()] }, departmentId, user: { active: true, role: { in: ["FACULTY", "HOD"] } } },
    select: { id: true, userId: true },
  });
  if (!recipients.length) throw new ScheduleError("CONFLICT", "No active eligible substitutes are available. Review the recovery board.");
  const createdAt = clock();
  const deadline = invitationExpiry(createdAt, source.startAt, responseHours);
  if (deadline <= createdAt) throw new ScheduleError("CONFLICT", "Class has started. Recompute the recovery options.");
  const round = await tx.emergencyRound.create({ data: {
    departmentId, createdById: actorId, occurrenceId: source.id, obligationId: source.teachingObligationId, createdAt, deadline,
    offers: { createMany: { data: recipients.map(f => ({ invitedUserId: f.userId, candidate: candidateJson(byFaculty.get(f.id)!) })) } },
  } });
  await roundEvent(tx, round, actorId, "OPENED", recipients.map(f => ({
    recipientId: f.userId, message: "Review your same-day offer in Cover & exceptions before its response deadline.",
  })));
  return { ok: true, id: round.id, message: `Emergency offers sent in-app to ${recipients.length} eligible substitutes.` } as const;
}

async function accept(tx: Tx, round: LockedRound, actorId: string, candidate: Candidate, clock: () => Date): Promise<EmergencyResult> {
  if (round.status === "WON") return round.winnerUserId === actorId
    ? { ok: true, id: round.id, message: "You accepted this cover. It awaits coordinator publication." }
    : { ok: false, code: "ALREADY_FILLED", message: "This emergency round is already filled." };
  const now = clock();
  if (round.status === "EXPIRED" || (round.status === "OPEN" && now >= round.deadline)) return { ok: false, code: "EXPIRED", message: "The emergency response deadline has passed." };
  if (round.status !== "OPEN") return { ok: false, code: "CONFLICT", message: "This round was cancelled. Refresh your offers." };

  const source = await tx.classOccurrence.findFirst({ where: { id: round.occurrenceId, departmentId: round.departmentId, ...unresolvedSource }, select: { id: true, startAt: true } });
  const current = source
    ? await substituteOptions(tx, round.departmentId, source.id, round.createdById, now, candidate)
    : null;
  if (!source || !current?.selected || current.selected.tier !== 1 || !exactCandidate(current.selected, candidate.id)) {
    return { ok: false, code: "STALE_VERSION", message: "The class or your eligibility changed. Refresh and let the coordinator review current options." };
  }
  const closedAt = clock();
  if (closedAt >= round.deadline || closedAt >= source.startAt) return { ok: false, code: "EXPIRED", message: "The emergency response deadline has passed." };

  // The locked round carries the only winning reference. All other offers are
  // closed by this same transition, so there are no per-offer writes to race.
  await tx.emergencyRound.update({ where: { id: round.id }, data: { status: "WON", winnerUserId: actorId, closedAt } });
  await roundEvent(tx, round, actorId, "WON", [
    { recipientId: round.createdById, message: "A substitute accepted. Review the winner and publish the validated change in Class recovery." },
    ...round.offers.map(offer => ({
      recipientId: offer.invitedUserId,
      message: offer.invitedUserId === actorId ? "Your acceptance awaits coordinator publication." : "Another substitute accepted. Your offer is closed.",
    })),
  ]);
  return { ok: true, id: round.id, message: "You accepted this cover. It awaits coordinator publication." };
}

async function cancel(tx: Tx, round: LockedRound, actorId: string, now: Date): Promise<EmergencyResult> {
  if (round.status === "EXPIRED" || (round.status === "OPEN" && now >= round.deadline)) return { ok: false, code: "EXPIRED", message: "The response window ended. The expiry worker will record the fallback." };
  if (round.occurrence.replacement || !["OPEN", "WON"].includes(round.status)) return { ok: false, code: "CONFLICT", message: "This round is already closed or published." };
  await tx.emergencyRound.update({ where: { id: round.id }, data: { status: "CANCELLED", winnerUserId: null, closedAt: now } });
  await roundEvent(tx, round, actorId, "CANCELLED", [...new Set([round.createdById, ...round.offers.map(o => o.invitedUserId)])].map(recipientId => ({
    recipientId, message: "The coordinator closed this round and can review another option.",
  })));
  return { ok: true, id: round.id, message: "Emergency round cancelled. Review another candidate in Class recovery." };
}

export async function changeEmergencyCover(actorId: string | null, input: unknown, clock = () => new Date()): Promise<EmergencyResult> {
  try {
    const command = emergencyCommand.parse(input);
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const fingerprint = createHash("sha256").update(JSON.stringify({ feature: "emergency-cover", command })).digest("hex");
    return await getDb().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await actorFor(tx, actorId), departmentId = actor.departmentId;
      if (command.operation === "accept" ? !facultyRoles.includes(actor.role) : !isCoordinator(actor.role)) throw new AccessError("FORBIDDEN");
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      const round = command.operation === "launch" ? null : await lockRound(tx, command.roundId, departmentId);
      const offer = round?.offers.find(o => o.invitedUserId === actorId);
      if (command.operation !== "launch" && (!round || (command.operation === "accept" && !offer))) throw new AccessError("FORBIDDEN");
      const candidate = offer?.candidate as unknown as Candidate | undefined;
      if (command.operation === "accept" && !await tx.faculty.findFirst({
        where: { departmentId, userId: actorId, archived: false, id: candidate!.assignments[0].facultyId },
        select: { id: true },
      })) throw new AccessError("FORBIDDEN");
      if (command.operation === "launch" && !await tx.classOccurrence.findFirst({ where: { id: command.occurrenceId, departmentId } })) throw new AccessError("FORBIDDEN");

      const receipt = await tx.mutationReceipt.findUnique({ where: { id: command.requestId } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) throw new ScheduleError("CONFLICT", "This retry key belongs to a different operation.");
        return receipt.result as EmergencyResult;
      }
      const result = command.operation === "launch" ? await launch(tx, actorId, departmentId, command.occurrenceId, clock)
        : command.operation === "accept" ? await accept(tx, round!, actorId, candidate!, clock)
        : await cancel(tx, round!, actorId, clock());
      if (result.ok) await tx.mutationReceipt.create({ data: { id: command.requestId, departmentId, actorId, fingerprint, result } });
      return result;
    }, transactionOptions);
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, code: error.code, message: "An authorized departmental account is required for this operation." };
    if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "The emergency request is invalid." };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return { ok: false, code: "CONFLICT", message: "The round changed. Refresh and review the current status." };
    console.error("Emergency cover operation failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, code: "ERROR", message: "Could not save the emergency request. Retry or refresh." };
  }
}

async function expireRound(id: string, departmentId: string, clock: () => Date) {
  return getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
    const round = await lockRound(tx, id, departmentId);
    const now = clock();
    if (!round || round.status !== "OPEN" || round.deadline > now) return false;
    const source = await tx.classOccurrence.findFirst({ where: { id: round.occurrenceId, departmentId, ...unresolvedSource } });
    let fallback: Fallback = { candidate: null, searchComplete: true, sourceResolved: !source };
    if (source) {
      const snapshot = await resolutionSnapshot(tx, departmentId, [source.id], undefined, { now, publishedOnly: true });
      const exclusions = skipEmergencySubstitutes(snapshot.affected[0], snapshot);
      const rejected = await previousRejections(tx, departmentId, source.id, round.createdById, now);
      const item = resolveBatch(snapshot, { selected: {}, rejected: { [source.id]: [...exclusions, ...rejected] } })[0];
      fallback = { candidate: item.candidates[0] ?? null, searchComplete: item.searchComplete, sourceResolved: false };
    }
    await tx.emergencyRound.update({ where: { id }, data: { status: "EXPIRED", closedAt: now, fallback: fallback as unknown as Prisma.InputJsonValue } });
    await roundEvent(tx, round, emergencyWorkerActor, "EXPIRED", [{
      recipientId: round.createdById,
      message: fallback.candidate ? `Review the proposed tier ${fallback.candidate.tier} in Cover & exceptions.` : "Open Cover & exceptions to review the fallback status.",
    }], fallback);
    return true;
  }, transactionOptions);
}

// A deadline stays queued in PostgreSQL until the state, audit event and notice
// commit together. A process exit anywhere before commit leaves it retryable.
export async function processEmergencyExpiry(clock = () => new Date()) {
  const due = await getDb().emergencyRound.findMany({
    where: { status: "OPEN", deadline: { lte: clock() } }, select: { id: true, departmentId: true },
    orderBy: [{ deadline: "asc" }, { id: "asc" }],
  });
  let expired = 0, failed = 0;
  for (const { id, departmentId } of due) {
    try { if (await expireRound(id, departmentId, clock)) expired++; }
    catch (error) {
      failed++;
      console.error("Emergency expiry will retry", id, error instanceof Error ? error.name : "Unknown error");
    }
  }
  return { expired, failed };
}

const cardInclude = {
  occurrence: { select: {
    leaveRequestId: true, startAt: true, endAt: true,
    room: { select: { code: true } }, section: { select: { code: true } },
    replacement: { select: { id: true } },
    teachingObligation: { select: { allocation: { select: { course: { select: { code: true, name: true } } } } } },
  } },
  winner: { select: { invitedUser: { select: { name: true } } } },
  _count: { select: { offers: true } },
} as const;

export async function readEmergencyCards(actorId: string | null) {
  return getDb().$transaction(async tx => {
    // The existing Cover & exceptions workspace also serves administrators.
    const actor = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: actorSelect }) : null;
    if (!actor?.active) throw new AccessError("UNAUTHORIZED");
    if (actor.role === "ADMIN") return [];
    if (!isCoordinator(actor.role) && !facultyRoles.includes(actor.role)) throw new AccessError("FORBIDDEN");
    const manage = isCoordinator(actor.role), now = new Date();
    const rounds = await tx.emergencyRound.findMany({
      where: { departmentId: actor.departmentId, ...(manage ? {} : { offers: { some: { invitedUserId: actor.id } } }) },
      include: cardInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rounds.map(row => {
      const { occurrence } = row;
      const awaitingExpiry = row.status === "OPEN" && row.deadline <= now;
      const published = !!occurrence.replacement && row.status === "WON";
      const fallback = manage ? row.fallback as unknown as Fallback | null : null;
      return {
        id: row.id, status: row.status, manage, awaitingExpiry, published,
        canAccept: !manage && row.status === "OPEN" && !awaitingExpiry && !occurrence.replacement,
        canCancel: manage && !occurrence.replacement && !awaitingExpiry && (row.status === "OPEN" || row.status === "WON"),
        offers: manage ? row._count.offers : null,
        winner: manage ? row.winner?.invitedUser.name ?? null : null,
        wonByMe: row.winnerUserId === actor.id,
        deadline: row.deadline.toISOString(), startAt: occurrence.startAt.toISOString(), endAt: occurrence.endAt.toISOString(),
        section: occurrence.section.code, room: occurrence.room?.code ?? null,
        course: occurrence.teachingObligation.allocation.course,
        fallback: fallback && {
          tier: fallback.candidate?.tier ?? null,
          assignments: fallback.candidate?.assignments.map(({ date, startMinute, endMinute }) => ({ date, startMinute, endMinute })) ?? [],
          searchComplete: fallback.searchComplete, sourceResolved: fallback.sourceResolved,
        },
        reviewHref: manage && occurrence.leaveRequestId && !occurrence.replacement
          ? `/resolutions?leave=${encodeURIComponent(occurrence.leaveRequestId)}&emergency=${encodeURIComponent(row.id)}` : null,
      };
    });
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}

export async function readEmergencyChoice(actorId: string | null, leaveId: string, roundId: string) {
  return getDb().$transaction(async tx => {
    const actor = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: actorSelect }) : null;
    if (!actor?.active) throw new AccessError("UNAUTHORIZED");
    if (!isCoordinator(actor.role)) return null;
    const round = await tx.emergencyRound.findFirst({
      where: { id: roundId, departmentId: actor.departmentId, occurrence: { leaveRequestId: leaveId, replacement: null } },
      include: { winner: { select: { candidate: true } } },
    });
    if (!round) return null;
    if (round.status === "WON" && round.createdById === actorId && round.winner) {
      return { occurrenceId: round.occurrenceId, candidateId: (round.winner.candidate as unknown as Candidate).id, kind: "winner" as const };
    }
    if (round.status === "EXPIRED") {
      const fallback = round.fallback as unknown as Fallback;
      return { occurrenceId: round.occurrenceId, candidateId: fallback.candidate?.id ?? null, kind: "fallback" as const };
    }
    return null;
  }, { isolationLevel: "RepeatableRead" });
}
