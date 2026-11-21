import { addDays, instant, slotSpan, weekday, weekOf, type SchedulingData } from "../scheduling/timetable";

export type ResolutionPolicy = { readonly version: string; readonly searchDays: number; readonly maxAttemptsPerItem: number; readonly gap: number; readonly adjacent: number; readonly excessPeriod: number; readonly finalPeriod: number; readonly delayDay: number };
export const resolutionPolicy: ResolutionPolicy = { version: "demo-v1", searchDays: 14, maxAttemptsPerItem: 10000, gap: 30, adjacent: 15, excessPeriod: -10, finalPeriod: -5, delayDay: -1 };
export const tierNames = ["Unresolved", "Substitute", "Swap", "Weekday", "Online", "Saturday"];
export type Assignment = { occurrenceId: string; obligationId: string; allocationId: string; facultyId: string; sectionId: string; roomId: string | null; date: string; startMinute: number; endMinute: number };
export type ResolutionSnapshot = {
  data: SchedulingData;
  faculty: { id: string; targetMinutesPerWeek: number; confirmedCoversThisMonth: number }[];
  sections: { id: string; preferredPeriodsPerDay: number }[];
  semesters: { id: string; startDate: string; endDate: string; archived: boolean; scheduleRevision: number }[];
  holidays: { semesterId: string; date: string }[];
  leaves: { facultyId: string; startDate: string; endDate: string }[];
  facultyAbsences?: { facultyId: string; startDate: string; endDate: string }[];
  roomClosures?: { roomId: string; startDate: string; endDate: string }[];
  active: Assignment[];
  affected: Assignment[];
  swappableIds: string[];
  now: string;
  onlineEnabled: boolean;
  policy: typeof resolutionPolicy;
};
export type Candidate = { id: string; tier: number; assignments: Assignment[]; removes: string[]; score: number; contributions: { reason: string; value: number }[]; why: string; requires: string | null };
export type Rejection = { tier: number; candidateId: string; codes: string[]; reason?: string; proposed?: Assignment };
export type Decisions = { selected: Record<string, string>; rejected: Record<string, { candidateId: string; reason: string }[]> };
export type ResolutionItem = { original: Assignment; tier: number | null; candidates: Candidate[]; selected: Candidate | null; rejections: Rejection[]; searchComplete: boolean; unresolvedReason: string | null; selectionError: string | null; skippedTiers: number[] };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const minutes = (a: Assignment) => a.endMinute - a.startMinute;
function course(a: Assignment, s: ResolutionSnapshot) { const allocation = s.data.allocations.find(x => x.id === a.allocationId); return s.data.courses.find(c => c.id === allocation?.courseId); }
function periods(a: Assignment, s: ResolutionSnapshot) { return slotSpan({ seriesId: a.occurrenceId, allocationId: a.allocationId, weekday: weekday(a.date), startMinute: a.startMinute, endMinute: a.endMinute, roomId: a.roomId ?? "" }, s.data); }
export function candidateId(tier: number, assignments: Assignment[]) { return JSON.stringify([tier, ...assignments.map(a => [a.occurrenceId, a.obligationId, a.allocationId, a.facultyId, a.sectionId, a.roomId, a.date, a.startMinute, a.endMinute])]); }

