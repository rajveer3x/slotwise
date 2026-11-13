import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { AccessError, actorSelect, requireSession, sessionIdentity } from "@/server/auth/session";
import { requireScope } from "@/server/auth/permissions";
import { config, kinds, type Kind, type MasterRow, type MasterSnapshot } from "@/features/master-data/config";
import { dataSchemas, mutationSchema, type MasterResult } from "@/features/master-data/schema";
import { guardPublishedSchedule, ScheduleError } from "./scheduling-store";

type Tx = Prisma.TransactionClient;
// Every delegate here has the same scoped record envelope. Specific data is
// parsed by its own Zod schema before it reaches this small repository adapter.
type Repository = {
  findMany(args: { where: Record<string, unknown>; orderBy?: Record<string, string> }): Promise<MasterRow[]>;
  findFirst(args: { where: Record<string, unknown> }): Promise<MasterRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<MasterRow>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<MasterRow>;
};
function repo(tx: Tx, kind: Kind) { return tx[kind] as unknown as Repository; }
class DataError extends Error {
  constructor(public code: string, message: string, public field?: string) { super(message); }
}
function invalid(field: string, message: string): never { throw new DataError("VALIDATION_ERROR", message, field); }
async function actorFor(tx: Tx, actorId: string | null) {
  if (!actorId) throw new AccessError("UNAUTHORIZED");
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: actorSelect });
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  requireScope(actor, ["ADMIN", "COORDINATOR"], actor.departmentId);
  return actor;
}
export async function listMasterData() {
  const actor = await requireSession();
  return readMasterData(actor.id);
}
// Internal entry points accept only server-resolved identities, never form IDs.
export async function readMasterData(actorId: string | null): Promise<MasterSnapshot> {
  return getDb().$transaction(async tx => {
    const actor = await actorFor(tx, actorId);
    const records = {} as MasterSnapshot["records"];
    for (const kind of kinds) records[kind] = await repo(tx, kind).findMany({ where: { departmentId: actor.departmentId }, orderBy: { id: "asc" } });
    const users = await tx.user.findMany({ where: { departmentId: actor.departmentId }, select: { id: true, name: true, role: true, active: true }, orderBy: { name: "asc" } });
    return { records, users };
  }, { isolationLevel: "RepeatableRead" });
}
export async function readMasterRecord(actorId: string | null, kind: Kind, id: string) {
  const actor = await actorFor(getDb(), actorId);
  const record = await repo(getDb(), kind).findFirst({ where: { id, departmentId: actor.departmentId } });
  if (!record) throw new AccessError("FORBIDDEN");
  return record;
}
async function validateRelations(tx: Tx, kind: Kind, data: Record<string, unknown>, departmentId: string, existing?: MasterRow | null) {
  for (const field of config[kind].fields) {
    if (existing && field.immutable && data[field.key] !== existing[field.key]) invalid(field.key, "This relationship is fixed. Archive this record and create a replacement.");
    if (!field.ref) continue;
    const id = String(data[field.key]);
    if (field.ref === "facultyUser" || field.ref === "studentUser") {
      const user = await tx.user.findFirst({ where: { id, departmentId, active: true, role: { in: field.ref === "facultyUser" ? ["FACULTY", "HOD"] : ["STUDENT"] } } });
      if (!user) invalid(field.key, "Choose an active account with the correct role in your department.");
    } else {
      const parent = await repo(tx, field.ref).findFirst({ where: { id, departmentId, archived: false } });
      if (!parent) invalid(field.key, "Choose an unarchived record in your department.");
    }
  }
  if (kind === "semester") {
    if (data.active) {
      const other = await tx.semester.findFirst({ where: { departmentId, active: true, archived: false, id: { not: existing?.id ?? "" } } });
      if (other) invalid("active", "Deactivate the current semester first; only one may be active.");
    }
    if (existing) {
      const outside = await tx.holiday.findFirst({ where: { semesterId: existing.id, archived: false, OR: [{ date: { lt: String(data.startDate) } }, { date: { gt: String(data.endDate) } }] } });
      if (outside) invalid("endDate", "These boundaries exclude an existing holiday. Adjust or archive the holiday first.");
    }
  }
  if (kind === "holiday") {
    const semester = await tx.semester.findUniqueOrThrow({ where: { id: String(data.semesterId) } });
    if (String(data.date) < semester.startDate || String(data.date) > semester.endDate) invalid("date", "Holiday must be within the semester dates (inclusive).");
  }
  if (kind === "courseAllocation") {
    const section = await tx.section.findUniqueOrThrow({ where: { id: String(data.sectionId) } });
    if (section.semesterId !== data.semesterId) invalid("sectionId", "Section must belong to the selected semester.");
    const qualification = await tx.facultyQualification.findFirst({ where: { departmentId, facultyId: String(data.facultyId), courseId: String(data.courseId), archived: false } });
    if (!qualification) invalid("facultyId", "Faculty must have an explicit, unarchived qualification for this course.");
    const faculty = await tx.faculty.findUniqueOrThrow({ where: { id: String(data.facultyId) }, include: { user: true } });
    if (!faculty.user.active || !["FACULTY", "HOD"].includes(faculty.user.role)) invalid("facultyId", "Faculty account must be active with a faculty or HoD role.");
  }
  if (kind === "sectionMembership") {
    const section = await tx.section.findUniqueOrThrow({ where: { id: String(data.sectionId) } });
    const memberships = await tx.sectionMembership.findMany({ where: { departmentId, userId: String(data.userId), archived: false, id: { not: existing?.id ?? "" } }, include: { section: true } });
    if (memberships.some(m => m.section.semesterId === section.semesterId)) invalid("userId", "A student may belong to only one section per semester.");
  }
  if (kind === "facultyAvailability" || kind === "timeSlot") {
    const intervals = await repo(tx, kind).findMany({ where: { departmentId, archived: false, weekday: data.weekday, ...(kind === "facultyAvailability" ? { facultyId: data.facultyId } : {}) } });
    if (intervals.some(v => v.id !== existing?.id && Number(v.startMinute) < Number(data.endMinute) && Number(data.startMinute) < Number(v.endMinute))) invalid("startMinute", "This interval overlaps another active interval. Consecutive intervals are allowed.");
  }
}
export async function mutateMasterData(input: unknown) { return changeMasterData(await sessionIdentity(), input); }
export async function changeMasterData(actorId: string | null, input: unknown): Promise<MasterResult> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const mutation = mutationSchema.parse(input);
    const data = mutation.operation === "save" ? dataSchemas[mutation.kind].parse(mutation.data) : {};
    const fingerprint = createHash("sha256").update(JSON.stringify({ ...mutation, data })).digest("hex");
    return await getDb().$transaction(async tx => {
      // Account changes use the same actor lock; department lock serializes all
      // master-data relationships, uniqueness decisions, receipts and revisions.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await actorFor(tx, actorId);
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${actor.departmentId} FOR UPDATE`;
      const receipt = await tx.masterMutationReceipt.findUnique({ where: { id: mutation.requestId } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== actor.departmentId || receipt.fingerprint !== fingerprint) throw new DataError("CONFLICT", "This request ID was already used for a different change. Refresh before trying again.");
        return { ok: true, message: "Change already saved.", recordId: receipt.recordId };
      }
      const repository = repo(tx, mutation.kind);
      const existing = mutation.id ? await repository.findFirst({ where: { id: mutation.id, departmentId: actor.departmentId } }) : null;
      if (mutation.id && !existing) throw new AccessError("FORBIDDEN");
      if (existing && existing.version !== mutation.expectedVersion) throw new DataError("STALE_VERSION", "This record changed. Your input is retained. Refresh the page to load its current version before trying again.");
      if (existing?.archived && mutation.operation === "save") throw new DataError("CONFLICT", "Restore the archived record before editing it.");
      if (mutation.operation === "save" || mutation.operation === "restore") await validateRelations(tx, mutation.kind, mutation.operation === "restore" ? existing! : data, actor.departmentId, existing);
      const row = existing
        ? await repository.update({ where: { id: existing.id }, data: { ...(mutation.operation === "save" ? data : { archived: mutation.operation === "archive" }), ...(mutation.operation === "archive" && mutation.kind === "semester" ? { active: false } : {}), version: { increment: 1 } } })
        : await repository.create({ data: { ...data, departmentId: actor.departmentId } });
      await guardPublishedSchedule(tx, actor.departmentId);
      await tx.semester.updateMany({ where: { departmentId: actor.departmentId }, data: { scheduleRevision: { increment: 1 } } });
      await tx.masterMutationReceipt.create({ data: { id: mutation.requestId, actorId, departmentId: actor.departmentId, fingerprint, recordId: row.id } });
      return { ok: true, message: mutation.operation === "archive" ? "Archived. References and history are preserved; this record cannot be selected for new work." : mutation.operation === "restore" ? "Record restored." : "Saved successfully.", recordId: row.id };
    });
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, code: error.code, message: error.code === "UNAUTHORIZED" ? "Your session is no longer active. Sign in again." : "You do not have permission to access this department's record." };
    if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
    if (error instanceof DataError) return { ok: false, code: error.code, message: error.message, ...(error.field ? { fieldErrors: { [error.field]: [error.message] } } : {}) };
    if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, code: "CONFLICT", message: "A record with this code, account or relationship already exists, including archived records. Edit or restore it instead.", fieldErrors: { [error.meta?.target && Array.isArray(error.meta.target) ? String(error.meta.target.filter(k => k !== "departmentId")[0] ?? "code") : "code"]: ["Already in use in this department."] } };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return { ok: false, code: "VALIDATION_ERROR", message: "A related record is unavailable. Refresh and choose a record in your department." };
    console.error("Master data mutation failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, code: "ERROR", message: "Could not save the change. Your input is retained. Please try again." };
  }
}
