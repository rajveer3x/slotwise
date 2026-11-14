import "server-only";
import { z } from "zod";
import { instant } from "@/domain/scheduling/timetable";
import type { Prisma } from "@/generated/prisma/client";
import { requireScope } from "@/server/auth/permissions";
import { AccessError } from "@/server/auth/session";
import { getDb } from "@/server/db";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const date = z.iso.date().refine(value => value >= "0001-01-01" && value <= "9999-12-31");
const integer = z.number().int().nonnegative();
const revision = { revision: integer };
const version = { version: integer };
const status = z.enum(["NONE", "DRAFT", "PUBLISHED", "SUBMITTED", "APPROVED", "REJECTED", "WITHDRAWN",
  "PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED", "ACTIVE", "HELD", "NOT_HELD"]);
const schedule = { facultyId: id.optional(), allocationId: id, sectionId: id.optional(), roomId: id.nullable(),
  startMinute: integer, endMinute: integer };
const placement = z.object({ ...schedule, seriesId: id, weekday: z.number().int().min(1).max(5) });
const assignment = z.object({ ...schedule, occurrenceId: id, obligationId: id, date,
  tier: z.number().int().min(1).max(5).optional(), schedulingStatus: status.optional() });
const timetable = { ...version, ...revision, semesterId: id, effectiveFrom: date, status,
  entries: z.array(placement), occurrences: integer, occurrenceIds: z.array(id),
  generation: z.object({
    status: z.enum(["finished", "timeout", "cancelled", "work-limit"]),
    seed: integer, placed: integer, required: integer, work: integer, runtimeMs: integer,
    fixedCount: integer, inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    quality: z.object({ sameDayPairs: integer, theoryInLab: integer }),
    policy: z.object({
      version: z.literal("weekly-v1"), timeoutMs: integer, workLimit: integer, improvementLimit: integer,
      maxAllocations: integer, maxPeriods: integer, maxSlots: integer, maxRooms: integer, maxRelatedRecords: integer,
    }),
  }),
};
const leave = { ...version, ...revision, status, facultyId: id, startDate: date, endDate: date, cancelledOccurrenceIds: z.array(id) };
const consent = { status };
const exception = { ...consent, reason: z.string().max(1000) };
const delivery = { status, recordId: id.nullable(), obligationId: id, minutes: integer, schedulingStatus: status, reason: z.string().max(1000) };
const publication = { ...revision, changes: z.array(assignment), unresolvedIds: z.array(id) };

// Stored JSON is never rendered directly. Each action gets its own approved fields,
// including at nested levels. Staff-entered audit reasons are approved only here.
const actions = {
  TIMETABLE_DRAFT_CREATED: ["Timetable draft created", timetable],
  TIMETABLE_DRAFT_SAVED: ["Timetable draft saved", timetable],
  TIMETABLE_PUBLISHED: ["Timetable published", timetable],
  LEAVE_SUBMITTED: ["Leave submitted", leave],
  LEAVE_WITHDRAWN: ["Leave withdrawn", leave],
  LEAVE_APPROVED: ["Leave approved", leave],
  LEAVE_REJECTED: ["Leave rejected", leave],
  RESOLUTION_DRAFT_SAVED: ["Recovery draft saved", { ...version, ...revision, selected: integer }],
  RESOLUTION_PUBLISHED: ["Recovery published", publication],
  COVER_INVITED: ["Cover invited", consent],
  COVER_ACCEPTED: ["Cover accepted", consent],
  COVER_DECLINED: ["Cover declined", consent],
  COVER_CANCELLED: ["Cover cancelled", consent],
  COVER_EXPIRED: ["Cover expired", consent],
  COVER_INVALIDATED: ["Cover invalidated", consent],
  COVER_COMPETING_CANCELLED: ["Competing cover cancelled", consent],
  SATURDAY_REQUESTED: ["Saturday requested", exception],
  SATURDAY_APPROVED: ["Saturday approved", exception],
  SATURDAY_REJECTED: ["Saturday rejected", exception],
  EXCEPTION_INVALIDATED: ["Saturday exception invalidated", consent],
  DELIVERY_CONFIRMED: ["Delivery confirmed", delivery],
  DELIVERY_CORRECTED: ["Delivery corrected", delivery],
} as const satisfies Record<string, readonly [string, z.ZodRawShape]>;