/** Validate a complete proposed change, including both destinations of a swap. */
export function assignmentErrors(assignments: Assignment[], retained: Assignment[], s: ResolutionSnapshot, tier: number): string[] {
  const errors = new Set<string>(), all = [...retained, ...assignments];
  for (const a of assignments) {
    const allocation = s.data.allocations.find(x => x.id === a.allocationId), c = course(a, s);
    const f = s.data.faculty.find(f => f.id === a.facultyId), section = s.data.sections.find(x => x.id === a.sectionId);
    const semester = s.semesters.find(x => x.id === allocation?.semesterId), room = s.data.rooms.find(x => x.id === a.roomId);
    if (!allocation || allocation.archived || !c || c.archived || !f || f.archived || !f.active || !section || section.archived || allocation.sectionId !== a.sectionId || !semester || semester.archived) { errors.add("RESOURCE"); continue; }
    if (a.date < semester.startDate || a.date > semester.endDate) errors.add("SEMESTER_BOUNDARY");
    if (instant(a.date, a.startMinute).getTime() <= Date.parse(s.now)) errors.add("STARTED");
    if (s.holidays.some(h => h.semesterId === semester.id && h.date === a.date)) errors.add("HOLIDAY");
    const day = weekday(a.date), count = periods(a, s);
    if (day < 1 || day > 5 && !(tier === 5 && day === 6)) errors.add("DAY");
    if (!count || minutes(a) <= 0) errors.add("SLOTS");
    if (!s.data.qualifications.some(q => !q.archived && q.facultyId === f.id && q.courseId === c.id)) errors.add("QUALIFICATION");
    let covered = a.startMinute;
    for (const v of s.data.availability.filter(v => !v.archived && v.facultyId === f.id && v.weekday === day).sort((a, b) => a.startMinute - b.startMinute)) if (v.startMinute <= covered) covered = Math.max(covered, v.endMinute);
    if (covered < a.endMinute) errors.add("AVAILABILITY");
    if (s.leaves.some(l => l.facultyId === f.id && l.startDate <= a.date && l.endDate >= a.date)) errors.add("LEAVE");
    if (s.facultyAbsences?.some(l => l.facultyId === f.id && l.startDate <= a.date && l.endDate >= a.date)) errors.add("FACULTY_ABSENT");
    if (a.roomId === null) { if (tier !== 4 || !s.onlineEnabled || c.type === "LAB") errors.add("ONLINE_POLICY"); }
    else {
      if (!room || room.archived) errors.add("ROOM");
      else { if (room.capacity < section.strength) errors.add("CAPACITY"); if (c.type === "LAB" && room.type !== "LAB") errors.add("LAB"); }
      if (s.roomClosures?.some(r => r.roomId === a.roomId && r.startDate <= a.date && r.endDate >= a.date)) errors.add("ROOM_CLOSED");
    }
    if (c.type === "LAB" && count < 2) errors.add("LAB");
    for (const b of all) {
      if (b === a) continue;
      if (b.obligationId === a.obligationId) errors.add("OBLIGATION_RESERVED");
      if (a.date !== b.date || a.startMinute >= b.endMinute || b.startMinute >= a.endMinute) continue;
      if (a.facultyId === b.facultyId) errors.add("FACULTY_OVERLAP");
      if (a.sectionId === b.sectionId) errors.add("SECTION_OVERLAP");
      if (a.roomId && a.roomId === b.roomId) errors.add("ROOM_OVERLAP");
    }
    const assigned = all.filter(b => b.facultyId === a.facultyId);
    if (assigned.filter(b => b.date === a.date).reduce((n, b) => n + minutes(b), 0) > f.maxMinutesPerDay) errors.add("DAILY_LIMIT");
    if (assigned.filter(b => weekOf(b.date) === weekOf(a.date)).reduce((n, b) => n + minutes(b), 0) > f.maxMinutesPerWeek) errors.add("WEEKLY_LIMIT");
  }
  return [...errors].sort(compare);
}
function scoreSlot(a: Assignment, original: Assignment, retained: Assignment[], s: ResolutionSnapshot) {
  const classes = retained.filter(b => b.sectionId === a.sectionId && b.date === a.date);
  const gap = classes.some(b => b.endMinute <= a.startMinute) && classes.some(b => b.startMinute >= a.endMinute);
  const adjacent = classes.some(b => b.endMinute === a.startMinute || b.startMinute === a.endMinute);
  const count = classes.reduce((n, b) => n + periods(b, s), periods(a, s));
  const preferred = s.sections.find(x => x.id === a.sectionId)?.preferredPeriodsPerDay ?? 0;
  const last = Math.max(...s.data.slots.filter(x => !x.archived && x.weekday === weekday(a.date)).map(x => x.startMinute));
  const delay = Math.round((Date.parse(a.date) - Date.parse(original.date)) / 86400000);
  return [
    { reason: "Fills a section gap", value: gap ? s.policy.gap : 0 },
    { reason: "Adjacent to an existing class", value: adjacent ? s.policy.adjacent : 0 },
    { reason: `${Math.max(0, count - preferred)} periods above preferred daily count`, value: Math.max(0, count - preferred) * s.policy.excessPeriod || 0 },
    { reason: "Includes the final teaching period", value: a.endMinute > last ? s.policy.finalPeriod : 0 },
    { reason: `${delay} calendar days of delay`, value: delay * s.policy.delayDay || 0 },
  ];
}

