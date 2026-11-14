import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { Placement } from "../../src/domain/scheduling/timetable";
export async function timetableFixture(db: PrismaClient, passwordHash = "synthetic-non-login-hash") {
  const departmentId = `schedule-${randomUUID()}`;
  await db.department.create({ data: { id: departmentId, name: "Synthetic timetable department" } });
  async function user(role: "ADMIN" | "COORDINATOR" | "FACULTY" | "HOD" | "STUDENT", suffix = "") { return db.user.create({ data: { departmentId, role, name: `Synthetic ${role}${suffix}`, email: `${randomUUID()}@schedule.slotwise.test`, passwordHash } }); }
  const admin = await user("ADMIN"), coordinator = await user("COORDINATOR"), teacher = await user("FACULTY"), hod = await user("HOD"), student = await user("STUDENT"), outsider = await user("STUDENT", " other section");
  const faculty = await db.faculty.create({ data: { departmentId, userId: teacher.id, designation: "Lecturer", targetMinutesPerWeek: 720, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080 } });
  const semester = await db.semester.create({ data: { departmentId, code: "TEST", name: "Synthetic future semester", startDate: "2099-01-05", endDate: "2099-01-30", active: true } });
  await db.holiday.create({ data: { departmentId, semesterId: semester.id, date: "2099-01-12", name: "Synthetic holiday" } });
  const section = await db.section.create({ data: { departmentId, semesterId: semester.id, code: "S1", name: "First section", strength: 36, preferredPeriodsPerDay: 5 } });
  const section2 = await db.section.create({ data: { departmentId, semesterId: semester.id, code: "PRIVATE", name: "Other section", strength: 30, preferredPeriodsPerDay: 5 } });
  for (const [userId, sectionId] of [[student.id, section.id], [outsider.id, section2.id]]) await db.sectionMembership.create({ data: { departmentId, userId, sectionId } });
  const room = await db.room.create({ data: { departmentId, code: "R1", name: "Teaching room", type: "THEORY", capacity: 40 } });
  const room2 = await db.room.create({ data: { departmentId, code: "R2", name: "Second room", type: "LAB", capacity: 40 } });
  const allocations = [];
  for (const code of ["CS101", "CS102"]) {
    const course = await db.course.create({ data: { departmentId, code, name: `Synthetic ${code} course with a long descriptive title`, type: "THEORY", requiredContactMinutes: 240 } });
    await db.facultyQualification.create({ data: { departmentId, courseId: course.id, facultyId: faculty.id } });
    allocations.push(await db.courseAllocation.create({ data: { departmentId, semesterId: semester.id, courseId: course.id, facultyId: faculty.id, sectionId: section.id, weeklyPeriods: 1, requiredContactMinutes: 240 } }));
  }
  for (let weekday = 1; weekday <= 5; weekday++) {
    await db.facultyAvailability.create({ data: { departmentId, facultyId: faculty.id, weekday, startMinute: 540, endMinute: 1020 } });
    for (const startMinute of [540, 600, 660, 780]) await db.timeSlot.create({ data: { departmentId, weekday, startMinute, endMinute: startMinute + 60, label: `Period ${startMinute}` } });
  }
  const entries: Placement[] = allocations.map((a, i) => ({ seriesId: randomUUID(), allocationId: a.id, roomId: room.id, weekday: 1, startMinute: 540 + 60 * i, endMinute: 600 + 60 * i }));
  return { departmentId, admin, coordinator, teacher, hod, student, outsider, faculty, semester, section, section2, room, room2, allocations, entries };
}
export async function cleanupTimetable(db: PrismaClient, departmentId: string) {
  const where = { departmentId };
  await db.resolutionItem.deleteMany({ where }); await db.resolutionPlan.deleteMany({ where });
  await db.notification.deleteMany({ where }); await db.auditEvent.deleteMany({ where }); await db.mutationReceipt.deleteMany({ where }); await db.resourceReservation.deleteMany({ where });
  await db.classOccurrence.updateMany({ where, data: { replacesId: null } }); await db.classOccurrence.deleteMany({ where }); await db.leaveRequest.deleteMany({ where }); await db.teachingObligation.deleteMany({ where }); await db.timetableEntry.deleteMany({ where }); await db.timetableVersion.deleteMany({ where });
  await db.masterMutationReceipt.deleteMany({ where }); await db.courseAllocation.deleteMany({ where }); await db.facultyQualification.deleteMany({ where }); await db.facultyAvailability.deleteMany({ where }); await db.sectionMembership.deleteMany({ where }); await db.holiday.deleteMany({ where }); await db.section.deleteMany({ where }); await db.faculty.deleteMany({ where }); await db.course.deleteMany({ where }); await db.room.deleteMany({ where }); await db.timeSlot.deleteMany({ where }); await db.semester.deleteMany({ where }); await db.user.deleteMany({ where }); await db.department.delete({ where: { id: departmentId } });
}
