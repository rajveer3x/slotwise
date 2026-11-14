import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { AccessError, actorSelect, sessionIdentity } from "@/server/auth/session";
import { leaveDateError } from "@/domain/leave/rules";
import { localDate, instant } from "@/domain/scheduling/timetable";
import { leaveDates, leaveCommand, type LeaveImpact, type LeaveResult } from "@/features/leave/schema";
import type { Tx } from "./scheduling-store";

class LeaveError extends Error {
  constructor(public code: string, message: string, public field?: string) { super(message); }
}
async function actorFor(tx: Tx, id: string | null) {
  const actor = id ? await tx.user.findUnique({ where: { id }, select: actorSelect }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  if (!["FACULTY", "HOD", "COORDINATOR", "ADMIN"].includes(actor.role)) throw new AccessError("FORBIDDEN");
  if (actor.department.timezone !== "Asia/Kolkata") throw new LeaveError("VALIDATION_ERROR", "This pilot supports Asia/Kolkata only.");
  return actor;
}
async function owningFaculty(tx: Tx, actor: Awaited<ReturnType<typeof actorFor>>, unarchived = false) {
  if (!["FACULTY", "HOD"].includes(actor.role)) throw new AccessError("FORBIDDEN");
  const faculty = await tx.faculty.findFirst({ where: { departmentId: actor.departmentId, userId: actor.id, ...(unarchived ? { archived: false } : {}) } });
  if (!faculty) throw new AccessError("FORBIDDEN");
  return faculty;
}
async function semesterFor(tx: Tx, departmentId: string, id: string) {
  const semester = await tx.semester.findFirst({ where: { id, departmentId, archived: false } });
  if (!semester) throw new AccessError("FORBIDDEN");
  return semester;
}
function checkDates(start: string, end: string, semester: { startDate: string; endDate: string }) {
  const error = leaveDateError(start, end, semester);
  if (error) throw new LeaveError("VALIDATION_ERROR", error.message, error.field);
}
async function affected(tx: Tx, departmentId: string, facultyId: string, startDate: string, endDate: string) {
  // Teacher and dates are taken from the authorized owner/request, never browser faculty IDs.
  // Query all current assignments, including any future cross-semester teaching.
  return tx.classOccurrence.findMany({ where: { departmentId, facultyId, localDate: { gte: startDate, lte: endDate }, startAt: { gt: new Date() }, schedulingStatus: "ACTIVE", deliveryStatus: "PENDING" }, include: { teachingObligation: { include: { allocation: { include: { course: { select: { code: true, name: true } } } } } }, section: { select: { code: true } }, room: { select: { code: true } }, entry: { select: { timetableVersion: { select: { semesterId: true } } } } }, orderBy: [{ startAt: "asc" }, { id: "asc" }] });
}
function impactFor(rows: Awaited<ReturnType<typeof affected>>, revision: number): LeaveImpact {
  const classes = rows.map(o => ({ id: o.id, date: o.localDate, startMinute: Math.round((o.startAt.getTime() - instant(o.localDate, 0).getTime()) / 60000), endMinute: Math.round((o.endAt.getTime() - instant(o.localDate, 0).getTime()) / 60000), minutes: Math.round((o.endAt.getTime() - o.startAt.getTime()) / 60000), course: `${o.teachingObligation.allocation.course.code} · ${o.teachingObligation.allocation.course.name}`, section: o.section.code, room: o.room.code }));
  return { classes, minutes: classes.reduce((sum, o) => sum + o.minutes, 0), revision };
}
function failure(error: unknown): LeaveResult {
  if (error instanceof AccessError) return { ok: false, code: error.code, message: error.code === "UNAUTHORIZED" ? "Your session is no longer active. Sign in again." : "You do not have permission for this leave request." };
  if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted leave fields.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
  if (error instanceof LeaveError) return { ok: false, code: error.code, message: error.message, ...(error.field ? { fieldErrors: { [error.field]: [error.message] } } : {}) };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2004", "P2010", "P2034"].includes(error.code)) return { ok: false, code: "CONFLICT", message: "The request or schedule changed. No partial change was saved. Refresh and retry." };
  console.error("Leave operation failed", error instanceof Error ? error.name : "Unknown error");
  return { ok: false, code: "ERROR", message: "Could not complete this operation. No partial change was saved. Your input is retained; retry or refresh." };
}
// Authenticated adapter; actor IDs are never accepted from form payloads.
export async function previewLeave(input: unknown) { return readLeaveImpact(await sessionIdentity(), input); }
export async function readLeaveImpact(actorId: string | null, input: unknown): Promise<LeaveResult> {
  try {
    const dates = leaveDates.parse(input);
    return await getDb().$transaction(async tx => {
      const actor = await actorFor(tx, actorId), faculty = await owningFaculty(tx, actor, true);
      const semester = await semesterFor(tx, actor.departmentId, dates.semesterId);
      checkDates(dates.startDate, dates.endDate, semester);
      return { ok: true, message: "Provisional preview only. No classes or reservations were changed.", impact: impactFor(await affected(tx, actor.departmentId, faculty.id, dates.startDate, dates.endDate), semester.scheduleRevision) };
    }, { isolationLevel: "RepeatableRead" });
  } catch (error) { return failure(error); }
}
export async function readLeaveWorkspace(actorId: string | null, leaveId?: string) {
  return getDb().$transaction(async tx => {
    const actor = await actorFor(tx, actorId), departmentId = actor.departmentId;
    const profile = await tx.faculty.findFirst({ where: { departmentId, userId: actor.id } });
    const ownOnly = actor.role === "FACULTY";
    const where = { departmentId, ...(ownOnly ? { facultyId: profile?.id ?? "" } : {}) };
    // Explicitly select safe fields for list/coordinator/admin reads.
    const requests = await tx.leaveRequest.findMany({ where, select: { id: true, facultyId: true, startDate: true, endDate: true, status: true, version: true, faculty: { select: { userId: true, user: { select: { name: true } } } }, semester: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    const selected = leaveId ? requests.find(r => r.id === leaveId) : undefined;
    if (leaveId && !selected) throw new AccessError("FORBIDDEN");
    let detail = null;
    if (selected) {
      const canSeePrivate = selected.faculty.userId === actor.id || actor.role === "HOD";
      const privateFields = canSeePrivate ? await tx.leaveRequest.findUniqueOrThrow({ where: { id: selected.id }, select: { privateReason: true, rejectionReason: true } }) : null;
      const semester = await tx.leaveRequest.findUniqueOrThrow({ where: { id: selected.id }, select: { semester: { select: { scheduleRevision: true } } } });
      const current = await affected(tx, departmentId, selected.facultyId, selected.startDate, selected.endDate);
      const cancelled = await tx.classOccurrence.count({ where: { departmentId, leaveRequestId: selected.id } });
      detail = { ...selected, privateFields, impact: impactFor(current, semester.semester.scheduleRevision), cancelled, canReview: actor.role === "HOD" && selected.faculty.userId !== actor.id && selected.status === "SUBMITTED", canWithdraw: selected.faculty.userId === actor.id && ["FACULTY", "HOD"].includes(actor.role) && selected.status === "SUBMITTED" };
    }
    const semesters = await tx.semester.findMany({ where: { departmentId, archived: false, endDate: { gte: localDate() } }, select: { id: true, name: true, startDate: true, endDate: true, scheduleRevision: true }, orderBy: [{ active: "desc" }, { startDate: "asc" }] });
    const eligibleApprover = profile ? await tx.user.count({ where: { departmentId, role: "HOD", active: true, id: { not: actor.id } } }) > 0 : false;
    return { requests, detail, semesters, today: localDate(), canSubmit: !!profile && !profile.archived && ["FACULTY", "HOD"].includes(actor.role), eligibleApprover };
  }, { isolationLevel: "RepeatableRead" });
}
export type LeaveWorkspace = Awaited<ReturnType<typeof readLeaveWorkspace>>;
export async function mutateLeave(input: unknown) { return changeLeave(await sessionIdentity(), input); }
export async function changeLeave(actorId: string | null, input: unknown): Promise<LeaveResult> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const command = leaveCommand.parse(input);
    const fingerprint = createHash("sha256").update(JSON.stringify({ feature: "leave", command })).digest("hex");
    return await getDb().$transaction(async tx => {
      // Lock actor and the request owner in stable order before the department.
      // This also serializes owner eligibility against account revocation.
      const target = command.operation !== "submit" ? await tx.leaveRequest.findUnique({ where: { id: command.leaveId }, select: { faculty: { select: { userId: true } } } }) : null;
      const userIds = [...new Set([actorId, ...(target ? [target.faculty.userId] : [])])].sort();
      for (const id of userIds) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR NO KEY UPDATE`;
      const actor = await actorFor(tx, actorId), departmentId = actor.departmentId;
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      if (command.operation === "submit") await owningFaculty(tx, actor, true);
      else if (command.operation === "withdraw") { if (target?.faculty.userId !== actorId || !["FACULTY", "HOD"].includes(actor.role)) throw new AccessError("FORBIDDEN"); }
      else if (actor.role !== "HOD" || target?.faculty.userId === actorId) throw new AccessError("FORBIDDEN");
      const receipt = await tx.mutationReceipt.findUnique({ where: { id: command.requestId } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) throw new LeaveError("CONFLICT", "This request key was used for another operation. Refresh before retrying.");
        return receipt.result as unknown as LeaveResult;
      }
      let leaveId: string, message: string;
      if (command.operation === "submit") {
        const faculty = await owningFaculty(tx, actor, true);
        const semester = await semesterFor(tx, departmentId, command.semesterId);
        checkDates(command.startDate, command.endDate, semester);
        const overlap = await tx.leaveRequest.findFirst({ where: { departmentId, facultyId: faculty.id, status: { in: ["SUBMITTED", "APPROVED"] }, startDate: { lte: command.endDate }, endDate: { gte: command.startDate } } });
        if (overlap) throw new LeaveError("VALIDATION_ERROR", "These dates overlap pending or approved leave, including the boundary dates.", "startDate");
        const request = await tx.leaveRequest.create({ data: { departmentId, facultyId: faculty.id, semesterId: semester.id, startDate: command.startDate, endDate: command.endDate, privateReason: command.privateReason } });
        leaveId = request.id; message = "Leave submitted for HoD approval. The timetable is unchanged.";
        await tx.auditEvent.create({ data: { departmentId, actorId, action: "LEAVE_SUBMITTED", entityId: leaveId, before: {}, after: { status: "SUBMITTED", facultyId: faculty.id, startDate: command.startDate, endDate: command.endDate } } });
      } else {
        const request = await tx.leaveRequest.findFirst({ where: { id: command.leaveId, departmentId }, include: { faculty: { select: { userId: true, archived: true, user: { select: { active: true, role: true } } } }, semester: true } });
        if (!request) throw new AccessError("FORBIDDEN");
        const owner = request.faculty.userId === actor.id;
        if (command.operation === "withdraw" ? !owner || !["FACULTY", "HOD"].includes(actor.role) : actor.role !== "HOD" || owner) throw new AccessError("FORBIDDEN");
        if (request.status !== "SUBMITTED" || request.version !== command.expectedVersion) throw new LeaveError("STALE_VERSION", "This request changed or was already decided. Your input is retained. Refresh to see its current status.");
        const status = command.operation === "approve" ? "APPROVED" : command.operation === "reject" ? "REJECTED" : "WITHDRAWN";
        if (status === "REJECTED" && !command.rejectionReason) throw new LeaveError("VALIDATION_ERROR", "Give a rejection reason for the requesting faculty.", "rejectionReason");
        let ids: string[] = [], revision = request.semester.scheduleRevision;
        if (status === "APPROVED") {
          if (request.semester.archived || request.faculty.archived || !request.faculty.user.active || !["FACULTY", "HOD"].includes(request.faculty.user.role)) throw new LeaveError("CONFLICT", "The faculty or semester is no longer eligible. Reject this request or restore eligibility first.");
          checkDates(request.startDate, request.endDate, request.semester);
          const rows = await affected(tx, departmentId, request.facultyId, request.startDate, request.endDate);
          ids = rows.map(o => o.id);
          await tx.resourceReservation.deleteMany({ where: { departmentId, occurrenceId: { in: ids } } });
          await tx.classOccurrence.updateMany({ where: { departmentId, id: { in: ids } }, data: { schedulingStatus: "CANCELLED", leaveRequestId: request.id } });
          // Advance every affected semester, including the request's semester for zero-class leave.
          const semesterIds = [...new Set([request.semesterId, ...rows.map(o => o.entry.timetableVersion.semesterId)])];
          await tx.semester.updateMany({ where: { departmentId, id: { in: semesterIds } }, data: { scheduleRevision: { increment: 1 } } });
          revision++;
          // Fail closed if an affected interval began while this transaction was working.
          if (rows.some(o => o.startAt <= new Date()) || request.startDate < localDate()) throw new LeaveError("STALE_VERSION", "A class or leave date started during approval. Refresh and review current impact.");
        }
        await tx.leaveRequest.update({ where: { id: request.id }, data: { status, version: { increment: 1 }, decidedAt: new Date(), reviewerId: status === "WITHDRAWN" ? null : actorId, rejectionReason: status === "REJECTED" ? command.rejectionReason : null } });
        await tx.auditEvent.create({ data: { departmentId, actorId, action: `LEAVE_${status}`, entityId: request.id, before: { status: request.status, version: request.version, revision: request.semester.scheduleRevision }, after: { status, version: request.version + 1, revision, cancelledOccurrenceIds: ids } } });
        leaveId = request.id;
        message = status === "APPROVED" ? `Approved leave. ${ids.length} current future classes cancelled; obligations retained and delivery unchanged.${ids.length ? " Recovery remains unresolved." : " No class resolution is needed."}` : status === "REJECTED" ? "Leave rejected. The requesting faculty can read your decision reason." : "Pending leave withdrawn. The timetable is unchanged.";
      }
      const result: LeaveResult = { ok: true, message, leaveId };
      await tx.mutationReceipt.create({ data: { id: command.requestId, departmentId, actorId, fingerprint, result: result as Prisma.InputJsonValue } });
      return result;
    }, { timeout: 30000, maxWait: 10000 });
  } catch (error) { return failure(error); }
}
