import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { resolutionFixture } from "./resolution-fixture";
export async function coverFixture(db: PrismaClient, passwordHash = "synthetic-no-login") {
  const f = await resolutionFixture(db, passwordHash);
  const substitutes = [];
  for (let index = 0; index < 2; index++) {
    const user = await db.user.create({ data: { departmentId: f.departmentId, role: "FACULTY", name: `Synthetic substitute ${index + 1}`, email: `${randomUUID()}@cover.slotwise.test`, passwordHash } });
    const faculty = await db.faculty.create({ data: { departmentId: f.departmentId, userId: user.id, designation: "Lecturer", targetMinutesPerWeek: 720, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080 } });
    for (const a of f.allocations) await db.facultyQualification.create({ data: { departmentId: f.departmentId, facultyId: faculty.id, courseId: a.courseId } });
    await db.facultyAvailability.create({ data: { departmentId: f.departmentId, facultyId: faculty.id, weekday: 1, startMinute: 540, endMinute: 1020 } });
    substitutes.push({ user, faculty });
  }
  return { ...f, substitutes };
}
export async function saturdayOnly(db: PrismaClient, f: Awaited<ReturnType<typeof resolutionFixture>>) {
  // Leave-linked originals stay cancelled. No eligible weekday/swap destinations remain.
  await db.facultyAvailability.updateMany({ where: { departmentId: f.departmentId }, data: { archived: true } });
  await db.facultyAvailability.create({ data: { departmentId: f.departmentId, facultyId: f.faculty.id, weekday: 6, startMinute: 540, endMinute: 780 } });
  for (const startMinute of [540, 600, 660]) await db.timeSlot.create({ data: { departmentId: f.departmentId, weekday: 6, startMinute, endMinute: startMinute + 60, label: "Synthetic Saturday" } });
}
