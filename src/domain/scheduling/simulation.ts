import { resolveBatch, type Assignment, type ResolutionSnapshot } from "../resolution/engine";
import { workloadMetrics } from "../workload/metrics";
import { instant, weekOf } from "./timetable";

type Disruption = { kind: "room" | "faculty"; resourceId: string; startDate: string; endDate: string };

export function simulateDisruption(baseline: ResolutionSnapshot, affected: Assignment[], scenario: Disruption) {
  const { kind, resourceId, startDate, endDate } = scenario;
  const removed = new Set(affected.map(a => a.occurrenceId));
  const retained = baseline.active.filter(a => !removed.has(a.occurrenceId));
  // The engine reads shared baseline fields and owns all arrays it changes.
  const hypothetical: ResolutionSnapshot = {
    ...baseline,
    active: retained,
    affected: [...affected],
    swappableIds: baseline.swappableIds.filter(id => !removed.has(id)),
    ...(kind === "room"
      ? { roomClosures: [{ roomId: resourceId, startDate, endDate }] }
      : { facultyAbsences: [{ facultyId: resourceId, startDate, endDate }] }),
  };
  const items = resolveBatch(hypothetical, undefined, { selectFirst: true });
  const recoveries = items.flatMap(item => item.selected ? [item.selected] : []);
  const displaced = new Set(recoveries.flatMap(candidate => candidate.removes));
  const reassigned = recoveries.flatMap(candidate => candidate.assignments);
  const projected = [...retained.filter(a => !displaced.has(a.occurrenceId)), ...reassigned];
  const touched = [...affected, ...reassigned, ...retained.filter(a => displaced.has(a.occurrenceId))];

  const weeks = new Map<string, Set<string>>();
  for (const a of touched) {
    const week = weekOf(a.date);
    if (!weeks.has(week)) weeks.set(week, new Set());
    weeks.get(week)!.add(a.facultyId);
  }
  const workload = [...weeks.keys()].sort().flatMap(week => {
    const faculty = baseline.data.faculty.filter(f => weeks.get(week)!.has(f.id)).map(f => ({
      id: f.id, name: f.name,
      targetMinutesPerWeek: baseline.faculty.find(target => target.id === f.id)?.targetMinutesPerWeek ?? null,
    })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const planned = (assignments: Assignment[]) => assignments.filter(a => weekOf(a.date) === week).map(a => ({
      facultyId: a.facultyId, startAt: instant(a.date, a.startMinute), endAt: instant(a.date, a.endMinute),
    }));
    const before = workloadMetrics(faculty, planned(baseline.active), []);
    const after = workloadMetrics(faculty, planned(projected), []);
    return before.map((row, index) => ({
      key: `${week}/${row.id}`, week, faculty: row.name, target: row.targetMinutesPerWeek,
      baseline: row.plannedMinutes, projected: after[index].plannedMinutes,
    }));
  });

  return { items, workload };
}