/** No I/O, clock reads, random values or mutations. Selected items are temporary batch reservations only. */
export function resolveBatch(s: ResolutionSnapshot, decisions: Decisions = { selected: {}, rejected: {} }, { selectFirst = false, allSubstitutes = false } = {}): ResolutionItem[] {
  let retained = [...s.active];
  const lockedChoices = new Set<string>();
  return [...s.affected].sort((a, b) => compare(a.date, b.date) || a.startMinute - b.startMinute || compare(a.occurrenceId, b.occurrenceId)).map(original => {
    const rejections: Rejection[] = [], skippedTiers: number[] = [];
    let attempts = 0, searchComplete = true, candidates: Candidate[] = [], tier: number | null = null;
    const rejected = decisions.rejected[original.occurrenceId] ?? [];
    for (let t = 1; t <= 5; t++) {
      const valid: Candidate[] = [];
      const initialAttempts = attempts, initialRejections = rejections.length;
      const consider = (assignments: Assignment[], removes: string[] = []) => {
        if (++attempts > s.policy.maxAttemptsPerItem) { searchComplete = false; return; }
        const id = candidateId(t, assignments), remaining = retained.filter(a => !removes.includes(a.occurrenceId));
        const codes = assignmentErrors(assignments, remaining, s, t);
        const configuration = s.faculty.find(f => f.id === assignments[0].facultyId);
        if (t === 1 && (!configuration || configuration.targetMinutesPerWeek <= 0)) codes.push("MISSING_TARGET");
        const rejection = rejected.find(x => x.candidateId === id && x.reason.trim());
        if (rejection) codes.push("STAFF_REJECTED");
        if (codes.length) { rejections.push({ tier: t, candidateId: id, codes: [...new Set(codes)].sort(compare), proposed: assignments[0], ...(rejection ? { reason: rejection.reason } : {}) }); return; }
        const contributions = t >= 3 ? scoreSlot(assignments[0], original, remaining, s) : [];
        const load = remaining.filter(a => a.facultyId === assignments[0].facultyId && weekOf(a.date) === weekOf(original.date)).reduce((n, a) => n + minutes(a), 0);
        const why = t === 1 ? `Qualified and available; ${load}/${configuration!.targetMinutesPerWeek} assigned/target minutes this week; ${configuration!.confirmedCoversThisMonth} confirmed covers this month.` : t === 2 ? "Equal-duration, same-section swap. Both teachers, rooms and destination limits pass." : "Teacher, section, teaching hours and workload pass hard constraints.";
        valid.push({ id, tier: t, assignments, removes, contributions, score: contributions.reduce((n, x) => n + x.value, 0), why, requires: t === 1 ? "Faculty acceptance required before publication" : t === 4 ? "Valid meeting URL required before publication" : t === 5 ? "Exact candidate requires HoD approval; earlier tiers failed or were explicitly rejected" : null });
      };
      if (t === 1) {
        for (const f of [...s.data.faculty].sort((a, b) => compare(a.id, b.id))) {
          if (f.id !== original.facultyId) consider([{ ...original, facultyId: f.id }]);
          if (!searchComplete) break;
        }
      } else if (t === 2) {
        for (const b of [...retained].sort((a, b) => compare(a.occurrenceId, b.occurrenceId))) {
          if (lockedChoices.has(b.occurrenceId) || !s.swappableIds.includes(b.occurrenceId) || b.sectionId !== original.sectionId || minutes(b) !== minutes(original) || course(b, s)?.type !== course(original, s)?.type) continue;
          consider([{ ...original, date: b.date, startMinute: b.startMinute, endMinute: b.endMinute, roomId: b.roomId }, { ...b, date: original.date, startMinute: original.startMinute, endMinute: original.endMinute, roomId: original.roomId }], [b.occurrenceId]);
          if (!searchComplete) break;
        }
      } else if (t === 4 && (!s.onlineEnabled || course(original, s)?.type === "LAB")) {
        rejections.push({ tier: t, candidateId: "policy", codes: ["ONLINE_POLICY"] });
      } else {
        const a = s.data.allocations.find(a => a.id === original.allocationId), semester = s.semesters.find(x => x.id === a?.semesterId);
        const end = semester && semester.endDate < addDays(original.date, s.policy.searchDays) ? semester.endDate : addDays(original.date, s.policy.searchDays);
        search: for (let date = addDays(original.date, 1); date <= end; date = addDays(date, 1)) {
          const day = weekday(date);
          if (t === 5 ? day !== 6 : day < 1 || day > 5) continue;
          for (const slot of [...s.data.slots].filter(x => !x.archived && x.weekday === day).sort((a, b) => a.startMinute - b.startMinute || compare(a.id, b.id))) {
            const rooms = t === 4 ? [null] : [...s.data.rooms].filter(r => !r.archived).sort((a, b) => compare(a.id, b.id));
            for (const room of rooms) {
              consider([{ ...original, date, startMinute: slot.startMinute, endMinute: slot.startMinute + minutes(original), roomId: room?.id ?? null }]);
              if (!searchComplete) break search;
            }
          }
        }
      }
      if (attempts === initialAttempts && rejections.length === initialRejections) rejections.push({ tier: t, candidateId: "no-proposal", codes: [t === 2 ? "NO_SWAP_PARTNER" : "NO_SEARCH_SLOT"] });
      valid.sort((a, b) => {
        const aa = a.assignments[0], bb = b.assignments[0];
        if (t === 1) {
          const fa = s.faculty.find(f => f.id === aa.facultyId)!, fb = s.faculty.find(f => f.id === bb.facultyId)!;
          const load = (id: string) => retained.filter(x => x.facultyId === id && weekOf(x.date) === weekOf(original.date)).reduce((n, x) => n + minutes(x), 0);
          return load(fa.id) * fb.targetMinutesPerWeek - load(fb.id) * fa.targetMinutesPerWeek || fa.confirmedCoversThisMonth - fb.confirmedCoversThisMonth || compare(fa.id, fb.id);
        }
        return b.score - a.score || compare(aa.date, bb.date) || aa.startMinute - bb.startMinute || compare(aa.roomId ?? "", bb.roomId ?? "") || compare(a.id, b.id);
      });
      if (valid.length) { candidates = valid; tier = t; break; }
      if (!searchComplete) break;
      skippedTiers.push(t);
    }
    const selectedId = decisions.selected[original.occurrenceId];
    const selected = (selectedId ? candidates.find(c => c.id === selectedId) : selectFirst ? candidates[0] : null) ?? null;
    if (selected) { retained = [...retained.filter(a => !selected.removes.includes(a.occurrenceId)), ...selected.assignments]; for (const a of selected.assignments) lockedChoices.add(a.occurrenceId); }
    const selectionError = selectedId && !selected ? "Saved selection is no longer valid in this batch. Choose again or clear it." : null;
    const visible = allSubstitutes && tier === 1 ? candidates : candidates.slice(0, 3);
    if (selected && !visible.includes(selected)) visible[2] = selected;
    return { original, tier, candidates: visible, selected, rejections, searchComplete, skippedTiers, selectionError, unresolvedReason: !candidates.length ? !searchComplete ? "SEARCH_INCOMPLETE: search limit reached; infeasibility is not proven." : "NO_VALID_CANDIDATE: no option within the configured search window passes every hard rule." : null };
  });
}

