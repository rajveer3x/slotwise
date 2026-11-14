import "server-only";
import { z } from "zod";
import { slotSpan, validatePlacements, type Placement } from "@/domain/scheduling/timetable";
import { dataSchemas } from "@/features/master-data/schema";
import { csvTemplates, type CsvIssue, type CsvKind, type CsvRow } from "@/features/csv/config";
import { schedulingData, type Tx } from "./scheduling-store";

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,29}$/, "Enter a valid code.");
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const startTime = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM start time.");
const endTime = z.string().trim().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "Use a 24-hour HH:MM end time.");
const timetableRow = z.object({
  sectionCode: code, courseCode: code, roomCode: code,
  weekday: z.string().trim().regex(/^[1-5]$/, "Enter a weekday from 1 (Monday) to 5 (Friday)."),
  startTime, endTime,
}).refine(row => row.startTime < row.endTime, { path: ["endTime"], message: "End time must follow start time." });
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const managerFacultyRoles = ["FACULTY", "HOD"] as const;

function readRow<T>(kind: CsvKind, row: CsvRow, schema: z.ZodType<T>, issues: CsvIssue[], extra?: Record<string, string>): T | undefined {
  const { headers } = csvTemplates[kind];
  if (row.values.length !== headers.length || issues.some(issue => issue.row === row.row)) return;
  const input = Object.fromEntries(headers.map((column, i) => [column, row.values[i]]));
  const result = schema.safeParse({ ...input, ...extra });
  if (result.success) return result.data;
  for (const issue of result.error.issues) issues.push({ row: row.row, column: String(issue.path[0] ?? headers[0]), message: issue.message });
}

function rejectDuplicate(key: string, row: number, column: string, seen: Map<string, number>, issues: CsvIssue[]) {
  const first = seen.get(key);
  if (first !== undefined) issues.push({ row, column, message: `Duplicates row ${first}.` });
  else seen.set(key, row);
}

export type CsvMasterBatch =
  | { kind: "faculty"; records: z.infer<typeof dataSchemas.faculty>[] }
  | { kind: "course"; records: z.infer<typeof dataSchemas.course>[] }
  | { kind: "room"; records: z.infer<typeof dataSchemas.room>[] };

export async function validateMasterRows(tx: Tx, departmentId: string, kind: CsvMasterBatch["kind"], rows: CsvRow[], issues: CsvIssue[]): Promise<CsvMasterBatch> {
  const seen = new Map<string, number>();
  if (kind === "faculty") {
    const emails = rows.map(r => r.values[0]?.trim().toLowerCase()).filter((value): value is string => !!value);
    const users = await tx.user.findMany({
      where: { departmentId, email: { in: emails }, active: true, role: { in: [...managerFacultyRoles] } },
      select: { id: true, email: true, faculty: { select: { id: true } } },
    });
    const accounts = new Map(users.map(user => [user.email, user]));
    const records = rows.flatMap(row => {
      const address = readRow(kind, row, z.object({ accountEmail: email }), issues);
      if (!address) return [];
      const user = accounts.get(address.accountEmail);
      const record = readRow(kind, row, dataSchemas.faculty, issues, { userId: user?.id ?? "unresolved" });
      rejectDuplicate(address.accountEmail, row.row, "accountEmail", seen, issues);
      if (!user || user.faculty) issues.push({ row: row.row, column: "accountEmail", message: user
        ? "This account already has a faculty profile, including archived profiles."
        : "Choose an active faculty or HoD account in your department." });
      return record && user ? [record] : [];
    });
    return { kind, records };
  }

  const codes = rows.map(r => r.values[0]?.trim().toUpperCase()).filter((value): value is string => !!value);
  const where = { departmentId, code: { in: codes } }, select = { code: true };
  const existing = new Set((kind === "course" ? await tx.course.findMany({ where, select }) : await tx.room.findMany({ where, select })).map(r => r.code));
  const validate = <T extends { code: string }>(schema: z.ZodType<T>) => rows.flatMap(row => {
    const record = readRow(kind, row, schema, issues);
    if (!record) return [];
    rejectDuplicate(record.code, row.row, "code", seen, issues);
    if (existing.has(record.code)) issues.push({ row: row.row, column: "code", message: "This code already exists in your department, including archived records." });
    return [record];
  });
  return kind === "course" ? { kind, records: validate(dataSchemas.course) } : { kind, records: validate(dataSchemas.room) };
}

const conflictColumns: Record<string, string> = {
  RESOURCE: "courseCode", DAY: "weekday", SLOTS: "startTime", LAB: "roomCode",
  CAPACITY: "roomCode", QUALIFICATION: "courseCode", AVAILABILITY: "startTime",
  OVERLAP: "startTime", DAILY_LIMIT: "startTime", WEEKLY_LIMIT: "startTime",
};

export async function validateTimetableRows(tx: Tx, departmentId: string, semesterId: string, rows: CsvRow[], issues: CsvIssue[]) {
  const data = await schedulingData(tx, departmentId);
  const courses = new Map(data.courses.filter(c => !c.archived).map(c => [c.code, c]));
  const sections = new Map((await tx.section.findMany({
    where: { departmentId, semesterId, archived: false }, select: { code: true, id: true },
  })).map(s => [s.code, s]));
  const rooms = new Map(data.rooms.filter(r => !r.archived).map(r => [r.code, r]));
  const allocations = new Map(data.allocations.filter(a => a.semesterId === semesterId && !a.archived).map(a => [`${a.sectionId}/${a.courseId}`, a]));
  const entries = rows.flatMap(row => {
    const record = readRow("timetable", row, timetableRow, issues);
    if (!record) return [];
    const section = sections.get(record.sectionCode), course = courses.get(record.courseCode), room = rooms.get(record.roomCode);
    const allocation = section && course ? allocations.get(`${section.id}/${course.id}`) : undefined;
    if (!section) issues.push({ row: row.row, column: "sectionCode", message: "Unknown active section in the selected semester." });
    if (!course || (section && !allocation)) issues.push({ row: row.row, column: "courseCode", message: "Choose an active course allocated to this section." });
    if (!room) issues.push({ row: row.row, column: "roomCode", message: "Unknown active room in your department." });
    if (!allocation || !room) return [];
    return [{
      seriesId: String(row.row), allocationId: allocation.id, roomId: room.id, weekday: Number(record.weekday),
      startMinute: minutes(record.startTime), endMinute: minutes(record.endTime),
    }];
  });

  const reported = new Set<string>();
  for (const conflict of validatePlacements(entries, data)) {
    const key = `${conflict.seriesId}/${conflict.rule}`;
    if (reported.has(key)) continue;
    reported.add(key);
    issues.push({ row: Number(conflict.seriesId), column: conflictColumns[conflict.rule] ?? "startTime", message: conflict.message });
  }
  const periods = new Map<string, number>();
  const allowed = new Map(data.allocations.map(a => [a.id, a.weeklyPeriods]));
  for (const entry of entries) {
    const total = (periods.get(entry.allocationId) ?? 0) + slotSpan(entry, data);
    periods.set(entry.allocationId, total);
    if (total > allowed.get(entry.allocationId)!) issues.push({ row: Number(entry.seriesId), column: "courseCode", message: "This row exceeds the allocation's weekly period count." });
  }
  return entries;
}

export function placementKey(entry: Omit<Placement, "seriesId">) {
  return JSON.stringify([entry.allocationId, entry.weekday, entry.startMinute, entry.endMinute, entry.roomId]);
}
