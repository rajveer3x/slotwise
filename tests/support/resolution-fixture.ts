import type { PrismaClient } from "../../src/generated/prisma/client";
import { materialize, weekOf } from "../../src/domain/scheduling/timetable";
import { timetableFixture } from "./timetable-fixture";

/** Synthetic browser data in the isolated test database; no persistent demo publication. */
export async function resolutionFixture(db: PrismaClient, passwordHash: string) {
  const f = await timetableFixture(db, passwordHash);
  const leave = await db.leaveRequest.create({ data: { departmentId: f.departmentId, facultyId: f.faculty.id, semesterId: f.semester.id, startDate: "2099-01-05", endDate: "2099-01-05", privateReason: "Private browser resolution reason", status: "APPROVED", version: 2, reviewerId: f.hod.id, decidedAt: new Date() } });
  const version = await db.timetableVersion.create({ data: { departmentId: f.departmentId, semesterId: f.semester.id, status: "PUBLISHED", publishedAt: new Date(), baseScheduleRevision: 0, effectiveFrom: f.semester.startDate, effectiveTo: f.semester.endDate } });
  for (const p of f.entries) {
    const entry = await db.timetableEntry.create({ data: { ...p, departmentId: f.departmentId, timetableVersionId: version.id } });
    for (const o of materialize([p], f.semester.startDate, f.semester.endDate, ["2099-01-12"])) {
      const obligation = await db.teachingObligation.create({ data: { departmentId: f.departmentId, allocationId: p.allocationId, seriesId: p.seriesId, weekDate: weekOf(o.localDate), originalDate: o.localDate, requiredMinutes: 60 } });
      const cancelled = o.localDate === leave.startDate;
      const occurrence = await db.classOccurrence.create({ data: { departmentId: f.departmentId, entryId: entry.id, teachingObligationId: obligation.id, facultyId: f.faculty.id, sectionId: f.section.id, roomId: f.room.id, localDate: o.localDate, startAt: o.startAt, endAt: o.endAt, schedulingStatus: cancelled ? "CANCELLED" : "ACTIVE", leaveRequestId: cancelled ? leave.id : null } });
      if (!cancelled) await db.resourceReservation.createMany({ data: ([['FACULTY', f.faculty.id], ['SECTION', f.section.id], ['ROOM', f.room.id]] as const).map(([resourceType, resourceId]) => ({ departmentId: f.departmentId, occurrenceId: occurrence.id, resourceType, resourceId, startAt: o.startAt, endAt: o.endAt })) });
    }
  }
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: 2 } });
  return { ...f, leaveId: leave.id };
}
