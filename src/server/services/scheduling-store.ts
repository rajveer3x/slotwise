import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { validatePlacements, weekday, weekOf, instant, type SchedulingData, type Placement } from "@/domain/scheduling/timetable";
export class ScheduleError extends Error {
  constructor(public code: string, message: string, public conflicts: { rule: string; seriesId: string; message: string }[] = []) { super(message); }
}
export type Tx = Prisma.TransactionClient;
export async function schedulingData(tx: Tx, departmentId: string): Promise<SchedulingData> {
  const where = { departmentId };
  // A transaction owns one PostgreSQL connection; keep driver queries sequential.
  const allocations = await tx.courseAllocation.findMany({ where });
  const courses = await tx.course.findMany({ where });
  const sections = await tx.section.findMany({ where });
  const faculty = await tx.faculty.findMany({ where, include: { user: { select: { name: true, active: true, role: true } } } });
  const rooms = await tx.room.findMany({ where });
  const qualifications = await tx.facultyQualification.findMany({ where });
  const availability = await tx.facultyAvailability.findMany({ where });
  const slots = await tx.timeSlot.findMany({ where });
  return { allocations, courses, sections, faculty: faculty.map(f => ({ id: f.id, name: f.user.name, archived: f.archived, active: f.user.active && ["FACULTY", "HOD"].includes(f.user.role), maxMinutesPerDay: f.maxMinutesPerDay, maxMinutesPerWeek: f.maxMinutesPerWeek })), rooms, qualifications, availability, slots };
}
export const occurrenceInclude = { entry: { include: { timetableVersion: true } }, teachingObligation: true } as const;
export type StoredOccurrence = Prisma.ClassOccurrenceGetPayload<{ include: typeof occurrenceInclude }>;
export function asPlacement(o: StoredOccurrence): Placement {
  return { seriesId: o.entry.seriesId, allocationId: o.teachingObligation.allocationId, roomId: o.roomId, weekday: weekday(o.localDate), startMinute: Math.round((o.startAt.getTime() - instant(o.localDate, 0).getTime()) / 60000), endMinute: Math.round((o.endAt.getTime() - instant(o.localDate, 0).getTime()) / 60000) };
}
export function validateDated(rows: (Placement & { localDate: string })[], data: SchedulingData) {
  const weeks = new Map<string, (Placement & { localDate: string })[]>();
  for (const row of rows) { const key = weekOf(row.localDate); weeks.set(key, [...(weeks.get(key) ?? []), row]); }
  return [...weeks].flatMap(([week, placements]) => validatePlacements(placements, data).map(c => ({ ...c, message: `Week of ${week}: ${c.message}` })));
}
// Called inside the existing actor + department-locked master-data transaction.
// Invalidating writes roll back; harmless changes still invalidate open previews.
export async function guardPublishedSchedule(tx: Tx, departmentId: string) {
  const now = new Date();
  const future = await tx.classOccurrence.findMany({ where: { departmentId, schedulingStatus: "ACTIVE", endAt: { gt: now } }, include: occurrenceInclude });
  if (!future.length) return;
  const data = await schedulingData(tx, departmentId);
  const holidays = await tx.holiday.findMany({ where: { departmentId, archived: false } });
  for (const o of future) {
    const semester = await tx.semester.findUniqueOrThrow({ where: { id: o.entry.timetableVersion.semesterId } });
    const a = data.allocations.find(a => a.id === o.teachingObligation.allocationId)!;
    if (semester.archived || o.localDate < semester.startDate || o.localDate > semester.endDate || holidays.some(h => h.semesterId === semester.id && h.date === o.localDate) || a.facultyId !== o.facultyId || a.sectionId !== o.sectionId) throw new ScheduleError("CONFLICT", "This edit would invalidate a published class. Revise the timetable prospectively first.");
  }
  // Include the rest of each boundary week when validating workload limits.
  const first = future.reduce((min, o) => o.localDate < min ? o.localDate : min, future[0].localDate);
  const rows = await tx.classOccurrence.findMany({ where: { departmentId, schedulingStatus: "ACTIVE", localDate: { gte: weekOf(first) } }, include: occurrenceInclude });
  const conflicts = validateDated(rows.map(o => ({ ...asPlacement(o), localDate: o.localDate })), data);
  if (conflicts.length) throw new ScheduleError("CONFLICT", `This edit would invalidate the published schedule: ${conflicts[0].message}`, conflicts);
}
