import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { instant } from "@/domain/scheduling/timetable";
import { pollCommand, type PollCommand, type PollResult } from "@/features/makeup-polls/schema";
import { AccessError, actorSelect, sessionIdentity } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { buildResolutionBoard } from "./resolutions";
import { ScheduleError, type Tx } from "./scheduling-store";

type Actor = Prisma.UserGetPayload<{ select: typeof actorSelect }>;
type OpenCommand = Extract<PollCommand, { operation: "open" }>;
const managers = ["ADMIN", "COORDINATOR"];
const designation = { archived: false, isRepresentative: true } as const;
const pollOrder = [{ createdAt: "desc" }, { id: "desc" }] as const;
const settledOccurrences: Prisma.ClassOccurrenceWhereInput = { OR: [{ schedulingStatus: "ACTIVE" }, { deliveryStatus: "HELD" }] };

async function pollActor(tx: Tx, id: string | null) {
  const actor = id ? await tx.user.findUnique({ where: { id }, select: actorSelect }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  if (!managers.includes(actor.role) && actor.role !== "STUDENT") throw new AccessError("FORBIDDEN");
  return actor;
}

async function representativeSections(tx: Tx, actor: Actor) {
  const memberships = await tx.sectionMembership.findMany({
    where: { ...designation, departmentId: actor.departmentId, userId: actor.id, section: { archived: false, semester: { archived: false } } },
    select: { section: { select: { id: true, _count: { select: { memberships: { where: designation } } } } } },
  });
  // Legacy duplicate designations fail closed until corrected in Master data.
  return memberships.filter(m => m.section._count.memberships === 1).map(m => m.section.id);
}

export async function latestMakeupPolls(actorId: string, obligationIds: string[]) {
  if (!obligationIds.length) return {};
  return getDb().$transaction(async tx => {
    const actor = await pollActor(tx, actorId);
    if (!managers.includes(actor.role)) throw new AccessError("FORBIDDEN");
    const polls = await tx.makeupPoll.findMany({
      where: { departmentId: actor.departmentId, obligationId: { in: obligationIds } },
      distinct: ["obligationId"], orderBy: [...pollOrder],
      select: { id: true, obligationId: true },
    });
    return Object.fromEntries(polls.map(p => [p.obligationId, p.id]));
  }, { isolationLevel: "RepeatableRead" });
}

export async function readMakeupPolls(actorId: string | null, selectedId?: string) {
  return getDb().$transaction(async tx => {
    const actor = await pollActor(tx, actorId);
    const manager = managers.includes(actor.role);
    const sections = manager ? [] : await representativeSections(tx, actor);
    const scope = { departmentId: actor.departmentId, occurrence: manager ? undefined : { sectionId: { in: sections } } };
    const rows = await tx.makeupPoll.findMany({
      where: { ...scope, id: selectedId }, orderBy: [...pollOrder],
      select: {
        id: true, status: true, deadline: true, baseScheduleRevision: true,
        sourceId: true,
        options: { orderBy: { position: "asc" }, select: { position: true, startAt: true, endAt: true, facultyName: true, roomCode: true } },
        vote: { select: { voterId: true, position: true } },
        occurrence: { select: {
          startAt: true, replacement: { select: { id: true } }, section: { select: { code: true } },
          teachingObligation: { select: {
            _count: { select: { occurrences: { where: settledOccurrences } } },
            allocation: { select: { course: { select: { code: true, name: true } }, semester: { select: { scheduleRevision: true } } } },
          } },
        } },
      },
    });
    if (selectedId && !rows.length) throw new AccessError("FORBIDDEN");
    const now = new Date();
    const polls = rows.map(row => {
      const { allocation, _count } = row.occurrence.teachingObligation;
      const resolved = !!row.occurrence.replacement || _count.occurrences > 0;
      return {
        id: row.id, status: row.status === "OPEN" && (now >= row.deadline || resolved) ? "CLOSED" as const : row.status,
        deadline: row.deadline.toISOString(), originalStart: row.occurrence.startAt.toISOString(),
        course: `${allocation.course.code} · ${allocation.course.name}`, section: row.occurrence.section.code,
        options: row.options.map(o => ({ ...o, startAt: o.startAt.toISOString(), endAt: o.endAt.toISOString() })),
        preference: row.vote && (manager || row.vote.voterId === actor.id) ? row.vote.position : null,
        scheduleChanged: row.baseScheduleRevision !== allocation.semester.scheduleRevision,
        resolved,
        recoveryUrl: manager ? `/resolutions?leave=${encodeURIComponent(row.sourceId)}&poll=${encodeURIComponent(row.id)}` : null,
      };
    });
    return { manager, representative: sections.length > 0, polls };
  }, { isolationLevel: "RepeatableRead" });
}

export type PollView = Awaited<ReturnType<typeof readMakeupPolls>>["polls"][number];

// Re-enter the normal resolution draft with the exact snapshot ID. The normal
// compute, save, preview and publication paths all revalidate that selection.
export async function readPollPreference(actorId: string, sourceId: string, pollId: string) {
  return getDb().$transaction(async tx => {
    const actor = await pollActor(tx, actorId);
    if (!managers.includes(actor.role)) throw new AccessError("FORBIDDEN");
    const poll = await tx.makeupPoll.findFirst({
      where: { id: pollId, departmentId: actor.departmentId, sourceId },
      select: { occurrenceId: true, status: true, deadline: true, vote: { select: { option: { select: { candidateId: true } } } } },
    });
    if (!poll) throw new AccessError("FORBIDDEN");
    return {
      occurrenceId: poll.occurrenceId,
      candidateId: poll.status === "CLOSED" || (poll.status === "OPEN" && new Date() >= poll.deadline)
        ? poll.vote?.option.candidateId ?? null : null,
    };
  }, { isolationLevel: "RepeatableRead" });
}

async function openPoll(tx: Tx, actor: Actor, command: OpenCommand, now: () => Date) {
  const { board } = await buildResolutionBoard(tx, actor, command.sourceId);
  if (board.stale || board.token !== command.expectedToken || board.planVersion !== command.expectedVersion) {
    throw new ScheduleError("STALE_VERSION", "The schedule or draft changed. Recompute and save current choices before opening a poll.");
  }
  const item = board.items.find(i => i.original.occurrenceId === command.occurrenceId);
  if (!item || item.selectionError || item.tier !== 3) {
    throw new ScheduleError("STALE_VERSION", "This class no longer has these weekday options. Recompute the resolution board.");
  }
  const { obligationId, sectionId } = item.original;
  const latest = await tx.makeupPoll.findFirst({ where: { departmentId: actor.departmentId, obligationId }, orderBy: [...pollOrder], select: { id: true, status: true } });
  if ((latest?.id ?? null) !== command.expectedPollId) {
    throw new ScheduleError("STALE_VERSION", "Another poll was saved for this class. Refresh and review it before replacing it.");
  }
  const representatives = await tx.sectionMembership.findMany({
    where: { ...designation, departmentId: actor.departmentId, sectionId },
    select: { user: { select: { active: true, role: true } } },
  });
  if (representatives.length !== 1 || !representatives[0].user.active || representatives[0].user.role !== "STUDENT") {
    throw new ScheduleError("VALIDATION_ERROR", "Designate one active student representative for this section in Master data.");
  }
  const options = [];
  for (const candidateId of command.candidateIds) {
    const candidate = item.candidates.find(c => c.id === candidateId);
    if (!candidate) throw new ScheduleError("STALE_VERSION", "A selected option changed. Recompute and save your current draft choices.");
    // Publication can select a subset. Check each choice independently as well.
    const { board: subset } = await buildResolutionBoard(tx, actor, command.sourceId, {
      selected: { [command.occurrenceId]: candidateId }, rejected: board.decisions.rejected,
    });
    if (subset.items.find(i => i.original.occurrenceId === command.occurrenceId)?.selected?.id !== candidateId) {
      throw new ScheduleError("STALE_VERSION", "A selected option is unavailable on its own. Recompute the resolution board.");
    }
    const a = candidate.assignments[0];
    options.push({ position: options.length + 1, candidateId, startAt: instant(a.date, a.startMinute),
      endAt: instant(a.date, a.endMinute), facultyName: board.labels[a.facultyId], roomCode: board.labels[a.roomId!] });
  }
  const deadline = new Date(command.deadline), createdAt = now();
  if (deadline <= createdAt || options.some(o => deadline >= o.startAt)) {
    throw new ScheduleError("VALIDATION_ERROR", "Choose a future deadline before every offered class starts.");
  }
  if (latest && latest.status !== "CANCELLED") {
    await tx.makeupPoll.update({ where: { id: latest.id }, data: { status: "SUPERSEDED" } });
    await tx.auditEvent.create({ data: { departmentId: actor.departmentId, actorId: actor.id,
      action: "MAKEUP_POLL_SUPERSEDED", entityId: latest.id, before: { status: latest.status }, after: { status: "SUPERSEDED" } } });
  }
  return tx.makeupPoll.create({
    data: {
      departmentId: actor.departmentId, obligationId, occurrenceId: command.occurrenceId,
      sourceId: command.sourceId, createdById: actor.id, baseScheduleRevision: board.revision,
      deadline, createdAt, options: { create: options },
    },
    select: { id: true },
  });
}

export async function mutateMakeupPoll(input: unknown) { return changeMakeupPoll(await sessionIdentity(), input); }
export async function changeMakeupPoll(actorId: string | null, input: unknown, now = () => new Date()): Promise<PollResult> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const command = pollCommand.parse(input);
    const fingerprint = createHash("sha256").update(JSON.stringify({ feature: "makeup-poll", command })).digest("hex");
    return await getDb().$transaction(async tx => {
      // Read candidate teacher identity before locking to match publication's user lock order.
      const teacher = command.operation === "open" ? await tx.classOccurrence.findFirst({
        where: { id: command.occurrenceId, department: { users: { some: { id: actorId } } } },
        select: { faculty: { select: { userId: true } } },
      }) : null;
      const lockIds = [...new Set([actorId, ...(teacher ? [teacher.faculty.userId] : [])])].sort();
      for (const id of lockIds) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR NO KEY UPDATE`;
      const actor = await pollActor(tx, actorId), { departmentId } = actor;
      if (command.operation === "vote" ? actor.role !== "STUDENT" : !managers.includes(actor.role)) throw new AccessError("FORBIDDEN");
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      const poll = command.operation === "open" ? null : await tx.makeupPoll.findFirst({
        where: { id: command.pollId, departmentId },
        select: { id: true, status: true, deadline: true, occurrence: { select: {
          sectionId: true, replacement: { select: { id: true } },
          teachingObligation: { select: { _count: { select: { occurrences: { where: settledOccurrences } } } } },
        } }, options: { select: { position: true } } },
      });
      if (command.operation === "open" ? !teacher : !poll) throw new AccessError("FORBIDDEN");
      if (command.operation === "vote" && !(await representativeSections(tx, actor)).includes(poll!.occurrence.sectionId)) {
        throw new AccessError("FORBIDDEN");
      }
      const receipt = await tx.mutationReceipt.findUnique({ where: { id: command.requestId } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) {
          throw new ScheduleError("CONFLICT", "This retry key belongs to another operation.");
        }
        return receipt.result as unknown as PollResult;
      }
      let result: PollResult;
      if (command.operation === "open") {
        const created = await openPoll(tx, actor, command, now);
        await tx.auditEvent.create({ data: { departmentId, actorId, action: "MAKEUP_POLL_OPENED", entityId: created.id,
          before: {}, after: { status: "OPEN", options: command.candidateIds.length } } });
        result = { ok: true, pollId: created.id, message: "Poll opened for the section representative." };
      } else {
        const current = poll!;
        const timestamp = now();
        if (current.status !== "OPEN" || timestamp >= current.deadline || current.occurrence.replacement || current.occurrence.teachingObligation._count.occurrences) {
          throw new ScheduleError("STALE_VERSION", "This poll is closed, cancelled or superseded. Refresh for the current status.");
        }
        if (command.operation === "vote") {
          const { position } = command;
          if (!current.options.some(o => o.position === position)) throw new ScheduleError("VALIDATION_ERROR", "Choose an option from this poll.");
          const vote = { position, voterId: actorId, votedAt: timestamp };
          await tx.pollVote.upsert({ where: { pollId: current.id }, create: { ...vote, pollId: current.id, departmentId }, update: vote });
          await tx.auditEvent.create({ data: { departmentId, actorId, entityId: current.id,
            action: "MAKEUP_PREFERENCE_SAVED", before: {}, after: {} } });
          result = { ok: true, pollId: current.id, message: "Preference saved." };
        } else {
          const status = command.operation === "close" ? "CLOSED" : "CANCELLED";
          await tx.makeupPoll.update({ where: { id: current.id }, data: { status } });
          await tx.auditEvent.create({ data: { departmentId, actorId, entityId: current.id, action: `MAKEUP_POLL_${status}`,
            before: { status: current.status }, after: { status } } });
          result = { ok: true, pollId: current.id, message: status === "CLOSED" ? "Poll closed." : "Poll cancelled." };
        }
      }
      await tx.mutationReceipt.create({ data: { id: command.requestId, departmentId, actorId, fingerprint, result } });
      if (command.operation === "vote" && now() >= poll!.deadline) {
        throw new ScheduleError("STALE_VERSION", "The deadline passed while saving your preference. Refresh for the current status.");
      }
      return result;
    }, { timeout: 30000, maxWait: 10000 });
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, code: error.code, message: "You cannot access this poll with your current account or section membership." };
    if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Choose two or three weekday options and a valid deadline, or select one listed preference." };
    if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      return { ok: false, code: "CONFLICT", message: "The poll changed. Refresh and review it before retrying." };
    }
    console.error("Makeup poll operation failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, code: "ERROR", message: "Could not save the poll change. Retry or refresh." };
  }
}
