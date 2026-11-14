import "server-only";
import { z } from "zod";
import { clockTime } from "@/domain/scheduling/timetable";
import { csvTemplates, type CsvKind } from "@/features/csv/config";
import { requireScope } from "@/server/auth/permissions";
import { AccessError, actorSelect } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { renderCsv } from "./csv-format";
import { occurrenceMinutes } from "./scheduling-store";

export function downloadTemplate(kind: CsvKind) {
  const { headers, example } = csvTemplates[kind];
  return renderCsv([headers, example]);
}

export async function exportTimetableCsv(actorId: string | null, semesterId: string) {
  return getDb().$transaction(async tx => {
    const actor = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: actorSelect }) : null;
    if (!actor?.active) throw new AccessError("UNAUTHORIZED");
    const { departmentId } = actor;
    requireScope(actor, ["ADMIN", "COORDINATOR"], departmentId);
    if (!z.string().min(1).max(100).safeParse(semesterId).success) throw new AccessError("FORBIDDEN");
    const semester = await tx.semester.findFirst({ where: { id: semesterId, departmentId, archived: false }, select: { id: true } });
    if (!semester) throw new AccessError("FORBIDDEN");
    const rows = await tx.classOccurrence.findMany({
      where: { departmentId, entry: { timetableVersion: { semesterId: semester.id, status: "PUBLISHED" } }, schedulingStatus: "ACTIVE" },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: { localDate: true, startAt: true, endAt: true, deliveryStatus: true,
        teachingObligation: { select: { allocation: { select: { course: { select: { code: true, name: true } } } } } },
        section: { select: { code: true } }, room: { select: { code: true } },
        faculty: { select: { user: { select: { name: true } } } },
      },
    });
    // Convert timestamps using the same institution-local clock as Timetable.
    return renderCsv([
      ["date", "startTime", "endTime", "sectionCode", "courseCode", "courseName", "facultyName", "roomCode", "deliveryStatus"],
      ...rows.map(row => {
        const { startMinute, endMinute } = occurrenceMinutes(row);
        const { course } = row.teachingObligation.allocation;
        return [row.localDate, clockTime(startMinute), clockTime(endMinute), row.section.code,
          course.code, course.name, row.faculty.user.name, row.room?.code ?? "Online", row.deliveryStatus];
      }),
    ]);
  }, { isolationLevel: "RepeatableRead" });
}
