import "server-only";
import { AccessError, actorSelect } from "@/server/auth/session";
import { requireScope } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { Role } from "@/generated/prisma/enums";
import { addDays, localDate, weekOf } from "@/domain/scheduling/timetable";
import { recoveryMetrics, workloadMetrics } from "@/domain/workload/metrics";
import { recoveryFilter, workloadFilter } from "@/features/insights/filters";
import type { Tx } from "./scheduling-store";

const departmentRoles: Role[] = ["ADMIN", "COORDINATOR", "HOD"];

async function insightActor(tx: Tx, actorId: string | null, requestedDepartment: unknown, roles: Role[]) {
  const actor = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: actorSelect }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  const { departmentId } = actor;
  requireScope(actor, roles, typeof requestedDepartment === "string" ? requestedDepartment : departmentId);
  const demo = departmentId === "demo-computing" || departmentId === "demo-design" ||
    /\bsynthetic\b/i.test(actor.department.name);
  return { actor, departmentId, demo };
}

export async function readWorkload(actorId: string | null, input: { department?: unknown; week?: unknown } = {}) {
  return getDb().$transaction(async tx => {
    const { actor, departmentId, demo } = await insightActor(tx, actorId, input.department, [...departmentRoles, "FACULTY"]);
    const parsed = workloadFilter.safeParse(input);
    const now = new Date();
    // Start on the current week, or the nearest week in the latest semester.
    const semester = !parsed.data?.week ? await tx.semester.findFirst({
      where: { departmentId, archived: false },
      orderBy: [{ active: "desc" }, { startDate: "desc" }, { id: "asc" }],
      select: { startDate: true, endDate: true },
    }) : null;
    const today = localDate(now);
    const defaultDate = semester ? [semester.startDate, today, semester.endDate].sort()[1] : today;
    const selectedDate = parsed.data?.week ?? defaultDate;
    const start = weekOf(selectedDate);
    const end = addDays(start, 6);
    const scope = { demo, start, end, selectedDate, refreshedAt: now.toISOString() };
    if (!parsed.success) return { ...scope, data: null, error: "Choose a valid date for the teaching week." };

    const own = actor.role === "FACULTY";
    const occurrenceScope = {
      departmentId,
      localDate: { gte: start, lte: end },
      entry: { timetableVersion: { status: "PUBLISHED" as const } },
      ...(own ? { faculty: { userId: actor.id, archived: false } } : {}),
    };
    const planned = await tx.classOccurrence.findMany({
      where: { ...occurrenceScope, schedulingStatus: "ACTIVE" },
      select: { facultyId: true, startAt: true, endAt: true },
    });
    const delivered = await tx.deliveryRecord.findMany({
      where: { departmentId, current: true, status: "HELD", occurrence: occurrenceScope },
      select: { confirmedMinutes: true, occurrence: { select: { facultyId: true, resolutionTier: true } } },
    });
    const assignedIds = [...new Set([...planned.map(o => o.facultyId), ...delivered.map(r => r.occurrence.facultyId)])];
    const faculty = await tx.faculty.findMany({
      where: {
        departmentId,
        ...(own ? { userId: actor.id, archived: false } : { OR: [
          { archived: false, user: { active: true } }, { id: { in: assignedIds } },
        ] }),
      },
      select: { id: true, targetMinutesPerWeek: true, user: { select: { name: true } } },
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
    });
    const rows = workloadMetrics(faculty.map(f => ({ id: f.id, name: f.user.name, targetMinutesPerWeek: f.targetMinutesPerWeek })), planned, delivered);
    return { ...scope, error: undefined, data: { own, rows, plannedClasses: planned.length, deliveredClasses: delivered.length } };
  }, { isolationLevel: "RepeatableRead" });
}

export async function readLeaveRecovery(actorId: string | null, input: { department?: unknown; from?: unknown; to?: unknown } = {}) {
  return getDb().$transaction(async tx => {
    const { departmentId, demo } = await insightActor(tx, actorId, input.department, departmentRoles);
    const parsed = recoveryFilter.safeParse(input);
    const now = new Date();
    const today = localDate(now);
    const semester = await tx.semester.findFirst({
      where: { departmentId, archived: false },
      orderBy: [{ active: "desc" }, { startDate: "desc" }, { id: "asc" }],
      select: { startDate: true, endDate: true },
    });
    const from = parsed.data?.from ?? semester?.startDate ?? weekOf(today);
    const to = parsed.data?.to ?? semester?.endDate ?? addDays(weekOf(today), 6);
    const scope = { demo, from, to, refreshedAt: now.toISOString() };
    if (!parsed.success || from > to) {
      return { ...scope, data: null, error: "Choose valid dates with the start on or before the end." };
    }

    // Filter the cohort by the affected class date. Read its recovery across
    // the whole replacement history, since the replacement may land later.
    const obligations = await tx.teachingObligation.findMany({
      where: { departmentId, occurrences: { some: {
        departmentId, localDate: { gte: from, lte: to }, leaveRequest: { status: "APPROVED" },
      } } },
      select: { occurrences: {
        where: {
          departmentId, publicationId: { not: null },
          OR: [{ schedulingStatus: "ACTIVE" }, { deliveryRecords: { some: { current: true, status: "HELD" } } }],
        },
        select: {
          localDate: true, schedulingStatus: true,
          deliveryRecords: { where: { current: true, status: "HELD" }, select: { id: true } },
        },
      } },
    });
    return { ...scope, error: undefined, data: recoveryMetrics(obligations) };
  }, { isolationLevel: "RepeatableRead" });
}