export const auditActions = Object.entries(actions).map(([value, [label]]) => ({ value, label }));
function definition(action: string) {
  return Object.hasOwn(actions, action) ? actions[action as keyof typeof actions] : undefined;
}
function safeDetails(action: string, data: Prisma.JsonValue) {
  const fields = definition(action)?.[1];
  if (!fields) return {};
  // A malformed historical field must not hide other valid fields in the event.
  const input = z.object({}).passthrough().safeParse(data);
  if (!input.success) return {};
  return Object.fromEntries(Object.entries(fields).flatMap(([key, schema]) => {
    const value = schema.safeParse(input.data[key]);
    return value.success ? [[key, value.data]] : [];
  })) as Record<string, SafeValue>;
}
export type SafeValue = string | number | null | SafeValue[] | { [key: string]: SafeValue };
const querySchema = z.object({
  department: id.optional(),
  actor: z.union([id, z.literal("")]).optional(),
  action: z.union([z.string().refine(value => !!definition(value)), z.literal("")]).optional(),
  entity: z.union([id, z.literal("")]).optional(),
  from: z.union([date, z.literal("")]).optional(),
  to: z.union([date, z.literal("")]).optional(),
  event: id.optional(),
  page: z.string().regex(/^[1-9]\d{0,8}$/).optional(),
}).strict();

const eventSelect = { id: true, actorId: true, action: true, entityId: true, createdAt: true } as const;
export async function readAudit(actorId: string | null, input: unknown) {
  return getDb().$transaction(async tx => {
    const actor = actorId ? await tx.user.findUnique({
      where: { id: actorId }, select: { departmentId: true, active: true, role: true },
    }) : null;
    if (!actor?.active) throw new AccessError("UNAUTHORIZED");
    const requestedDepartment = z.object({ department: z.string().optional() }).safeParse(input).data?.department;
    requireScope(actor, ["ADMIN", "COORDINATOR", "HOD"], requestedDepartment ?? actor.departmentId);
    const { departmentId } = actor;
    const parsed = querySchema.safeParse(input);
    const filters = parsed.data ?? {};
    const { actor: filterActor, action, entity, from, to, event, page } = filters;
    const error = !parsed.success ? "Choose valid audit filters." : from && to && from > to
      ? "End date must be on or after start date." : null;
    // The same department predicate applies to direct detail links and list queries.
    const detail = event ? await tx.auditEvent.findFirst({
      where: { id: event, departmentId }, select: { ...eventSelect, before: true, after: true },
    }) : null;
    if (event && !detail) throw new AccessError("FORBIDDEN");
    const actorGroups = await tx.auditEvent.groupBy({ by: ["actorId"], where: { departmentId } });
    const actorIds = actorGroups.map(group => group.actorId);
    const users = await tx.user.findMany({
      where: { departmentId, id: { in: actorIds } }, select: { id: true, name: true },
    });
    const names = new Map(users.map(user => [user.id, user.name]));
    const actors = actorIds.map(id => ({ id, name: names.get(id) ?? "Historical account" }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const where: Prisma.AuditEventWhereInput = {
      departmentId, actorId: filterActor || undefined, action: action || undefined, entityId: entity || undefined,
      createdAt: from || to ? {
        gte: from ? instant(from, 0) : undefined, lt: to ? instant(to, 1440) : undefined,
      } : undefined,
    };
    const pageSize = 25;
    const total = error ? 0 : await tx.auditEvent.count({ where });
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(Number(page ?? 1), pages);
    const rows = error || !total ? [] : await tx.auditEvent.findMany({
      where, select: eventSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (currentPage - 1) * pageSize, take: pageSize,
    });
    function summary(row: typeof rows[number]) {
      return { id: row.id, actorId: row.actorId, actor: names.get(row.actorId) ?? "Historical account",
        action: definition(row.action)?.[0] ?? "Other historical action", entityId: row.entityId, createdAt: row.createdAt.toISOString() };
    }
    return { actors, filters, error, total, page: currentPage, pages, rows: rows.map(summary),
      detail: detail ? { ...summary(detail), before: safeDetails(detail.action, detail.before), after: safeDetails(detail.action, detail.after) } : null };
  }, { isolationLevel: "RepeatableRead" });
}