export const rejectionLabels: Record<string, string> = {
  RESOURCE: "A required record is inactive or unavailable", SEMESTER_BOUNDARY: "Outside semester dates", STARTED: "Class has already started", HOLIDAY: "Holiday", DAY: "Teaching day is not allowed", SLOTS: "Requires complete consecutive teaching slots", QUALIFICATION: "Teacher lacks the exact course qualification", AVAILABILITY: "Teacher unavailable for the full interval", LEAVE: "Teacher has approved leave", ONLINE_POLICY: "Online disabled or lab requires in-person teaching", ROOM: "Room unavailable", CAPACITY: "Room too small", LAB: "Lab needs a suitable room and consecutive slots", FACULTY_OVERLAP: "Teacher already occupied", SECTION_OVERLAP: "Section already occupied", ROOM_OVERLAP: "Room already occupied", DAILY_LIMIT: "Teacher daily limit exceeded", WEEKLY_LIMIT: "Teacher weekly limit exceeded", MISSING_TARGET: "Positive weekly target required for substitute ranking", STAFF_REJECTED: "Explicitly rejected by coordinator", OBLIGATION_RESERVED: "Teaching obligation already selected or scheduled",
  NO_SWAP_PARTNER: "No eligible equal-duration, same-section swap partner", NO_SEARCH_SLOT: "No configured candidate resources or teaching slots within the window and semester",
  ROOM_CLOSED: "Room closed in this simulation", FACULTY_ABSENT: "Teacher absent in this simulation",
};
