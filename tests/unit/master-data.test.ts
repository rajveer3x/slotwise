import { describe, expect, it } from "vitest";
import { dataSchemas } from "@/features/master-data/schema";
describe("master data boundary validation", () => {
  it("requires positive integral capacities and normalizes codes", () => {
    const data = { code: " r-1 ", name: " Room ", type: "LAB", capacity: "40" };
    expect(dataSchemas.room.parse(data)).toEqual({ code: "R-1", name: "Room", type: "LAB", capacity: 40 });
    for (const capacity of [0, -1, 1.5, "", "many"]) expect(dataSchemas.room.safeParse({ ...data, capacity }).success).toBe(false);
  });
  it("rejects inverted and invalid calendar dates, including non-leap February", () => {
    const data = { code: "S1", name: "Semester", startDate: "2026-08-03", endDate: "2026-12-18", active: true };
    expect(dataSchemas.semester.safeParse(data).success).toBe(true);
    for (const startDate of ["2026-12-19", "2026-02-29", "2026-13-01", "2026-1-01"]) expect(dataSchemas.semester.safeParse({ ...data, startDate }).success).toBe(false);
  });
  it("rejects empty/reversed intervals and Sunday, allows consecutive boundary minutes", () => {
    for (const schema of [dataSchemas.timeSlot, dataSchemas.facultyAvailability]) {
      const base = { label: "P1", facultyId: "f1", weekday: 1, startMinute: 540, endMinute: 600 };
      expect(schema.safeParse(base).success).toBe(true);
      for (const change of [{ endMinute: 540 }, { endMinute: 539 }, { weekday: 7 }, { startMinute: -1 }, { endMinute: 1440 }]) expect(schema.safeParse({ ...base, ...change }).success).toBe(false);
    }
  });
  it("rejects missing, blank and boolean times while accepting an explicit midnight", () => {
    for (const schema of [dataSchemas.timeSlot, dataSchemas.facultyAvailability]) {
      const base = { label: "Midnight interval", facultyId: "f1", weekday: 6, startMinute: 0, endMinute: 60 };
      expect(schema.safeParse(base).success).toBe(true);
      expect(schema.safeParse({ ...base, startMinute: "0" }).success).toBe(true);
      for (const startMinute of [null, undefined, "", "   ", false, true]) {
        const result = schema.safeParse({ ...base, startMinute });
        expect(result.success, `startMinute=${String(startMinute)} must be rejected`).toBe(false);
        if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === "startMinute")).toBe(true);
      }
    }
  });
  it("separates weekly periods from semester minutes and rejects impossible workload targets", () => {
    expect(dataSchemas.courseAllocation.parse({ courseId: "c", facultyId: "f", sectionId: "s", semesterId: "t", weeklyPeriods: 3, requiredContactMinutes: 2160 })).toMatchObject({ weeklyPeriods: 3, requiredContactMinutes: 2160 });
    expect(dataSchemas.faculty.safeParse({ userId: "u", designation: "Lecturer", targetMinutesPerWeek: 900, maxMinutesPerDay: 240, maxMinutesPerWeek: 600 }).success).toBe(false);
  });
});
