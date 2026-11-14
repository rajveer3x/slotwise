import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { instant, materialize, weekOf } from "../../src/domain/scheduling/timetable";
import { timetableFixture } from "./timetable-fixture";

/** Synthetic published theory and lab sharing the only suitable lab. */
export async function simulationFixture(db: PrismaClient, passwordHash?: string) {
  const f = await timetableFixture(db, passwordHash);
  await db.course.update({ where: { id: f.allocations[1].courseId }, data: { type: "LAB" } });
  await db.courseAllocation.update({ where: { id: f.allocations[1].id }, data: { weeklyPeriods: 2, requiredContactMinutes: 480 } });
  const entries = f.entries.map((entry, i) => ({ ...entry, roomId: f.room2.id, endMinute: i ? 720 : entry.endMinute }));
  const version = await db.timetableVersion.create({ data: {
    departmentId: f.departmentId, semesterId: f.semester.id, status: "PUBLISHED", publishedAt: new Date(),
    baseScheduleRevision: 0, effectiveFrom: f.semester.startDate, effectiveTo: f.semester.endDate,
  } });
  for (const p of entries) {
    const entry = await db.timetableEntry.create({ data: { ...p, departmentId: f.departmentId, timetableVersionId: version.id } });
    for (const o of materialize([p], f.semester.startDate, f.semester.endDate, ["2099-01-12"])) {
      const obligation = await db.teachingObligation.create({ data: {
        departmentId: f.departmentId, allocationId: p.allocationId, seriesId: p.seriesId,
        weekDate: weekOf(o.localDate), originalDate: o.localDate, requiredMinutes: p.endMinute - p.startMinute,
      } });
      const row = await db.classOccurrence.create({ data: {
        departmentId: f.departmentId, entryId: entry.id, teachingObligationId: obligation.id, facultyId: f.faculty.id,
        sectionId: f.section.id, roomId: p.roomId, localDate: o.localDate, startAt: o.startAt, endAt: o.endAt,
      } });
      await db.resourceReservation.createMany({ data: ([
        ["FACULTY", row.facultyId], ["SECTION", row.sectionId], ["ROOM", p.roomId],
      ] as const).map(([resourceType, resourceId]) => ({
        departmentId: f.departmentId, occurrenceId: row.id, resourceType, resourceId,
        startAt: instant(row.localDate, p.startMinute), endAt: instant(row.localDate, p.endMinute),
      })) });
    }
  }
  await db.notification.create({ data: {
    departmentId: f.departmentId, recipientId: f.teacher.id, message: "Synthetic schedule published.", changeId: randomUUID(),
  } });
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: 1 } });
  return f;
}
