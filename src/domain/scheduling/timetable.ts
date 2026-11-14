/** Pure scheduling rules. Intervals are half-open; configuration is institution-local. */
export type Placement = { seriesId: string; allocationId: string; roomId: string; weekday: number; startMinute: number; endMinute: number };
export type SchedulingData = {
  allocations: { id: string; semesterId: string; courseId: string; sectionId: string; facultyId: string; weeklyPeriods: number; archived: boolean }[];
  courses: { id: string; code: string; name: string; type: string; archived: boolean }[];
  sections: { id: string; code: string; strength: number; archived: boolean }[];
  faculty: { id: string; name: string; archived: boolean; active: boolean; maxMinutesPerDay: number; maxMinutesPerWeek: number }[];
  rooms: { id: string; code: string; type: string; capacity: number; archived: boolean }[];
  qualifications: { facultyId: string; courseId: string; archived: boolean }[];
  availability: { facultyId: string; weekday: number; startMinute: number; endMinute: number; archived: boolean }[];
  slots: { id: string; label: string; weekday: number; startMinute: number; endMinute: number; archived: boolean }[];
};
export type Conflict = { rule: string; seriesId: string; message: string };
export const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function clockTime(n: number) { return `${Math.floor(n / 60).toString().padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`; }
export function overlaps(a: { startMinute: number; endMinute: number }, b: { startMinute: number; endMinute: number }) { return a.startMinute < b.endMinute && b.startMinute < a.endMinute; }
export const maxDraftEntries = 300;
export function slotSpan(p: Placement, data: SchedulingData) {
  const slots = data.slots.filter(s => !s.archived && s.weekday === p.weekday && s.startMinute >= p.startMinute && s.endMinute <= p.endMinute).sort((a, b) => a.startMinute - b.startMinute);
  return slots.length && slots[0].startMinute === p.startMinute && slots.at(-1)!.endMinute === p.endMinute && slots.every((s, i) => !i || slots[i - 1].endMinute === s.startMinute) ? slots.length : 0;
}
export function validatePlacements(entries: Placement[], data: SchedulingData): Conflict[] {
  return entries.flatMap(p => placementConflicts(p, entries.filter(other => other !== p), data));
}

