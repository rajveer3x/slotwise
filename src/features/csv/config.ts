export const csvKinds = ["faculty", "course", "room", "timetable"] as const;
export type CsvKind = typeof csvKinds[number];
export const csvMaxBytes = 128 * 1024;
export const csvMaxRows = 300;

export const csvTemplates = {
  faculty: {
    label: "Faculty",
    headers: ["accountEmail", "designation", "targetMinutesPerWeek", "maxMinutesPerDay", "maxMinutesPerWeek"],
    example: ["instructor@example.test", "Lecturer", "720", "240", "1080"],
    help: "Use the email of an active faculty or HoD account in your department. Each account can have one profile.",
  },
  course: {
    label: "Courses",
    headers: ["code", "name", "type", "requiredContactMinutes"],
    example: ["CS201", "Computing, Systems and Design", "THEORY", "2400"],
    help: "Use a new course code, THEORY or LAB, and positive whole contact minutes.",
  },
  room: {
    label: "Rooms",
    headers: ["code", "name", "type", "capacity"],
    example: ["R201", "Teaching room", "THEORY", "60"],
    help: "Use a new room code, THEORY or LAB, and a positive whole capacity.",
  },
  timetable: {
    label: "Weekly timetable draft",
    headers: ["sectionCode", "courseCode", "roomCode", "weekday", "startTime", "endTime"],
    example: ["S1", "CS101", "R1", "1", "09:00", "10:00"],
    help: "Use section and allocated course codes from the selected semester and a department room code. Weekdays are 1 (Monday) through 5 (Friday). Enter 24-hour slot times as HH:MM.",
  },
} satisfies Record<CsvKind, { label: string; headers: string[]; example: string[]; help: string }>;

export type CsvIssue = { row: number; column: string; message: string };
export type CsvRow = { row: number; values: string[] };
export type CsvFailure = { ok: false; code: string; message: string; issues?: CsvIssue[] };
export type CsvPreview = {
  ok: true;
  kind: CsvKind;
  rows: CsvRow[];
  issues: CsvIssue[];
  token: { id: string; signature: string } | null;
};
export type CsvCommit = { ok: true; count: number; semesterId?: string; draftId?: string };
