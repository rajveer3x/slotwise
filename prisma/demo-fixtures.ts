import "server-only";
import type { PrismaClient } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";

// Project-authored synthetic identities and policy examples. No institution's
// actual capacities, workload policy, contact requirements or history is used.
export async function seedDemoData(db: PrismaClient, passwordHash: string, namespace = "demo") {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
  await db.$transaction(async tx => {
    for (const [suffix, small] of [["computing", false], ["design", true]] as const) {
      const departmentId = `${namespace}-${suffix}`;
      await tx.department.upsert({ where: { id: departmentId }, create: { id: departmentId, name: `${small ? "Design" : "Computing"} · Synthetic demo` }, update: {} });
      const ids = new Map<string, string>();
      async function user(key: string, role: Role) {
        // Preserve feature 001's five main account addresses and all existing
        // passwords/access. Other fixtures have stable namespace-based emails.
        const email = !small && Object.values(Role).map(r => r.toLowerCase()).includes(key) ? `${key}@${namespace}.slotwise.test` : `${key}@${departmentId}.slotwise.test`;
        const record = await tx.user.upsert({ where: { email }, create: { id: `${departmentId}-${key}`, email, name: `Demo ${small ? "Design " : ""}${key}`, role, departmentId, passwordHash }, update: {} });
        if (record.departmentId !== departmentId) throw new Error("A fixture account belongs to another department; seeding stopped without changes.");
        ids.set(key, record.id);
      }
      for (const role of Object.values(Role)) await user(role.toLowerCase(), role);
      const facultyKeys = small ? ["faculty"] : ["faculty", "faculty2", "faculty3", "faculty4", "faculty5", "faculty6"];
      for (const key of facultyKeys.slice(1)) await user(key, Role.FACULTY);
      if (!small) await user("student2", Role.STUDENT);
      const semesterId = `${departmentId}-2026-autumn`;
      await tx.semester.upsert({ where: { id: semesterId }, create: { id: semesterId, departmentId, code: "2026-AUTUMN", name: "Autumn 2026 · Demo", startDate: "2026-08-03", endDate: "2026-12-18", active: true }, update: {} });
      await tx.holiday.upsert({ where: { id: `${semesterId}-holiday` }, create: { id: `${semesterId}-holiday`, departmentId, semesterId, date: "2026-11-20", name: "Synthetic non-teaching day" }, update: {} });
      for (const key of facultyKeys) {
        await tx.faculty.upsert({ where: { id: `${departmentId}-${key}-profile` }, create: { id: `${departmentId}-${key}-profile`, departmentId, userId: ids.get(key)!, designation: "Demo lecturer", targetMinutesPerWeek: 720, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080 }, update: {} });
        for (let weekday = 1; weekday <= 5; weekday++) await tx.facultyAvailability.upsert({ where: { id: `${departmentId}-${key}-availability-${weekday}` }, create: { id: `${departmentId}-${key}-availability-${weekday}`, departmentId, facultyId: `${departmentId}-${key}-profile`, weekday, startMinute: 540, endMinute: 1020 }, update: {} });
      }
      const courses = small ? [["DES101", "Design foundations", "THEORY"]] as const : [["CS101", "Programming foundations", "THEORY"], ["CS102", "Data structures", "THEORY"], ["CS103", "Database systems", "THEORY"], ["CS104", "Programming laboratory", "LAB"]] as const;
      for (const [code, name, type] of courses) {
        const courseId = `${departmentId}-${code}`;
        await tx.course.upsert({ where: { id: courseId }, create: { id: courseId, departmentId, code, name, type, requiredContactMinutes: type === "LAB" ? 1440 : 2160 }, update: {} });
        for (const key of facultyKeys) await tx.facultyQualification.upsert({ where: { id: `${courseId}-${key}-qualification` }, create: { id: `${courseId}-${key}-qualification`, departmentId, courseId, facultyId: `${departmentId}-${key}-profile` }, update: {} });
      }
      for (let n = 1; n <= (small ? 1 : 2); n++) {
        const sectionId = `${departmentId}-section-${n}`;
        await tx.section.upsert({ where: { id: sectionId }, create: { id: sectionId, departmentId, semesterId, code: `S${n}`, name: `Demo section ${n}`, strength: 36, preferredPeriodsPerDay: 5 }, update: {} });
        await tx.sectionMembership.upsert({ where: { id: `${sectionId}-membership` }, create: { id: `${sectionId}-membership`, departmentId, sectionId, userId: ids.get(n === 1 ? "student" : "student2")!, isRepresentative: n === 1 }, update: {} });
        for (let c = 0; c < courses.length; c++) {
          const [code, , type] = courses[c];
          const id = `${sectionId}-${code}-allocation`;
          await tx.courseAllocation.upsert({ where: { id }, create: { id, departmentId, semesterId, sectionId, courseId: `${departmentId}-${code}`, facultyId: `${departmentId}-${facultyKeys[(n - 1 + c) % facultyKeys.length]}-profile`, weeklyPeriods: type === "LAB" ? 2 : 3, requiredContactMinutes: type === "LAB" ? 1440 : 2160 }, update: {} });
        }
      }
      for (let n = 1; n <= (small ? 1 : 3); n++) await tx.room.upsert({ where: { id: `${departmentId}-room-${n}` }, create: { id: `${departmentId}-room-${n}`, departmentId, code: `R${n}`, name: n === 3 ? "Demo computing lab" : `Demo teaching room ${n}`, type: n === 3 ? "LAB" : "THEORY", capacity: n === 3 ? 40 : 60 }, update: {} });
      for (let weekday = 1; weekday <= 5; weekday++) for (const [period, startMinute] of [540, 600, 660, 780, 840, 900].entries()) {
        const id = `${departmentId}-slot-${weekday}-${period + 1}`;
        await tx.timeSlot.upsert({ where: { id }, create: { id, departmentId, label: `Period ${period + 1}`, weekday, startMinute, endMinute: startMinute + 60 }, update: {} });
      }
    }
  }, { timeout: 30000 });
}
