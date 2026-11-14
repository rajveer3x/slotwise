import { randomUUID } from "node:crypto";
import { addDays, instant, localDate, weekOf } from "../../src/domain/scheduling/timetable";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { timetableFixture } from "./timetable-fixture";

/** Project-authored report data in the isolated test database. */
export async function insightsFixture(db: PrismaClient, passwordHash?: string) {
  const f = await timetableFixture(db, passwordHash);
  const { departmentId } = f;
  const monday = addDays(weekOf(localDate()), -14);
  const friday = addDays(monday, 4);
  const saturday = addDays(monday, 5);
  const followingMonday = addDays(monday, 7);
  await db.semester.update({ where: { id: f.semester.id }, data: { startDate: monday, endDate: followingMonday } });
  const coverTeacher = await db.user.create({ data: {
    departmentId, role: "FACULTY", name: "Synthetic Cover Teacher with a Long Display Name",
    email: `${randomUUID()}@insights.slotwise.test`, passwordHash: f.teacher.passwordHash,
  } });
  const cover = await db.faculty.create({ data: {
    departmentId, userId: coverTeacher.id, designation: "Demo lecturer",
    targetMinutesPerWeek: 120, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080,
  } });
  const leave = await db.leaveRequest.create({ data: {
    departmentId, semesterId: f.semester.id, facultyId: f.faculty.id, startDate: monday, endDate: friday,
    privateReason: "Private synthetic reason for reports", status: "APPROVED", reviewerId: f.hod.id, decidedAt: new Date(),
  } });
  const plan = await db.resolutionPlan.create({ data: {
    departmentId, leaveRequestId: leave.id, ownerId: f.coordinator.id, status: "PUBLISHED",
    baseScheduleRevision: 0, revisionSnapshot: {}, policySnapshot: {}, snapshotToken: "synthetic",
  } });
  const publication = await db.schedulePublication.create({ data: {
    departmentId, planId: plan.id, actorId: f.coordinator.id, previewFingerprint: "synthetic", details: {},
  } });
  const version = await db.timetableVersion.create({ data: {
    departmentId, semesterId: f.semester.id, status: "PUBLISHED", publishedAt: new Date(),
    baseScheduleRevision: 0, effectiveFrom: monday, effectiveTo: followingMonday,
  } });
  async function original(date: string, minute: number, affected: boolean) {
    const allocationId = f.allocations[0].id;
    const entry = await db.timetableEntry.create({ data: {
      ...f.entries[0], seriesId: randomUUID(), allocationId, departmentId, timetableVersionId: version.id,
    } });
    const obligation = await db.teachingObligation.create({ data: {
      departmentId, allocationId, seriesId: entry.seriesId, weekDate: weekOf(date),
      originalDate: date, requiredMinutes: 60,
    } });
    return db.classOccurrence.create({ data: {
      departmentId, entryId: entry.id, teachingObligationId: obligation.id, facultyId: f.faculty.id, sectionId: f.section.id,
      localDate: date, startAt: instant(date, minute), endAt: instant(date, minute + 60),
      schedulingStatus: affected ? "CANCELLED" : "ACTIVE", roomId: f.room.id,
      leaveRequestId: affected ? leave.id : null,
    } });
  }
  async function replace(old: Awaited<ReturnType<typeof original>>, date: string, minute: number, tier: number) {
    return db.classOccurrence.create({ data: {
      departmentId, entryId: old.entryId, teachingObligationId: old.teachingObligationId,
      facultyId: tier === 1 ? cover.id : f.faculty.id, sectionId: f.section.id, roomId: f.room.id,
      localDate: date, startAt: instant(date, minute), endAt: instant(date, minute + 60),
      replacesId: old.id, resolutionTier: tier, resolved: true, publicationId: publication.id,
    } });
  }
  const substitute = await replace(await original(monday, 540, true), monday, 540, 1);
  const makeup = await replace(await original(friday, 540, true), followingMonday, 540, 3);
  const saturdayRecovery = await replace(await original(friday, 600, true), saturday, 540, 5);
  const missed = await replace(await original(friday, 660, true), followingMonday, 600, 3);
  await original(monday, 600, true);
  await original(monday, 660, false);
  await db.deliveryRecord.create({ data: {
    departmentId, obligationId: substitute.teachingObligationId, occurrenceId: substitute.id,
    status: "HELD", confirmedById: coverTeacher.id, confirmedMinutes: 60,
  } });
  await db.classOccurrence.update({ where: { id: substitute.id }, data: { deliveryStatus: "HELD" } });
  await db.deliveryRecord.create({ data: {
    departmentId, obligationId: missed.teachingObligationId, occurrenceId: missed.id,
    status: "NOT_HELD", confirmedById: f.teacher.id, confirmedMinutes: 0,
  } });
  await db.classOccurrence.update({ where: { id: missed.id }, data: { deliveryStatus: "NOT_HELD", schedulingStatus: "CANCELLED" } });
  return { ...f, monday, friday, saturday, followingMonday, cover, coverTeacher, makeup, missed, substitute, saturdayRecovery, replace };
}
