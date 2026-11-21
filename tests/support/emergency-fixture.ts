import type { PrismaClient } from "../../src/generated/prisma/client";
import { addDays, instant, weekOf } from "../../src/domain/scheduling/timetable";
import { addSubstitutes } from "./cover-fixture";
import { timetableFixture } from "./timetable-fixture";

// Synthetic Monday classes and one approved full-day leave. The supplied date
// allows same-day and exact-cutoff tests independent of the calendar.
export async function emergencyFixture(db: PrismaClient, date: string, passwordHash = "synthetic-no-login") {
  const f = await timetableFixture(db, passwordHash);
  const semesterEnd = addDays(date, 14);
  await db.semester.update({ where: { id: f.semester.id }, data: { startDate: date, endDate: semesterEnd, scheduleRevision: 2 } });
  const leave = await db.leaveRequest.create({ data: {
    departmentId: f.departmentId, facultyId: f.faculty.id, semesterId: f.semester.id,
    startDate: date, endDate: date, privateReason: "Private synthetic reason", status: "APPROVED",
    reviewerId: f.hod.id, decidedAt: instant(date, 500), version: 2,
  } });
  const version = await db.timetableVersion.create({ data: {
    departmentId: f.departmentId, semesterId: f.semester.id, status: "PUBLISHED", publishedAt: instant(date, 480),
    baseScheduleRevision: 1, effectiveFrom: date, effectiveTo: semesterEnd,
  } });
  const occurrences = [];
  for (const p of f.entries) {
    const entry = await db.timetableEntry.create({ data: { ...p, departmentId: f.departmentId, timetableVersionId: version.id } });
    const obligation = await db.teachingObligation.create({ data: {
      departmentId: f.departmentId, allocationId: p.allocationId, seriesId: p.seriesId, weekDate: weekOf(date), originalDate: date, requiredMinutes: 60,
    } });
    occurrences.push(await db.classOccurrence.create({ data: {
      departmentId: f.departmentId, entryId: entry.id, teachingObligationId: obligation.id,
      facultyId: f.faculty.id, sectionId: f.section.id, roomId: f.room.id, localDate: date,
      startAt: instant(date, p.startMinute), endAt: instant(date, p.endMinute), schedulingStatus: "CANCELLED",
      leaveRequestId: leave.id,
    } }));
  }
  const substitutes = await addSubstitutes(db, f, passwordHash, 4);
  return { ...f, leave, occurrences, substitutes };
}
