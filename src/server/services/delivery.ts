import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { AccessError, actorSelect, sessionIdentity } from "@/server/auth/session";
import { deliveryCommand, type DeliveryResult } from "@/features/delivery/schema";
import { ledgerMinutes } from "@/domain/delivery/ledger";
import { ScheduleError, type Tx } from "./scheduling-store";

async function deliveryActor(tx: Tx, id: string | null) {
  const actor = id ? await tx.user.findUnique({ where: { id }, select: actorSelect }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  if (actor.role === "STUDENT") throw new AccessError("FORBIDDEN");
  return actor;
}
export async function mutateDelivery(input: unknown) { return changeDelivery(await sessionIdentity(), input); }
export async function changeDelivery(actorId: string | null, input: unknown): Promise<DeliveryResult> {
  try {
    const c = deliveryCommand.parse(input);
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const fingerprint = createHash("sha256").update(JSON.stringify({ feature: "delivery", command: c })).digest("hex");
    return await getDb().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await deliveryActor(tx, actorId), departmentId = actor.departmentId;
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      const o = await tx.classOccurrence.findFirst({ where: { id: c.occurrenceId, departmentId }, include: { faculty: true, teachingObligation: { include: { allocation: true } }, replacement: true } });
      const coordinator = actor.role === "COORDINATOR";
      if (!o || (!coordinator && (!["FACULTY", "HOD"].includes(actor.role) || o.faculty.userId !== actor.id || o.faculty.archived)) || (c.operation === "correct" && !coordinator)) throw new AccessError("FORBIDDEN");
      if (coordinator && !c.reason) throw new ScheduleError("VALIDATION_ERROR", "Coordinator confirmations and corrections require an audit reason.");
      const receipt = await tx.mutationReceipt.findUnique({ where: { id: c.requestId } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) throw new ScheduleError("CONFLICT", "This retry key belongs to another operation.");
        return receipt.result as unknown as DeliveryResult;
      }
      // The clock is read after lock acquisition; exactly at end is permitted.
      const now = new Date();
      if (o.endAt > now) throw new ScheduleError("VALIDATION_ERROR", "Confirm delivery only after the class has ended.");
      const current = await tx.deliveryRecord.findFirst({ where: { occurrenceId: o.id, current: true } });
      let result: DeliveryResult;
      if (c.operation === "confirm" && current?.status === c.status) {
        result = { ok: true, recordId: current.id, message: "Delivery was already recorded. Credit is counted once." };
      } else {
        if ((current?.id ?? null) !== c.expectedRecordId) throw new ScheduleError("STALE_VERSION", "Delivery changed. Refresh current status before submitting a correction; your input is retained.");
        if (c.operation === "correct" && current?.status === c.status) throw new ScheduleError("VALIDATION_ERROR", "Choose a different delivery outcome for a correction.");
        if (o.replacement || (!current && (o.schedulingStatus !== "ACTIVE" || o.deliveryStatus !== "PENDING"))) throw new ScheduleError("CONFLICT", "This class was cancelled or replaced. Record delivery against the current assignment; review recovery before correcting history.");
        if (await tx.classOccurrence.count({ where: { teachingObligationId: o.teachingObligationId, id: { not: o.id }, OR: [{ schedulingStatus: "ACTIVE" }, { deliveryStatus: "HELD" }] } })) throw new ScheduleError("CONFLICT", "This obligation already has another assignment or delivery. Review recovery before correcting history.");
        const minutes = (o.endAt.getTime() - o.startAt.getTime()) / 60000;
        if (minutes !== o.teachingObligation.requiredMinutes) throw new ScheduleError("CONFLICT", "Scheduled duration differs from the obligation. Partial or split delivery is outside this MVP.");
        if (current) await tx.deliveryRecord.update({ where: { id: current.id }, data: { current: false, supersededAt: now } });
        const record = await tx.deliveryRecord.create({ data: { departmentId, obligationId: o.teachingObligationId, occurrenceId: o.id, status: c.status, confirmedMinutes: c.status === "HELD" ? minutes : 0, confirmedById: actorId, reason: current || coordinator ? c.reason : null, createdAt: now } });
        // Scheduling and delivery remain distinct. A missed class releases past resources;
        // correcting it does not resurrect a cancelled reservation or a replaced schedule.
        await tx.classOccurrence.update({ where: { id: o.id }, data: { deliveryStatus: c.status, ...(c.status === "NOT_HELD" ? { schedulingStatus: "CANCELLED" } : {}) } });
        if (c.status === "NOT_HELD") await tx.resourceReservation.deleteMany({ where: { occurrenceId: o.id, departmentId } });
        await tx.semester.update({ where: { id: o.teachingObligation.allocation.semesterId }, data: { scheduleRevision: { increment: 1 } } });
        await tx.auditEvent.create({ data: { departmentId, actorId, action: current ? "DELIVERY_CORRECTED" : "DELIVERY_CONFIRMED", entityId: o.id, before: { recordId: current?.id ?? null, status: o.deliveryStatus, minutes: current?.confirmedMinutes ?? 0, schedulingStatus: o.schedulingStatus }, after: { recordId: record.id, obligationId: o.teachingObligationId, status: c.status, minutes: record.confirmedMinutes, schedulingStatus: c.status === "NOT_HELD" ? "CANCELLED" : o.schedulingStatus, ...(current || coordinator ? { reason: c.reason! } : {}) } } });
        result = { ok: true, recordId: record.id, message: c.status === "HELD" ? "Held recorded. This obligation receives credit once." : "Not held recorded. No credit earned; the same obligation remains available for recovery." };
      }
      await tx.mutationReceipt.create({ data: { id: c.requestId, departmentId, actorId, fingerprint, result: result as Prisma.InputJsonValue } });
      return result;
    }, { timeout: 30000, maxWait: 10000 });
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, code: error.code, message: "You cannot record or correct delivery for this class." };
    if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Check the outcome. Corrections require a current record and a reason of 1–1,000 characters." };
    if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2004", "P2010", "P2034"].includes(error.code)) return { ok: false, code: "CONFLICT", message: "Another delivery or scheduling change won. Refresh and review; no partial change committed." };
    console.error("Delivery failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, code: "ERROR", message: "Could not save delivery. No partial change committed. Your input is retained; retry or refresh." };
  }
}
async function readWorkspace(actorId: string | null, semesterId: string | undefined, ledgerOnly: boolean) {
  return getDb().$transaction(async tx => {
    const actor = await deliveryActor(tx, actorId), departmentId = actor.departmentId;
    const manager = actor.role === "COORDINATOR", canViewLedger = ["COORDINATOR", "HOD", "ADMIN"].includes(actor.role);
    if (ledgerOnly && !canViewLedger) throw new AccessError("FORBIDDEN");
    const semesters = await tx.semester.findMany({ where: { departmentId }, select: { id: true, name: true, active: true }, orderBy: [{ active: "desc" }, { startDate: "desc" }] });
    const semester = semesterId ? semesters.find(s => s.id === semesterId) : semesters[0];
    if (semesterId && !semester) throw new AccessError("FORBIDDEN");
    const now = new Date().toISOString();
    const allocations = semester && ledgerOnly ? await tx.courseAllocation.findMany({ where: { departmentId, semesterId: semester.id }, include: { course: { select: { code: true, name: true } }, section: { select: { code: true } }, obligations: { include: { deliveryRecords: { select: { current: true, status: true, confirmedMinutes: true } }, occurrences: { select: { endAt: true, schedulingStatus: true, deliveryStatus: true } } } } }, orderBy: [{ courseId: "asc" }, { sectionId: "asc" }] }) : [];
    const ledger = canViewLedger ? allocations.map(a => ({ id: a.id, course: `${a.course.code} · ${a.course.name}`, section: a.section.code, ...ledgerMinutes(a.requiredContactMinutes, a.obligations.map(o => ({ id: o.id, requiredMinutes: o.requiredMinutes, dueAt: o.occurrences.map(x => x.endAt.toISOString()).sort()[0] ?? null, records: o.deliveryRecords, occurrences: o.occurrences.map(x => ({ ...x, endAt: x.endAt.toISOString() })) })), now) })) : [];
    const occurrences = semester && !ledgerOnly ? await tx.classOccurrence.findMany({ where: { departmentId, teachingObligation: { allocation: { semesterId: semester.id } }, ...(manager ? {} : { faculty: { userId: actor.id, archived: false }, ...(actor.role === "ADMIN" ? { id: "" } : {}) }) }, include: { faculty: { select: { user: { select: { name: true } } } }, section: { select: { code: true } }, teachingObligation: { include: { allocation: { select: { course: { select: { code: true, name: true } } } }, occurrences: { select: { id: true, schedulingStatus: true, deliveryStatus: true } } } }, replacement: { select: { id: true } }, deliveryRecords: { select: { id: true, status: true, confirmedMinutes: true, current: true, reason: true, createdAt: true, confirmedBy: { select: { name: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: [{ startAt: "desc" }, { id: "asc" }] }) : [];
    return { coordinator: manager, semesters, semesterId: semester?.id ?? null, now, canViewLedger, ledger, classes: occurrences.map(o => {
      const current = o.deliveryRecords.find(r => r.current);
      const eligible = o.endAt.toISOString() <= now && !o.replacement && !o.teachingObligation.occurrences.some(x => x.id !== o.id && (x.schedulingStatus === "ACTIVE" || x.deliveryStatus === "HELD"));
      return { id: o.id, course: `${o.teachingObligation.allocation.course.code} · ${o.teachingObligation.allocation.course.name}`, section: o.section.code, faculty: o.faculty.user.name, startAt: o.startAt.toISOString(), endAt: o.endAt.toISOString(), minutes: o.teachingObligation.requiredMinutes, schedulingStatus: o.schedulingStatus, deliveryStatus: o.deliveryStatus, currentRecordId: current?.id ?? null, canConfirm: eligible && !current && o.schedulingStatus === "ACTIVE" && o.deliveryStatus === "PENDING", canCorrect: eligible && manager && !!current, canRecover: manager && o.deliveryStatus === "NOT_HELD" && !o.replacement && !o.teachingObligation.occurrences.some(x => x.schedulingStatus === "ACTIVE" || x.deliveryStatus === "HELD"), history: o.deliveryRecords.map(r => ({ ...r, confirmedBy: r.confirmedBy.name, createdAt: r.createdAt.toISOString() })) };
    }).sort((a, b) => Number(b.canConfirm || b.canCorrect) - Number(a.canConfirm || a.canCorrect)) };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
export async function readDeliveryWorkspace(actorId: string | null, semesterId?: string) { return readWorkspace(actorId, semesterId, false); }
export async function readLedger(actorId: string | null, semesterId?: string) { return readWorkspace(actorId, semesterId, true); }
export type DeliveryWorkspace = Awaited<ReturnType<typeof readDeliveryWorkspace>>;
