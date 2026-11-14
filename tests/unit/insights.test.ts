import { describe, expect, it } from "vitest";
import { recoveryMetrics, workloadMetrics } from "@/domain/workload/metrics";

describe("workload metrics", () => {
  it("returns unavailable for missing and zero targets and applies inclusive balance thresholds", () => {
    const faculty = [null, 0, 100, 100, 100, 100].map((targetMinutesPerWeek, index) => ({
      id: String(index), name: String(index), targetMinutesPerWeek,
    }));
    const planned = [60, 60, 89, 90, 110, 111].map((minutes, index) => ({
      facultyId: String(index), startAt: new Date(0), endAt: new Date(minutes * 60_000),
    }));
    const rows = workloadMetrics(faculty, planned, []);
    expect(rows.map(row => row.utilization)).toEqual([null, null, 0.89, 0.9, 1.1, 1.11]);
    expect(rows.map(row => row.band)).toEqual([
      "Target not configured", "Target not configured", "Under target", "Balanced", "Balanced", "Over target",
    ]);
    expect(rows[0].plannedMinutes).toBe(60);
  });
});

describe("leave recovery metrics", () => {
  it("leaves an empty denominator unavailable", () => {
    expect(recoveryMetrics([])).toMatchObject({ affected: 0, weekdayRate: null, delivered: 0 });
  });
});
