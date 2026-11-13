import { describe, expect, it } from "vitest";
import { alternatives, completeness, instant, materialize, overlaps, validatePlacements, weekOf, type Placement, type SchedulingData } from "@/domain/scheduling/timetable";
const p: Placement = { seriesId: "first", allocationId: "a", roomId: "r", weekday: 1, startMinute: 540, endMinute: 600 };
function fixture(): SchedulingData {
  return { allocations: [{ id: "a", semesterId: "s", courseId: "c", facultyId: "f", sectionId: "sec", weeklyPeriods: 2, archived: false }], courses: [{ id: "c", code: "CS101", name: "Course", type: "THEORY", archived: false }], sections: [{ id: "sec", code: "S1", strength: 40, archived: false }], rooms: [{ id: "r", code: "R1", capacity: 40, type: "THEORY", archived: false }], faculty: [{ id: "f", name: "Teacher", active: true, archived: false, maxMinutesPerDay: 120, maxMinutesPerWeek: 180 }], qualifications: [{ facultyId: "f", courseId: "c", archived: false }], availability: [{ facultyId: "f", weekday: 1, startMinute: 540, endMinute: 600, archived: false }, { facultyId: "f", weekday: 1, startMinute: 600, endMinute: 840, archived: false }], slots: [540, 600, 720, 780].map(startMinute => ({ id: String(startMinute), label: "Period", weekday: 1, startMinute, endMinute: startMinute + 60, archived: false })) };
}
describe("scheduling hard constraints", () => {
  it("uses half-open boundaries and reports each overlapping resource", () => {
    expect(overlaps(p, { startMinute: 600, endMinute: 660 })).toBe(false);
    expect(overlaps(p, { startMinute: 599, endMinute: 660 })).toBe(true);
    const adjacent = { ...p, seriesId: "second", startMinute: 600, endMinute: 660 };
    expect(validatePlacements([p, adjacent], fixture())).toEqual([]);
    const conflicts = validatePlacements([p, { ...p, seriesId: "second" }], fixture());
    for (const label of ["Teacher", "Section S1", "Room R1"]) expect(conflicts.some(c => c.message.includes(label) && c.rule === "OVERLAP")).toBe(true);
  });
  it("checks capacity equality, qualifications, availability, active resources and teaching days", () => {
    const data = fixture(); expect(validatePlacements([p], data)).toEqual([]);
    data.rooms[0].capacity = 39; data.qualifications[0].archived = true; data.availability = [];
    expect(validatePlacements([p], data).map(c => c.rule)).toEqual(expect.arrayContaining(["CAPACITY", "QUALIFICATION", "AVAILABILITY"]));
    expect(validatePlacements([{ ...p, weekday: 6 }], fixture()).some(c => c.rule === "DAY")).toBe(true);
    data.faculty[0].active = false; expect(validatePlacements([p], data)[0].rule).toBe("RESOURCE");
  });
  it("requires an entire consecutive lab span and suitable room", () => {
    const data = fixture(); data.courses[0].type = "LAB";
    expect(validatePlacements([p], data).some(c => c.rule === "LAB")).toBe(true);
    data.rooms[0].type = "LAB";
    expect(validatePlacements([{ ...p, endMinute: 660 }], data)).toEqual([]);
    expect(validatePlacements([{ ...p, endMinute: 780 }], data).some(c => c.rule === "SLOTS")).toBe(true);
    expect(validatePlacements([{ ...p, startMinute: 550 }], data).some(c => c.rule === "SLOTS")).toBe(true);
  });
  it("enforces daily/weekly caps and counts lab slots toward allocation completeness", () => {
    const data = fixture(); data.faculty[0].maxMinutesPerDay = 59; data.faculty[0].maxMinutesPerWeek = 59;
    expect(validatePlacements([p], data).map(c => c.rule)).toEqual(["DAILY_LIMIT", "WEEKLY_LIMIT"]);
    expect(completeness([p], data, "s")).toHaveLength(1);
    expect(completeness([{ ...p, endMinute: 660 }], data, "s")).toEqual([]);
  });
  it("offers at most three deterministic legal placements without moving peers", () => {
    const data = fixture(), second = { ...p, seriesId: "second" }, snapshot = JSON.stringify([p, second]);
    const found = alternatives(second, [p, second], data);
    expect(found).toHaveLength(3); expect(found[0].startMinute).toBe(600);
    found.forEach(candidate => expect(validatePlacements([p, candidate], data)).toEqual([]));
    expect(JSON.stringify([p, second])).toBe(snapshot);
    data.qualifications = []; expect(alternatives(second, [p, second], data)).toEqual([]);
  });
  it("materializes local dates, skips holidays and preserves a weekly identity across weekday moves", () => {
    const result = materialize([p], "2099-01-05", "2099-01-30", ["2099-01-12"]);
    expect(result.map(r => r.localDate)).toEqual(["2099-01-05", "2099-01-19", "2099-01-26"]);
    expect(instant("2099-01-05", 540).toISOString()).toBe("2099-01-05T03:30:00.000Z");
    expect(weekOf("2099-01-05")).toBe(weekOf("2099-01-09"));
  });
});
