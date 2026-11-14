import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { localDate, type Placement } from "@/domain/scheduling/timetable";
import type { CsvCommit, CsvFailure, CsvPreview, CsvRow } from "@/features/csv/config";
import { authConfig } from "@/server/auth/config";
import { requireScope } from "@/server/auth/permissions";
import { AccessError, actorSelect } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { CsvInputError, parseCsv } from "./csv-format";
import { placementKey, validateMasterRows, validateTimetableRows, type CsvMasterBatch } from "./csv-validation";
import { guardPublishedSchedule, ScheduleError, type Tx } from "./scheduling-store";

const roles = ["ADMIN", "COORDINATOR"] as const;
const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["faculty", "course", "room"]) }),
  z.object({ kind: z.literal("timetable"), semesterId: z.string().min(1).max(100), effectiveFrom: z.iso.date() }),
]);
const tokenSchema = z.object({ id: z.uuid(), signature: z.string().regex(/^[a-f0-9]{64}$/) });
type CsvInput = z.infer<typeof inputSchema>;
type PreviewSnapshot = { batch: CsvMasterBatch; revision: { id: string; scheduleRevision: number }[] }
  | { semester: { id: string; scheduleRevision: number; endDate: string }; entries: Placement[]; effectiveFrom: string };

async function manager(tx: Tx, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: actorSelect });
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  requireScope(actor, roles, actor.departmentId);
  return actor;
}

function signature(id: string, fingerprint: string, snapshot: unknown) {
  return createHmac("sha256", authConfig().secret)
    .update(JSON.stringify(["slotwise/csv-import/v1", id, fingerprint, snapshot])).digest();
}

function checkTimezone(timezone: string, input: CsvInput) {
  if (input.kind === "timetable" && timezone !== "Asia/Kolkata") {
    throw new ScheduleError("VALIDATION_ERROR", "This pilot currently supports Asia/Kolkata scheduling only.");
  }
}

async function inspect(tx: Tx, departmentId: string, input: CsvInput, parsed: ReturnType<typeof parseCsv>): Promise<{
  issues: NonNullable<CsvFailure["issues"]>; snapshot: PreviewSnapshot;
}> {
  const issues = [...parsed.issues];
  if (input.kind !== "timetable") {
    const batch = await validateMasterRows(tx, departmentId, input.kind, parsed.rows, issues);
    const revision = await tx.semester.findMany({ where: { departmentId }, orderBy: { id: "asc" }, select: { id: true, scheduleRevision: true } });
    return { issues, snapshot: { batch, revision } };
  }

  const semester = await tx.semester.findFirst({ where: { id: input.semesterId, departmentId, archived: false } });
  if (!semester) throw new AccessError("FORBIDDEN");
  if (input.effectiveFrom < localDate() || input.effectiveFrom < semester.startDate || input.effectiveFrom > semester.endDate) {
    throw new CsvInputError("VALIDATION_ERROR", "Choose a current or future effective date within the selected semester.");
  }
  const entries = await validateTimetableRows(tx, departmentId, semester.id, parsed.rows, issues);
  if (!issues.length) {
    const existing = await tx.timetableVersion.findMany({
      where: { departmentId, semesterId: semester.id, effectiveFrom: input.effectiveFrom, status: "DRAFT", baseScheduleRevision: semester.scheduleRevision },
      select: { entries: { select: { allocationId: true, roomId: true, weekday: true, startMinute: true, endMinute: true } } },
    });
    const keys = new Set(entries.map(placementKey));
    if (existing.some(draft => draft.entries.length === keys.size && draft.entries.every(entry => keys.has(placementKey(entry))))) {
      throw new CsvInputError("CONFLICT", "An identical draft already exists for this effective date. Open it in Timetable.");
    }
  }
  const previous = await tx.timetableVersion.findFirst({
    where: { departmentId, semesterId: semester.id, status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    select: { entries: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }, { seriesId: "asc" }],
      select: { allocationId: true, roomId: true, weekday: true, startMinute: true, endMinute: true, seriesId: true } } },
  });

  // Reserve exact matches before matching moved units by allocation and duration.
  const exact = new Map(previous?.entries.map(entry => [placementKey(entry), entry.seriesId]));
  const used = new Set(entries.flatMap(entry => exact.get(placementKey(entry)) ?? []));
  const available = previous?.entries.filter(entry => !used.has(entry.seriesId)) ?? [];
  const preserved = entries.map(entry => {
    const exactId = exact.get(placementKey(entry));
    if (exactId) return { ...entry, seriesId: exactId };
    const movedIndex = available.findIndex(old => old.allocationId === entry.allocationId
      && old.endMinute - old.startMinute === entry.endMinute - entry.startMinute);
    return { ...entry, seriesId: movedIndex < 0 ? "" : available.splice(movedIndex, 1)[0].seriesId };
  });
  const unmatchedAllocations = new Set(available.map(entry => entry.allocationId));
  for (const [index, entry] of preserved.entries()) {
    if (!entry.seriesId && unmatchedAllocations.has(entry.allocationId)) issues.push({
      row: Number(entries[index].seriesId), column: "endTime",
      message: "Keep the duration of an existing published teaching unit when moving it.",
    });
  }
  return { issues, snapshot: { semester, entries: preserved, effectiveFrom: input.effectiveFrom } };
}

