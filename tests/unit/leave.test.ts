import { describe, expect, it } from "vitest";
import { leaveDateError, leaveOverlaps } from "@/domain/leave/rules";
import { leaveCommand, leaveDates } from "@/features/leave/schema";
const semester = { startDate: "2026-11-01", endDate: "2026-11-30" };
describe("full-day local leave", () => {
  it("uses Asia/Kolkata midnight, including dates that are still yesterday in UTC", () => {
    expect(leaveDateError("2026-11-14", "2026-11-14", semester, new Date("2026-11-13T18:30:00Z"))).toBeNull();
    expect(leaveDateError("2026-11-13", "2026-11-14", semester, new Date("2026-11-13T18:30:00Z"))?.field).toBe("startDate");
    expect(leaveDateError("2026-11-13", "2026-11-13", semester, new Date("2026-11-13T18:29:59Z"))).toBeNull();
  });
  it("allows inclusive semester end, rejects reversed and outside ranges", () => {
    const now = new Date("2026-11-14T00:00:00Z");
    expect(leaveDateError("2026-11-30", "2026-11-30", semester, now)).toBeNull();
    expect(leaveDateError("2026-11-16", "2026-11-15", semester, now)?.field).toBe("endDate");
    expect(leaveDateError("2026-11-30", "2026-12-01", semester, now)?.field).toBe("endDate");
  });
  it("counts shared boundary dates as overlap and adjacent dates as separate", () => {
    const range = { startDate: "2026-11-14", endDate: "2026-11-16" };
    expect(leaveOverlaps(range, { startDate: "2026-11-16", endDate: "2026-11-17" })).toBe(true);
    expect(leaveOverlaps(range, { startDate: "2026-11-17", endDate: "2026-11-17" })).toBe(false);
  });
  it("rejects malformed dates, impossible dates and forged ownership fields", () => {
    for (const startDate of ["2026-02-30", "2026-11-14T00:00:00Z", "14/11/2026"]) expect(leaveDates.safeParse({ semesterId: "s", startDate, endDate: "2026-11-30" }).success).toBe(false);
    expect(leaveCommand.safeParse({ operation: "submit", requestId: crypto.randomUUID(), semesterId: "s", facultyId: "forged", startDate: "2026-11-14", endDate: "2026-11-15", privateReason: "" }).success).toBe(false);
  });
});
