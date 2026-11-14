import type { PrismaClient } from "../../src/generated/prisma/client";
import { addDays, instant, localDate, weekOf } from "../../src/domain/scheduling/timetable";
import { resolutionFixture } from "./resolution-fixture";
/** Project-authored synthetic ended and future classes; isolated test database only. */
export async function deliveryFixture(db: PrismaClient, passwordHash = "synthetic-no-login") {
  const f = await resolutionFixture(db, passwordHash);
  const date = addDays(localDate(), -1);
  const past = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, schedulingStatus: "ACTIVE", teachingObligation: { allocationId: f.allocations[0].id } }, orderBy: { startAt: "asc" } });
  await db.resourceReservation.deleteMany({ where: { occurrenceId: past.id } });
  await db.classOccurrence.update({ where: { id: past.id }, data: { localDate: date, startAt: instant(date, 540), endAt: instant(date, 600) } });
  await db.resourceReservation.createMany({ data: ([['FACULTY', f.faculty.id], ['SECTION', f.section.id], ['ROOM', f.room.id]] as const).map(([resourceType, resourceId]) => ({ departmentId: f.departmentId, occurrenceId: past.id, resourceType, resourceId, startAt: instant(date, 540), endAt: instant(date, 600) })) });
  await db.teachingObligation.update({ where: { id: past.teachingObligationId }, data: { weekDate: weekOf(date), originalDate: date } });
  await db.semester.update({ where: { id: f.semester.id }, data: { startDate: addDays(date, -7), name: "Synthetic delivery semester" } });
  return { ...f, pastId: past.id, obligationId: past.teachingObligationId, date };
}
