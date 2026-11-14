import { describe, expect, it } from "vitest";
import { assignmentErrors, resolveBatch, resolutionPolicy, type Assignment, type Decisions, type ResolutionSnapshot } from "../../src/domain/resolution/engine";
import { simulateDisruption } from "../../src/domain/scheduling/simulation";
const original: Assignment = { occurrenceId: "absent", obligationId: "owed", allocationId: "a", facultyId: "f1", sectionId: "s", roomId: "r", date: "2099-01-05", startMinute: 540, endMinute: 600 };
function fixture(): ResolutionSnapshot {
  return {
    data: {
      allocations: [{ id: "a", semesterId: "sem", courseId: "c", sectionId: "s", facultyId: "f1", weeklyPeriods: 1, archived: false }, { id: "b", semesterId: "sem", courseId: "c", sectionId: "s", facultyId: "f2", weeklyPeriods: 1, archived: false }],
      courses: [{ id: "c", code: "CS", name: "Synthetic course", type: "THEORY", archived: false }], sections: [{ id: "s", code: "S", strength: 30, archived: false }],
      faculty: ["f1", "f2", "f3"].map(id => ({ id, name: id, active: true, archived: false, maxMinutesPerDay: 300, maxMinutesPerWeek: 1200 })),
      rooms: [{ id: "r", code: "R", type: "THEORY", capacity: 30, archived: false }],
      qualifications: ["f1", "f2", "f3"].map(facultyId => ({ facultyId, courseId: "c", archived: false })),
      availability: ["f1", "f2", "f3"].flatMap(facultyId => Array.from({ length: 6 }, (_, i) => ({ facultyId, weekday: i + 1, startMinute: 540, endMinute: 900, archived: false }))),
      slots: Array.from({ length: 6 }, (_, i) => [540, 600, 660].map(startMinute => ({ id: `${i}-${startMinute}`, label: "Slot", weekday: i + 1, startMinute, endMinute: startMinute + 60, archived: false }))).flat(),
    },
    faculty: ["f1", "f2", "f3"].map(id => ({ id, targetMinutesPerWeek: 600, confirmedCoversThisMonth: 0 })), sections: [{ id: "s", preferredPeriodsPerDay: 2 }],
    semesters: [{ id: "sem", startDate: "2099-01-05", endDate: "2099-01-20", archived: false, scheduleRevision: 2 }], holidays: [], leaves: [{ facultyId: "f1", startDate: "2099-01-05", endDate: "2099-01-05" }],
    active: [], affected: [{ ...original }], swappableIds: [], now: "2099-01-01T00:00:00.000Z", onlineEnabled: false, policy: { ...resolutionPolicy },
  };
}
function noSubstitutes(s: ResolutionSnapshot) { s.data.qualifications = s.data.qualifications.filter(q => q.facultyId === "f1"); }
function freeze(value: unknown) { if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); } }

it("keeps a frozen baseline intact and marks a bounded scenario search incomplete", () => {
  const s = fixture();
  s.leaves = [];
  s.active = [original];
  s.affected = [];
  s.policy = { ...s.policy, maxAttemptsPerItem: 1 };
  freeze(s);
  const scenario = { kind: "room" as const, resourceId: "r", startDate: original.date, endDate: original.date };
  const { items, workload } = simulateDisruption(s, s.active, scenario);
  expect(s.active).toEqual([original]);
  expect(s.roomClosures).toBeUndefined();
  expect(items[0].searchComplete).toBe(false);
  expect(items[0].rejections[0].codes).toEqual(["ROOM_CLOSED"]);
  expect(items[0].selected).toBeNull();
  expect(workload[0]).toMatchObject({ baseline: 60, projected: 0 });
});

