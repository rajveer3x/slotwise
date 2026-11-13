// Shared form descriptions contain no database or authorization code.
export const kinds = ["semester", "holiday", "faculty", "facultyAvailability", "course", "facultyQualification", "section", "sectionMembership", "room", "timeSlot", "courseAllocation"] as const;
export type Kind = typeof kinds[number];
export type Field = { key: string; label: string; type?: "number" | "date" | "time" | "checkbox" | "type" | "weekday"; ref?: Kind | "facultyUser" | "studentUser"; immutable?: boolean };
export const config: Record<Kind, { label: string; singular: string; fields: Field[] }> = {
  semester: { label: "Semesters", singular: "semester", fields: [{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "startDate", label: "Start date", type: "date" }, { key: "endDate", label: "End date", type: "date" }, { key: "active", label: "Active semester", type: "checkbox" }] },
  holiday: { label: "Holidays", singular: "holiday", fields: [{ key: "semesterId", label: "Semester", ref: "semester", immutable: true }, { key: "date", label: "Date", type: "date" }, { key: "name", label: "Name" }] },
  faculty: { label: "Faculty", singular: "faculty profile", fields: [{ key: "userId", label: "Faculty account", ref: "facultyUser", immutable: true }, { key: "designation", label: "Designation" }, { key: "targetMinutesPerWeek", label: "Target minutes per week", type: "number" }, { key: "maxMinutesPerDay", label: "Maximum minutes per day", type: "number" }, { key: "maxMinutesPerWeek", label: "Maximum minutes per week", type: "number" }] },
  facultyAvailability: { label: "Availability", singular: "availability interval", fields: [{ key: "facultyId", label: "Faculty", ref: "faculty", immutable: true }, { key: "weekday", label: "Weekday", type: "weekday" }, { key: "startMinute", label: "Start time", type: "time" }, { key: "endMinute", label: "End time", type: "time" }] },
  course: { label: "Courses", singular: "course", fields: [{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "type", label: "Teaching type", type: "type" }, { key: "requiredContactMinutes", label: "Default semester contact minutes", type: "number" }] },
  facultyQualification: { label: "Qualifications", singular: "qualification", fields: [{ key: "facultyId", label: "Faculty", ref: "faculty", immutable: true }, { key: "courseId", label: "Course", ref: "course", immutable: true }] },
  section: { label: "Sections", singular: "section", fields: [{ key: "semesterId", label: "Semester", ref: "semester", immutable: true }, { key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "strength", label: "Student strength", type: "number" }, { key: "preferredPeriodsPerDay", label: "Preferred periods per day", type: "number" }] },
  sectionMembership: { label: "Memberships", singular: "student membership", fields: [{ key: "sectionId", label: "Section", ref: "section", immutable: true }, { key: "userId", label: "Student account", ref: "studentUser", immutable: true }, { key: "isRepresentative", label: "Class representative", type: "checkbox" }] },
  room: { label: "Rooms", singular: "room", fields: [{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "type", label: "Room type", type: "type" }, { key: "capacity", label: "Capacity", type: "number" }] },
  timeSlot: { label: "Teaching slots", singular: "teaching slot", fields: [{ key: "label", label: "Label" }, { key: "weekday", label: "Weekday", type: "weekday" }, { key: "startMinute", label: "Start time", type: "time" }, { key: "endMinute", label: "End time", type: "time" }] },
  courseAllocation: { label: "Allocations", singular: "course allocation", fields: [{ key: "semesterId", label: "Semester", ref: "semester", immutable: true }, { key: "sectionId", label: "Section", ref: "section", immutable: true }, { key: "courseId", label: "Course", ref: "course", immutable: true }, { key: "facultyId", label: "Faculty", ref: "faculty" }, { key: "weeklyPeriods", label: "Weekly periods", type: "number" }, { key: "requiredContactMinutes", label: "Required semester contact minutes", type: "number" }] },
};
export type MasterRow = { id: string; departmentId: string; archived: boolean; version: number; [key: string]: string | number | boolean };
export type MasterSnapshot = { records: Record<Kind, MasterRow[]>; users: { id: string; name: string; role: string; active: boolean }[] };
export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function timeLabel(minute: number) { return `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`; }
export function recordLabel(kind: Kind, row: MasterRow, snapshot: MasterSnapshot): string {
  const user = snapshot.users.find(u => u.id === row.userId);
  if (kind === "faculty") return user?.name ?? "Faculty account unavailable";
  if (row.code) return `${row.code} · ${row.name}`;
  if (kind === "timeSlot") return `${row.label} · ${weekdays[Number(row.weekday) - 1]} ${timeLabel(Number(row.startMinute))}–${timeLabel(Number(row.endMinute))}`;
  if (row.name) return `${row.name}${row.date ? ` · ${row.date}` : ""}`;
  return config[kind].fields.filter(f => f.ref || f.type === "weekday" || f.type === "time").map(f => {
    if (f.ref === "studentUser") return user?.name ?? "Student account unavailable";
    if (f.ref && kinds.includes(f.ref as Kind)) {
      const ref = snapshot.records[f.ref as Kind].find(r => r.id === row[f.key]);
      return ref ? recordLabel(f.ref as Kind, ref, snapshot) : "Archived reference";
    }
    return f.type === "time" ? timeLabel(Number(row[f.key])) : weekdays[Number(row[f.key]) - 1];
  }).join(" · ");
}
