import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { generateWeekly } from "@/domain/scheduling/generation";
import { completeness, validatePlacements, type SchedulingData } from "@/domain/scheduling/timetable";

const semester = "fall";
function fixture(): SchedulingData {
  return {
    allocations: [
      { id: "a", semesterId: semester, courseId: "theory", sectionId: "s", facultyId: "f", weeklyPeriods: 3, archived: false },
      { id: "b", semesterId: semester, courseId: "lab", sectionId: "s", facultyId: "f", weeklyPeriods: 3, archived: false },
    ],
    courses: [
      { id: "theory", code: "T", name: "Theory", type: "THEORY", archived: false },
      { id: "lab", code: "L", name: "Laboratory", type: "LAB", archived: false },
    ],
    sections: [{ id: "s", code: "S", strength: 30, archived: false }],
    faculty: [{ id: "f", name: "Teacher", active: true, archived: false, maxMinutesPerDay: 180, maxMinutesPerWeek: 360 }],
    rooms: [
      { id: "r", code: "R", type: "THEORY", capacity: 40, archived: false },
      { id: "l", code: "L", type: "LAB", capacity: 35, archived: false },
      { id: "small", code: "Small", type: "LAB", capacity: 10, archived: false },
    ],
    qualifications: ["theory", "lab"].map(courseId => ({ facultyId: "f", courseId, archived: false })),
    slots: [1, 2, 3, 4, 5, 6].flatMap(weekday => [540, 600, 660, 780].map(startMinute => ({
      id: `${weekday}-${startMinute}`, label: "Period", weekday, startMinute, endMinute: startMinute + 60, archived: false,
    }))),
    availability: [1, 2, 3, 4, 5, 6].flatMap(weekday => [[540, 600], [600, 720]].map(([startMinute, endMinute]) => ({
      facultyId: "f", weekday, startMinute, endMinute, archived: false,
    }))),
  };
}

describe("weekly timetable generation", () => {
  it("covers theory and an odd-length contiguous lab, improves soft objectives and repeats with the same seed", async () => {
    const data = fixture();
    const first = await generateWeekly(data, semester, [], 42, { now: () => performance.now() });
    const reversed = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, [...rows].reverse()])) as SchedulingData;
    const second = await generateWeekly(reversed, semester, [], 42, { now: () => 0 });
    expect(first.status).toBe("finished");
    expect(first.placed).toBe(6);
    expect(first.entries).toEqual(second.entries);
    expect(first.quality).toEqual({ sameDayPairs: 0, theoryInLab: 0 });
    expect(first.entries.find(p => p.allocationId === "b")).toMatchObject({ roomId: "l", startMinute: 540, endMinute: 720 });
    expect(validatePlacements(first.entries, data)).toEqual([]);
    expect(completeness(first.entries, data, semester)).toEqual([]);
    console.info(`Feasible fixture: 2 allocations, 6 periods, 24 slots, 3 rooms, ${first.runtimeMs} ms.`);
  });

  it("returns a valid partial when qualifications or usable contiguous spans are missing", async () => {
    const data = fixture();
    data.slots = data.slots.filter(s => s.startMinute !== 660 && s.startMinute !== 780);
    const result = await generateWeekly(data, semester, [], 7, { now: () => performance.now() });
    expect(result.status).toBe("finished");
    expect(result.coverage.find(row => row.allocationId === "b")).toMatchObject({ required: 3, placed: 2 });
    expect(result.placed).toBe(5);
    expect(validatePlacements(result.entries, data)).toEqual([]);
    console.info(`Constrained fixture: 2 allocations, 6 periods, 12 slots, 3 rooms, ${result.runtimeMs} ms.`);
    data.qualifications = data.qualifications.filter(q => q.courseId !== "lab");
    const unqualified = await generateWeekly(data, semester, [], 7, { now: () => 0 });
    expect(unqualified.coverage.find(row => row.allocationId === "b")?.placed).toBe(0);
  });

  it("reports time and deterministic work limits and cooperatively detects an abort", async () => {
    const data = fixture();
    const baseline = { seriesId: "published", allocationId: "a", weekday: 1, roomId: "r", startMinute: 540, endMinute: 600 };
    let clock = 0;
    const timeout = await generateWeekly(data, semester, [baseline], 1, {
      now: () => clock++, timeoutMs: 4,
    });
    expect(timeout).toMatchObject({ status: "timeout", entries: [baseline], placed: 1, required: 6 });
    const limit = await generateWeekly(data, semester, [baseline], 1, { now: () => 0, workLimit: 1 });
    expect(limit).toMatchObject({ status: "work-limit", placed: 1, required: 6, work: 1 });
    const controller = new AbortController();
    const cancelled = await generateWeekly(data, semester, [baseline], 1, {
      now: () => 0, signal: controller.signal, pause: async () => controller.abort(),
    });
    expect(cancelled).toMatchObject({ status: "cancelled", entries: [baseline] });
    expect(validatePlacements(timeout.entries, data)).toEqual([]);
  });

  it("backtracks when the longest first lab placement blocks another required lab", async () => {
    const data = fixture();
    data.allocations[1].weeklyPeriods = 4;
    data.allocations.shift();
    data.allocations.push({ ...data.allocations[0], id: "c", sectionId: "second", weeklyPeriods: 2 });
    data.sections.push({ ...data.sections[0], id: "second" });
    data.slots = data.slots.filter(s => s.weekday <= 2 && s.startMinute < 780);
    // The shared teacher can fit one lab per day. A three-slot lab consumes
    // too much of the six-period weekly budget for the remaining two labs.
    data.slots.push(...fixture().slots.filter(s => s.weekday === 3 && s.startMinute < 660));
    data.faculty[0].maxMinutesPerWeek = 360;
    const result = await generateWeekly(data, semester, [], 8, { now: () => 0 });
    expect(result.status).toBe("finished");
    expect(result.placed).toBe(6);
    expect(completeness(result.entries, data, semester)).toEqual([]);
    expect(validatePlacements(result.entries, data)).toEqual([]);
  });
});