describe("deterministic resolution ladder", () => {
  it("requires exact qualification and positive target; ranks ratios, confirmed covers, then stable ID", () => {
    const s = fixture();
    expect(resolveBatch(s)[0].candidates.map(c => c.assignments[0].facultyId)).toEqual(["f2", "f3"]);
    s.faculty[1].confirmedCoversThisMonth = 2;
    expect(resolveBatch(s)[0].candidates[0].assignments[0].facultyId).toBe("f3");
    s.active.push({ ...original, occurrenceId: "busy", obligationId: "other", sectionId: "other-section", facultyId: "f3", startMinute: 600, endMinute: 660 });
    expect(resolveBatch(s)[0].candidates[0].assignments[0].facultyId).toBe("f2");
    s.faculty[1].targetMinutesPerWeek = 0;
    const result = resolveBatch(s)[0]; expect(result.candidates[0].assignments[0].facultyId).toBe("f3"); expect(result.rejections.some(r => r.codes.includes("MISSING_TARGET"))).toBe(true);
    s.data.qualifications = s.data.qualifications.filter(q => q.facultyId !== "f3");
    expect(resolveBatch(s)[0].tier).toBe(3);
  });
  it("validates both swap destinations, equal duration, type and same section", () => {
    const s = fixture();
    s.data.availability = s.data.availability.filter(v => v.facultyId !== "f3" && !(v.facultyId === "f2" && v.weekday === 1));
    const partner = { ...original, occurrenceId: "partner", obligationId: "other", allocationId: "b", facultyId: "f2", date: "2099-01-06" };
    s.active = [partner]; s.swappableIds = [partner.occurrenceId];
    // f2 remains qualified/available for a swap; its missing target excludes ratio-ranked cover only.
    s.data.availability.push({ facultyId: "f2", weekday: 1, startMinute: 540, endMinute: 600, archived: false });
    s.faculty[1].targetMinutesPerWeek = 0;
    const swap = resolveBatch(s)[0].candidates[0];
    expect(swap.tier).toBe(2); expect(swap.assignments).toHaveLength(2);
    expect(assignmentErrors(swap.assignments, [], s, 2)).toEqual([]);
    s.leaves.push({ facultyId: "f2", startDate: original.date, endDate: original.date });
    expect(resolveBatch(s)[0].tier).toBe(3);
    s.leaves.pop(); s.active[0].endMinute += 60;
    expect(resolveBatch(s)[0].tier).toBe(3);
    s.active[0].endMinute -= 60; s.active[0].sectionId = "other";
    expect(resolveBatch(s)[0].tier).toBe(3);
  });
  it("keeps selected batch intervals exclusive and re-runs later choices when earlier choices change", () => {
    const s = fixture(); noSubstitutes(s);
    s.affected.push({ ...original, occurrenceId: "second", obligationId: "owed2", startMinute: 600, endMinute: 660 });
    const first = resolveBatch(s)[0].candidates[0];
    const initial = resolveBatch(s)[1].candidates[0];
    expect(first.assignments[0].startMinute).toBe(initial.assignments[0].startMinute);
    const decisions: Decisions = { selected: { absent: first.id, second: initial.id }, rejected: {} };
    let results = resolveBatch(s, decisions);
    expect(results[1].selected).toBeNull(); expect(results[1].selectionError).toBeTruthy();
    expect(results[1].rejections.some(r => r.codes.includes("SECTION_OVERLAP"))).toBe(true);
    decisions.selected.second = results[1].candidates[0].id;
    results = resolveBatch(s, decisions);
    expect(results.every(r => r.selected)).toBe(true);
    const assignments = results.flatMap(r => r.selected!.assignments);
    expect(assignmentErrors(assignments, [], s, 3)).toEqual([]);
    delete decisions.selected.absent;
    expect(resolveBatch(s, decisions)[1].selected).not.toBeNull();
  });
  it("offers online only for enabled non-labs and relaxes only rooms", () => {
    const s = fixture(); noSubstitutes(s); s.data.rooms[0].capacity = 1;
    expect(resolveBatch(s)[0].tier).toBeNull();
    s.onlineEnabled = true;
    const item = resolveBatch(s)[0]; expect(item.tier).toBe(4); expect(item.candidates[0].assignments[0].roomId).toBeNull();
    s.leaves[0].endDate = "2099-01-20";
    expect(resolveBatch(s)[0].tier).toBeNull();
    s.leaves[0].endDate = "2099-01-05"; s.data.courses[0].type = "LAB";
    expect(resolveBatch(s)[0].tier).toBeNull();
  });
  it("offers Saturday only as a distinct approval tier; excludes Sunday, holidays and beyond semester", () => {
    const s = fixture(); noSubstitutes(s);
    s.leaves[0].endDate = "2099-01-09"; s.semesters[0].endDate = "2099-01-11";
    const item = resolveBatch(s)[0]; expect(item.tier).toBe(5); expect(item.candidates[0].assignments[0].date).toBe("2099-01-10"); expect(item.candidates[0].requires).toContain("HoD approval");
    s.holidays.push({ semesterId: "sem", date: "2099-01-10" });
    expect(resolveBatch(s)[0].unresolvedReason).toContain("NO_VALID_CANDIDATE");
    s.holidays = []; s.semesters[0].endDate = "2099-01-09";
    expect(resolveBatch(s)[0].tier).toBeNull();
  });
  it("scores gap, adjacency, preferred count, final period and calendar delay with integers", () => {
    const s = fixture(); noSubstitutes(s);
    s.active = [540, 660].map((startMinute, i) => ({ ...original, occurrenceId: `existing${i}`, obligationId: `other${i}`, date: "2099-01-06", startMinute, endMinute: startMinute + 60 }));
    const candidate = resolveBatch(s)[0].candidates[0];
    expect(candidate.assignments[0]).toMatchObject({ date: "2099-01-06", startMinute: 600 });
    expect(candidate.contributions.map(c => c.value)).toEqual([30, 15, -10, 0, -1]); expect(candidate.score).toBe(34);
    expect(candidate.assignments[0].roomId).toBe("r");
  });
  it("rejects leave, qualification, workload, capacity, incomplete labs, overlap and started destinations", () => {
    const s = fixture(), a = { ...original, facultyId: "f2" };
    s.leaves.push({ facultyId: "f2", startDate: a.date, endDate: a.date });
    s.data.faculty[1].maxMinutesPerDay = 10; s.data.faculty[1].maxMinutesPerWeek = 10;
    s.data.qualifications = []; s.data.rooms[0].capacity = 1; s.data.courses[0].type = "LAB";
    s.now = "2099-02-01T00:00:00Z";
    expect(assignmentErrors([a], [{ ...a, occurrenceId: "busy", obligationId: "other" }], s, 1)).toEqual(expect.arrayContaining(["LEAVE", "QUALIFICATION", "DAILY_LIMIT", "WEEKLY_LIMIT", "CAPACITY", "LAB", "STARTED", "FACULTY_OVERLAP", "SECTION_OVERLAP", "ROOM_OVERLAP"]));
  });
  it("is deterministic over frozen snapshots and does not call incomplete search infeasible", () => {
    const s = fixture(); freeze(s);
    expect(resolveBatch(s)).toEqual(resolveBatch(s));
    const reversed = fixture(); reversed.data.faculty.reverse(); reversed.data.rooms.reverse();
    expect(resolveBatch(reversed)).toEqual(resolveBatch(s));
    const limited = fixture(); noSubstitutes(limited); limited.policy = { ...resolutionPolicy, maxAttemptsPerItem: 1 };
    const item = resolveBatch(limited)[0]; expect(item.searchComplete).toBe(false); expect(item.unresolvedReason).toContain("SEARCH_INCOMPLETE"); expect(item.unresolvedReason).not.toContain("NO_VALID_CANDIDATE");
  });
  it("requires explicit reasons to skip feasible earlier candidates and still shows at most three options", () => {
    const s = fixture(), item = resolveBatch(s)[0];
    const rejected = { absent: item.candidates.map(c => ({ candidateId: c.id, reason: "Synthetic coordinator decision" })) };
    const next = resolveBatch(s, { selected: {}, rejected })[0];
    expect(next.tier).toBe(3); expect(next.skippedTiers).toEqual([1, 2]); expect(next.candidates.length).toBeLessThanOrEqual(3);
    expect(next.rejections.some(r => r.codes.includes("STAFF_REJECTED") && r.reason)).toBe(true);
  });
  it("uses half-open intervals and the 14-day window bounded by current time", () => {
    const s = fixture(); noSubstitutes(s); s.leaves[0].endDate = "2099-01-18";
    expect(resolveBatch(s)[0].candidates.every(c => c.assignments[0].date === "2099-01-19")).toBe(true);
    s.leaves[0].endDate = "2099-01-19";
    expect(resolveBatch(s)[0].tier).toBeNull();
    const a = { ...original, facultyId: "f2" };
    expect(assignmentErrors([a], [{ ...a, occurrenceId: "other", obligationId: "other", startMinute: 600, endMinute: 660 }], fixture(), 1)).toEqual([]);
  });
  it("does not let a later swap move a class already committed by an earlier batch choice", () => {
    const s = fixture(); s.faculty[1].targetMinutesPerWeek = 0; s.faculty[2].targetMinutesPerWeek = 0;
    const partner = { ...original, allocationId: "b", facultyId: "f2", occurrenceId: "partner", obligationId: "partner-owed", date: "2099-01-06" };
    s.active = [partner]; s.swappableIds = [partner.occurrenceId];
    s.affected.push({ ...original, occurrenceId: "second", obligationId: "second-owed", startMinute: 600, endMinute: 660 });
    const first = resolveBatch(s)[0].candidates[0]; expect(first.tier).toBe(2);
    const results = resolveBatch(s, { selected: { absent: first.id }, rejected: {} });
    expect(results[1].tier).toBe(3); expect(results[1].candidates.every(c => !c.removes.includes("partner"))).toBe(true);
  });
  it("caps visible options, keeps stable room ties, and ignores rejection without an explanation", () => {
    const s = fixture(); noSubstitutes(s);
    s.data.rooms.push({ ...s.data.rooms[0], id: "z", code: "Z" });
    const a = resolveBatch(s)[0]; expect(a.candidates).toHaveLength(3); expect(a.candidates[0].assignments[0].roomId).toBe("r");
    const b = resolveBatch(s, { selected: {}, rejected: { absent: [{ candidateId: a.candidates[0].id, reason: " " }] } })[0];
    expect(b.candidates).toEqual(a.candidates);
    s.data.rooms.reverse(); s.data.slots.reverse(); expect(resolveBatch(s)[0]).toEqual(a);
  });
  it("allows future swaps before leave or beyond the makeup window when both semester destinations pass", () => {
    for (const date of ["2099-01-06", "2099-01-29"]) {
      const s = fixture(); s.affected[0].date = "2099-01-12"; s.semesters[0].endDate = "2099-01-30";
      s.leaves = [{ facultyId: "f1", startDate: "2099-01-12", endDate: "2099-01-12" }];
      s.faculty[1].targetMinutesPerWeek = 0; s.faculty[2].targetMinutesPerWeek = 0;
      const partner = { ...original, allocationId: "b", facultyId: "f2", occurrenceId: "partner", obligationId: "partner-owed", date };
      s.active = [partner]; s.swappableIds = [partner.occurrenceId];
      const item = resolveBatch(s)[0]; expect(item.tier).toBe(2); expect(item.candidates[0].assignments[0].date).toBe(date);
    }
  });
});