async function lockUsers(tx: Tx, actorId: string, departmentId: string, input: CsvInput, rows: CsvRow[]) {
  // Account revocations use the same row locks. Take them before Department
  // and in ID order even when a manager is importing another account's profile.
  const users = input.kind === "faculty"
    ? await tx.user.findMany({ where: {
      departmentId, email: { in: rows.flatMap(row => row.values[0]?.trim().toLowerCase() || []) },
    }, select: { id: true } })
    : input.kind === "timetable"
      ? await tx.user.findMany({ where: { departmentId, faculty: { allocations: { some: {
        semesterId: input.semesterId, archived: false,
        section: { code: { in: rows.flatMap(row => row.values[0]?.trim().toUpperCase() || []) } },
        course: { code: { in: rows.flatMap(row => row.values[1]?.trim().toUpperCase() || []) } },
      } } } }, select: { id: true } })
      : [];
  const ids = [...new Set([actorId, ...users.map(user => user.id)])].sort();
  for (const id of ids) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR NO KEY UPDATE`;
  return ids;
}

function failure(error: unknown): CsvFailure {
  if (error instanceof AccessError) return { ok: false, code: error.code, message: "You do not have permission to import CSV for this department or semester." };
  if (error instanceof CsvInputError) return { ok: false, code: error.code, message: error.message, issues: error.issues };
  if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Check the import type, semester and effective date, then preview the file again." };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003"].includes(error.code)) {
    return { ok: false, code: "STALE_VERSION", message: "A code or related record changed. Preview the file again." };
  }
  console.error("CSV import failed", error instanceof Error ? error.name : "Unknown error");
  return { ok: false, code: "ERROR", message: "The request could not be confirmed. Retry with the same file." };
}

function fingerprintFor(actorId: string, departmentId: string, input: CsvInput, bytes: Uint8Array) {
  return createHash("sha256").update(JSON.stringify(["csv-import", actorId, departmentId, input])).update(bytes).digest("hex");
}

export async function previewCsv(actorId: string | null, raw: unknown, bytes: Uint8Array): Promise<CsvPreview | CsvFailure> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const input = inputSchema.parse(raw);
    return await getDb().$transaction(async tx => {
      const actor = await manager(tx, actorId);
      checkTimezone(actor.department.timezone, input);
      const parsed = parseCsv(input.kind, bytes);
      const { issues, snapshot } = await inspect(tx, actor.departmentId, input, parsed);
      const id = randomUUID(), fingerprint = fingerprintFor(actorId, actor.departmentId, input, bytes);
      return {
        ok: true, kind: input.kind, rows: parsed.rows,
        issues: issues.sort((a, b) => a.row - b.row),
        token: issues.length ? null : { id, signature: signature(id, fingerprint, snapshot).toString("hex") },
      };
    }, { isolationLevel: "RepeatableRead" });
  } catch (error) {
    return failure(error);
  }
}

export async function commitCsv(actorId: string | null, raw: unknown, bytes: Uint8Array, rawToken: unknown): Promise<CsvCommit | CsvFailure> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const input = inputSchema.parse(raw), token = tokenSchema.parse(rawToken);
    return await getDb().$transaction(async tx => {
      const initial = await manager(tx, actorId);
      const parsed = parseCsv(input.kind, bytes);
      const lockedUsers = await lockUsers(tx, actorId, initial.departmentId, input, parsed.rows);
      const { departmentId, department } = await manager(tx, actorId);
      if (departmentId !== initial.departmentId) throw new AccessError("FORBIDDEN");
      checkTimezone(department.timezone, input);
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;

      const fingerprint = fingerprintFor(actorId, departmentId, input, bytes);
      const receiptFingerprint = createHash("sha256").update(fingerprint).update(token.signature).digest("hex");
      const receipt = await tx.mutationReceipt.findUnique({ where: { id: token.id } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== departmentId) throw new AccessError("FORBIDDEN");
        if (receipt.fingerprint !== receiptFingerprint) throw new CsvInputError("CONFLICT", "This preview was used with different input. Preview the file again.");
        return receipt.result as unknown as CsvCommit;
      }

      const { issues, snapshot } = await inspect(tx, departmentId, input, parsed);
      if (issues.length) throw new CsvInputError("VALIDATION_ERROR", "The file no longer passes validation. Fix these rows and preview again.", issues.sort((a, b) => a.row - b.row));
      if (!timingSafeEqual(signature(token.id, fingerprint, snapshot), Buffer.from(token.signature, "hex"))) {
        throw new CsvInputError("STALE_VERSION", "The file or department records changed. Preview the file again.");
      }

      const count = parsed.rows.length;
      let result: CsvCommit;
      if ("batch" in snapshot) {
        const { batch } = snapshot;
        if (batch.kind === "faculty" && batch.records.some(record => !lockedUsers.includes(record.userId))) {
          throw new CsvInputError("STALE_VERSION", "A related account changed. Preview the file again.");
        }
        const select = { id: true };
        const records = batch.kind === "faculty"
          ? await tx.faculty.createManyAndReturn({ data: batch.records.map(data => ({ ...data, departmentId })), select })
          : batch.kind === "course"
            ? await tx.course.createManyAndReturn({ data: batch.records.map(data => ({ ...data, departmentId })), select })
            : await tx.room.createManyAndReturn({ data: batch.records.map(data => ({ ...data, departmentId })), select });
        await guardPublishedSchedule(tx, departmentId);
        await tx.semester.updateMany({ where: { departmentId }, data: { scheduleRevision: { increment: 1 } } });
        await tx.auditEvent.create({ data: { departmentId, actorId, action: "CSV_MASTER_IMPORTED", entityId: token.id,
          before: {}, after: { kind: batch.kind, count, recordIds: records.map(record => record.id) } } });
        result = { ok: true, count };
      } else {
        const { semester, effectiveFrom } = snapshot;
        const allocationIds = [...new Set(snapshot.entries.map(entry => entry.allocationId))];
        const teachers = await tx.faculty.findMany({
          where: { departmentId, allocations: { some: { id: { in: allocationIds } } } }, select: { userId: true },
        });
        if (teachers.some(teacher => !lockedUsers.includes(teacher.userId))) {
          throw new CsvInputError("STALE_VERSION", "A related account changed. Preview the file again.");
        }
        const draft = await tx.timetableVersion.create({
          data: { departmentId, semesterId: semester.id, effectiveFrom, effectiveTo: semester.endDate, baseScheduleRevision: semester.scheduleRevision },
        });
        const entries = snapshot.entries.map(entry => ({ ...entry, seriesId: entry.seriesId || randomUUID() }));
        await tx.timetableEntry.createMany({ data: entries.map(entry => ({ ...entry, departmentId, timetableVersionId: draft.id })) });
        await tx.auditEvent.create({ data: { departmentId, actorId, action: "TIMETABLE_DRAFT_CREATED", entityId: draft.id, before: {},
          after: { status: draft.status, version: draft.version, semesterId: semester.id, effectiveFrom, revision: semester.scheduleRevision, entries, source: "CSV" } } });
        result = { ok: true, count, semesterId: semester.id, draftId: draft.id };
      }
      await tx.mutationReceipt.create({ data: { id: token.id, actorId, departmentId, fingerprint: receiptFingerprint, result } });
      return result;
    });
  } catch (error) {
    return failure(error);
  }
}
