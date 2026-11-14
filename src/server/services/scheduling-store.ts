import "server-only";
import { assignmentErrors, resolutionPolicy, type Assignment, type ResolutionSnapshot } from "@/domain/resolution/engine";
import { Prisma } from "@/generated/prisma/client";
import { localDate, weekday, instant, type SchedulingData, type Placement } from "@/domain/scheduling/timetable";
export class ScheduleError extends Error {
  constructor(public code: string, message: string, public conflicts: { rule: string; seriesId: string; message: string }[] = []) { super(message); }
}
export type Tx = Prisma.TransactionClient;
export async function schedulingData(tx: Tx, departmentId: string, generation?: { semesterId: string; take: number }): Promise<SchedulingData> {
  const where = { departmentId, archived: generation ? false : undefined };
  const take = generation?.take;
  // A transaction owns one PostgreSQL connection; keep driver queries sequential.
  const allocations = await tx.courseAllocation.findMany({ where: { ...where, semesterId: generation?.semesterId }, take });
  const courses = await tx.course.findMany({ where, take });
  const sections = await tx.section.findMany({ where, take });
  const faculty = await tx.faculty.findMany({ where, take, include: { user: { select: { name: true, active: true, role: true } } } });
  const rooms = await tx.room.findMany({ where, take });
  const qualifications = await tx.facultyQualification.findMany({ where, take });
  const availability = await tx.facultyAvailability.findMany({ where, take });
  const slots = await tx.timeSlot.findMany({ where, take });
  return { allocations, courses, sections, faculty: faculty.map(f => ({ id: f.id, name: f.user.name, archived: f.archived, active: f.user.active && ["FACULTY", "HOD"].includes(f.user.role), maxMinutesPerDay: f.maxMinutesPerDay, maxMinutesPerWeek: f.maxMinutesPerWeek })), rooms, qualifications, availability, slots };
}
export const occurrenceInclude = { entry: { include: { timetableVersion: true } }, teachingObligation: true } as const;
export type StoredOccurrence = Prisma.ClassOccurrenceGetPayload<{ include: typeof occurrenceInclude }>;
export function occurrenceMinutes(o: Pick<StoredOccurrence, "localDate" | "startAt" | "endAt">) {
  const midnight = instant(o.localDate, 0).getTime();
  return { startMinute: Math.round((o.startAt.getTime() - midnight) / 60000), endMinute: Math.round((o.endAt.getTime() - midnight) / 60000) };
}
export function asPlacement(o: StoredOccurrence): Placement {
  return { seriesId: o.entry.seriesId, allocationId: o.teachingObligation.allocationId, roomId: o.roomId ?? "", weekday: weekday(o.localDate), ...occurrenceMinutes(o) };
}
// Called inside the existing actor + department-locked master-data transaction.
// Invalidating writes roll back; harmless changes still invalidate open previews.
export async function guardPublishedSchedule(tx: Tx, departmentId: string) {
  const liveLeave = await tx.leaveRequest.findMany({ where: { departmentId, status: { in: ["SUBMITTED", "APPROVED"] } }, include: { semester: true } });
  if (liveLeave.some(r => r.endDate >= localDate() && (r.semester.archived || r.startDate < r.semester.startDate || r.endDate > r.semester.endDate))) throw new ScheduleError("CONFLICT", "This edit would invalidate pending or approved leave. Keep its semester and date boundaries available.");
  const now = new Date();
  const future = await tx.classOccurrence.findMany({ where: { departmentId, schedulingStatus: "ACTIVE", endAt: { gt: now } }, include: occurrenceInclude });
  if (!future.length) return;
  await guardApprovedAbsence(tx, departmentId, future.filter(o => o.startAt > now && o.deliveryStatus === "PENDING"));
  const s = await resolutionSnapshot(tx, departmentId, []);
  for (const o of future) {
    const a = s.data.allocations.find(a => a.id === o.teachingObligation.allocationId);
    if (!a || a.sectionId !== o.sectionId || (o.resolutionTier !== 1 && a.facultyId !== o.facultyId)) throw new ScheduleError("CONFLICT", "This edit would invalidate a published assignment. Revise its schedule first.");
    const assignment = asAssignment(o);
    // Include past/ongoing assignments in workload; do not reject them merely for having started.
    const errors = assignmentErrors([assignment], s.active.filter(a => a.occurrenceId !== o.id), { ...s, now: "1970-01-01T00:00:00.000Z" }, o.resolutionTier ?? 1);
    if (errors.length) throw new ScheduleError("CONFLICT", `This edit would invalidate the published schedule: ${errors.join(", ")}.`);
  }
}