/** Validate one proposed placement against the other assignments. */
export function placementConflicts(p: Placement, others: Placement[], data: SchedulingData): Conflict[] {
  const conflicts: Conflict[] = [];
  const add = (rule: string, message: string) => conflicts.push({ rule, seriesId: p.seriesId, message: `${days[p.weekday] ?? "Invalid day"} ${clockTime(p.startMinute)}–${clockTime(p.endMinute)}: ${message}` });
  const a = data.allocations.find(a => a.id === p.allocationId), room = data.rooms.find(r => r.id === p.roomId);
  const course = data.courses.find(c => c.id === a?.courseId), section = data.sections.find(s => s.id === a?.sectionId), faculty = data.faculty.find(f => f.id === a?.facultyId);
  if (!a || a.archived || !room || room.archived || !course || course.archived || !section || section.archived || !faculty || faculty.archived || !faculty.active) { add("RESOURCE", "Choose available allocation, course, section, teacher and room records."); return conflicts; }
  if (p.weekday < 1 || p.weekday > 5) add("DAY", "Initial timetables allow Monday–Friday only.");
  const count = slotSpan(p, data);
  if (!count || p.endMinute <= p.startMinute) add("SLOTS", "Use complete, consecutive teaching slots without a break.");
  if (course.type === "LAB" && (room.type !== "LAB" || count < 2)) add("LAB", `${course.code} needs a laboratory and at least two consecutive slots.`);
  if (room.capacity < section.strength) add("CAPACITY", `Room ${room.code} holds ${room.capacity}; section ${section.code} needs ${section.strength}.`);
  if (!data.qualifications.some(q => !q.archived && q.facultyId === faculty.id && q.courseId === course.id)) add("QUALIFICATION", `${faculty.name} is not qualified for ${course.code}.`);
  let coveredUntil = p.startMinute;
  for (const interval of data.availability.filter(v => !v.archived && v.facultyId === faculty.id && v.weekday === p.weekday).sort((a, b) => a.startMinute - b.startMinute)) {
    if (interval.startMinute <= coveredUntil && interval.endMinute > coveredUntil) coveredUntil = interval.endMinute;
  }
  if (coveredUntil < p.endMinute) add("AVAILABILITY", `${faculty.name} is unavailable for the full interval.`);
  for (const other of others) {
    if (other.weekday !== p.weekday || !overlaps(p, other)) continue;
    const oa = data.allocations.find(a => a.id === other.allocationId);
    for (const [same, label] of [[oa?.facultyId === a.facultyId, `Teacher ${faculty.name}`], [oa?.sectionId === a.sectionId, `Section ${section.code}`], [other.roomId === p.roomId, `Room ${room.code}`]] as const) {
      if (same) add("OVERLAP", `${label} overlaps another class at ${clockTime(other.startMinute)}–${clockTime(other.endMinute)}.`);
    }
  }
  const assigned = [p, ...others.filter(e => data.allocations.find(a => a.id === e.allocationId)?.facultyId === faculty.id)];
  const minutes = (es: Placement[]) => es.reduce((sum, e) => sum + e.endMinute - e.startMinute, 0);
  if (minutes(assigned.filter(e => e.weekday === p.weekday)) > faculty.maxMinutesPerDay) add("DAILY_LIMIT", `${faculty.name} exceeds the ${faculty.maxMinutesPerDay}-minute daily limit.`);
  if (minutes(assigned) > faculty.maxMinutesPerWeek) add("WEEKLY_LIMIT", `${faculty.name} exceeds the ${faculty.maxMinutesPerWeek}-minute weekly limit.`);
  return conflicts;
}
export function completeness(entries: Placement[], data: SchedulingData, semesterId: string): Conflict[] {
  return data.allocations.filter(a => a.semesterId === semesterId && !a.archived).flatMap(a => {
    const placed = entries.filter(p => p.allocationId === a.id).reduce((n, p) => n + slotSpan(p, data), 0);
    return placed === a.weeklyPeriods ? [] : [{ rule: "INCOMPLETE", seriesId: "", message: `${data.courses.find(c => c.id === a.courseId)?.code} / ${data.sections.find(s => s.id === a.sectionId)?.code}: ${placed} of ${a.weeklyPeriods} weekly periods placed.` }];
  });
}
export function alternatives(candidate: Placement, entries: Placement[], data: SchedulingData): Placement[] {
  const result: Placement[] = [], duration = candidate.endMinute - candidate.startMinute;
  if (duration <= 0) return result;
  const rest = entries.filter(e => e.seriesId !== candidate.seriesId);
  for (const slot of [...data.slots].filter(s => !s.archived && s.weekday >= 1 && s.weekday <= 5).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.id.localeCompare(b.id))) {
    for (const room of [...data.rooms].filter(r => !r.archived).sort((a, b) => a.id.localeCompare(b.id))) {
      const p = { ...candidate, weekday: slot.weekday, startMinute: slot.startMinute, endMinute: slot.startMinute + duration, roomId: room.id };
      if (!validatePlacements([...rest, p], data).length) result.push(p);
      if (result.length === 3) return result;
    }
  }
  return result;
}
export function addDays(date: string, count: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
export function weekday(date: string) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
export function weekOf(date: string) { return addDays(date, -((weekday(date) + 6) % 7)); }
export function localDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
// The pilot institution is explicitly Asia/Kolkata (no daylight-saving shifts).
export function instant(date: string, minute: number) { return new Date(new Date(`${date}T00:00:00+05:30`).getTime() + minute * 60_000); }
export type DatedPlacement = Placement & { localDate: string; startAt: Date; endAt: Date };
export function materialize(entries: Placement[], from: string, to: string, holidays: string[]): DatedPlacement[] {
  const result: DatedPlacement[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (holidays.includes(date)) continue;
    for (const p of entries.filter(e => e.weekday === weekday(date))) result.push({ ...p, localDate: date, startAt: instant(date, p.startMinute), endAt: instant(date, p.endMinute) });
  }
  return result;
}
