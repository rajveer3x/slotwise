import { weekday } from "@/domain/scheduling/timetable";

type FacultyTarget = { id: string; name: string; targetMinutesPerWeek: number | null };
type PlannedClass = { facultyId: string; startAt: Date; endAt: Date };
type DeliveredClass = { confirmedMinutes: number; occurrence: { facultyId: string; resolutionTier: number | null } };

export function workloadMetrics(faculty: FacultyTarget[], planned: PlannedClass[], delivered: DeliveredClass[]) {
  const byFaculty = new Map(faculty.map(person => [person.id, {
    ...person, plannedMinutes: 0, deliveredMinutes: 0, confirmedCovers: 0,
  }]));
  for (const assignment of planned) {
    const row = byFaculty.get(assignment.facultyId);
    if (row) row.plannedMinutes += (assignment.endAt.getTime() - assignment.startAt.getTime()) / 60_000;
  }
  for (const record of delivered) {
    const row = byFaculty.get(record.occurrence.facultyId);
    if (!row) continue;
    row.deliveredMinutes += record.confirmedMinutes;
    if (record.occurrence.resolutionTier === 1) row.confirmedCovers++;
  }
  return [...byFaculty.values()].map(row => {
    const target = row.targetMinutesPerWeek;
    const utilization = target && target > 0 ? row.plannedMinutes / target : null;
    const band = utilization === null ? "Target not configured" :
      utilization < 0.9 ? "Under target" : utilization > 1.1 ? "Over target" : "Balanced";
    return { ...row, utilization, band };
  });
}

type RecoveryObligation = {
  occurrences: { localDate: string; schedulingStatus: "ACTIVE" | "CANCELLED"; deliveryRecords: { id: string }[] }[];
};

export function recoveryMetrics(obligations: RecoveryObligation[]) {
  const categories = [
    { label: "Weekday", planned: 0, delivered: 0 },
    { label: "Saturday", planned: 0, delivered: 0 },
    { label: "Unresolved", planned: 0, delivered: 0 },
  ];
  for (const { occurrences } of obligations) {
    const recovery = occurrences.find(o => o.deliveryRecords.length > 0) ??
      occurrences.find(o => o.schedulingStatus === "ACTIVE");
    const category = recovery ? categories[weekday(recovery.localDate) === 6 ? 1 : 0] : categories[2];
    category.planned++;
    if (recovery?.deliveryRecords.length) category.delivered++;
  }
  const affected = obligations.length;
  const weekdayRate = affected ? categories[0].planned / affected : null;
  return { affected, weekdayRate, categories, delivered: categories[0].delivered + categories[1].delivered };
}