// Shared scheduling guard: pending leave is provisional; approved absence is hard.
export async function guardApprovedAbsence(tx: Tx, departmentId: string, rows: { facultyId: string; localDate: string }[]) {
  if (!rows.length) return;
  const leaves = await tx.leaveRequest.findMany({ where: { departmentId, status: "APPROVED", facultyId: { in: [...new Set(rows.map(r => r.facultyId))] } }, select: { facultyId: true, startDate: true, endDate: true } });
  if (rows.some(r => leaves.some(l => l.facultyId === r.facultyId && l.startDate <= r.localDate && l.endDate >= r.localDate))) throw new ScheduleError("CONFLICT", "A teacher has approved leave on a proposed class date. Review leave recovery before publishing.");
}

export function asAssignment(o: StoredOccurrence): Assignment {
  return { occurrenceId: o.id, obligationId: o.teachingObligationId, allocationId: o.teachingObligation.allocationId, facultyId: o.facultyId, sectionId: o.sectionId, roomId: o.roomId, date: o.localDate, startMinute: Math.round((o.startAt.getTime() - instant(o.localDate, 0).getTime()) / 60000), endMinute: Math.round((o.endAt.getTime() - instant(o.localDate, 0).getTime()) / 60000) };
}
// All resources and boundary weeks are read within the caller's repeatable-read or locked transaction.
export async function resolutionSnapshot(tx: Tx, departmentId: string, affectedIds: string[], hypotheticalLeave?: ResolutionSnapshot["leaves"][number]): Promise<ResolutionSnapshot> {
  const data = await schedulingData(tx, departmentId);
  const department = await tx.department.findUniqueOrThrow({ where: { id: departmentId }, select: { onlineTeachingEnabled: true } });
  const semesters = await tx.semester.findMany({ where: { departmentId }, select: { id: true, startDate: true, endDate: true, archived: true, scheduleRevision: true }, orderBy: { id: "asc" } });
  const holidays = await tx.holiday.findMany({ where: { departmentId, archived: false }, select: { semesterId: true, date: true } });
  const leaves = await tx.leaveRequest.findMany({ where: { departmentId, status: "APPROVED" }, select: { facultyId: true, startDate: true, endDate: true } });
  const faculty = await tx.faculty.findMany({ where: { departmentId }, select: { id: true, targetMinutesPerWeek: true } });
  const sections = await tx.section.findMany({ where: { departmentId }, select: { id: true, preferredPeriodsPerDay: true } });
  const rows = await tx.classOccurrence.findMany({ where: { departmentId, OR: [{ schedulingStatus: "ACTIVE" }, { id: { in: affectedIds } }] }, include: occurrenceInclude, orderBy: { id: "asc" } });
  const now = new Date();
  const month = localDate(now).slice(0, 7);
  const confirmed = await tx.deliveryRecord.findMany({ where: { departmentId, current: true, status: "HELD", occurrence: { resolutionTier: 1, localDate: { startsWith: month } } }, select: { occurrence: { select: { facultyId: true } } } });
  return { data, faculty: faculty.map(f => ({ ...f, confirmedCoversThisMonth: confirmed.filter(r => r.occurrence.facultyId === f.id).length })), sections, semesters, holidays, leaves: [...leaves, ...(hypotheticalLeave ? [hypotheticalLeave] : [])], active: rows.filter(o => o.schedulingStatus === "ACTIVE" && !affectedIds.includes(o.id)).map(asAssignment), affected: rows.filter(o => affectedIds.includes(o.id)).map(asAssignment), swappableIds: rows.filter(o => o.schedulingStatus === "ACTIVE" && o.deliveryStatus === "PENDING" && !o.resolved && o.startAt > now && !affectedIds.includes(o.id)).map(o => o.id), now: now.toISOString(), onlineEnabled: department.onlineTeachingEnabled, policy: resolutionPolicy };
}
