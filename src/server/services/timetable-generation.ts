import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { authConfig } from "@/server/auth/config";
import { requireScope } from "@/server/auth/permissions";
import { AccessError, actorSelect } from "@/server/auth/session";
import { generateWeekly, generationPolicy } from "@/domain/scheduling/generation";
import { localDate, placementConflicts, slotSpan, type Placement } from "@/domain/scheduling/timetable";
import { generationRequest, importRequest, type GenerationRequest, type GenerationResponse } from "@/features/timetable/generation-schema";
import type { ScheduleResult } from "@/features/timetable/schema";
import { schedulingData, ScheduleError, type Tx } from "./scheduling-store";

const roles = ["ADMIN", "COORDINATOR"] as const;
const stale = () => new ScheduleError("STALE_VERSION", "The schedule or teaching records changed. Refresh the semester and generate again.");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sign = (value: string) => createHmac("sha256", authConfig().secret).update("slotwise/timetable-generation/v1:").update(value).digest();

type Run = {
  actorId: string;
  departmentId: string;
  request: GenerationRequest;
  inputHash: string;
  policy: typeof generationPolicy;
  entries: Placement[];
  metadata: Pick<Awaited<ReturnType<typeof generateWeekly>>, "status" | "placed" | "required" | "quality" | "work" | "runtimeMs">;
};

function encode(run: Run) {
  const value = Buffer.from(JSON.stringify(run)).toString("base64url");
  return `${value}.${sign(value).toString("base64url")}`;
}

function decode(token: string): Run {
  const [value, mac, extra] = token.split(".");
  const signature = Buffer.from(mac ?? "", "base64url");
  if (!value || extra !== undefined || signature.length !== 32 || !timingSafeEqual(signature, sign(value))) {
    throw new ScheduleError("VALIDATION_ERROR", "This proposal could not be verified. Generate a new proposal.");
  }
  return JSON.parse(Buffer.from(value, "base64url").toString()) as Run;
}

async function manager(tx: Tx, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: actorSelect });
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  requireScope(actor, roles, actor.departmentId);
  if (actor.department.timezone !== "Asia/Kolkata") throw new ScheduleError("VALIDATION_ERROR", "This pilot currently supports Asia/Kolkata scheduling only.");
  return actor;
}

async function snapshot(tx: Tx, departmentId: string, request: GenerationRequest) {
  const semester = await tx.semester.findFirst({ where: { id: request.semesterId, departmentId, archived: false } });
  if (!semester) throw new AccessError("FORBIDDEN");
  if (semester.scheduleRevision !== request.expectedRevision) throw stale();
  if (request.effectiveFrom < localDate() || request.effectiveFrom < semester.startDate || request.effectiveFrom > semester.endDate) {
    throw new ScheduleError("VALIDATION_ERROR", "Choose a current or future effective date within the semester.");
  }
  const limits = generationPolicy;
  const data = await schedulingData(tx, departmentId, { semesterId: semester.id, take: limits.maxRelatedRecords + 1 });
  const previous = await tx.timetableVersion.findFirst({
    where: { departmentId, semesterId: semester.id, status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    select: { entries: { orderBy: { seriesId: "asc" }, take: limits.maxPeriods + 1,
      select: { seriesId: true, allocationId: true, roomId: true, weekday: true, startMinute: true, endMinute: true } } },
  });
  const fixed = previous?.entries ?? [];
  if (!data.allocations.length) throw new ScheduleError("EMPTY", "No active allocations are configured for this semester. Add allocations in Master data.");
  const required = data.allocations.reduce((sum, a) => sum + a.weeklyPeriods, 0);
  if (required > limits.maxPeriods || data.allocations.length > limits.maxAllocations || data.slots.length > limits.maxSlots
    || data.rooms.length > limits.maxRooms || fixed.length > limits.maxPeriods
    || Object.values(data).some(rows => rows.length > limits.maxRelatedRecords)) {
    throw new ScheduleError("VALIDATION_ERROR", "This semester exceeds the generator’s input limits. Use the manual timetable editor.");
  }
  if (fixed.some(p => !data.allocations.some(a => a.id === p.allocationId))) {
    throw new ScheduleError("CONFLICT", "The published template contains a unit outside the current allocation scope. Review it in the manual editor.");
  }
  // Validate the baseline before the engine may keep it as a partial result.
  // Stop at the first invalid unit to keep the validation response bounded.
  const fixedPeriods = new Map<string, number>();
  for (const [index, p] of fixed.entries()) {
    if (placementConflicts(p, fixed.slice(0, index), data).length) {
      throw new ScheduleError("CONFLICT", "The published template no longer meets weekly rules. Review it in the manual editor.");
    }
    fixedPeriods.set(p.allocationId, (fixedPeriods.get(p.allocationId) ?? 0) + slotSpan(p, data));
  }
  if (data.allocations.some(a => (fixedPeriods.get(a.id) ?? 0) > a.weeklyPeriods)) {
    throw new ScheduleError("CONFLICT", "The published template exceeds a current weekly allocation. Review it in the manual editor.");
  }
  const ordered = Object.values(data).map(rows => rows.map(row => JSON.stringify(row)).sort());
  return { data, fixed, semester, inputHash: digest({ ordered, fixed, request }) };
}

function failure(error: unknown) {
  if (error instanceof ScheduleError) return { ok: false as const, code: error.code, message: error.message };
  if (error instanceof AccessError) return { ok: false as const, code: error.code, message: "You do not have permission to generate drafts for this semester." };
  if (error instanceof z.ZodError) return { ok: false as const, code: "VALIDATION_ERROR", message: "Check the semester, effective date and whole-number seed." };
  console.error("Timetable generation failed", error instanceof Error ? error.name : "Unknown error");
  return { ok: false as const, code: "ERROR", message: "The request could not be confirmed. Retry with your input retained." };
}

export async function runGeneration(actorId: string | null, input: unknown, signal?: AbortSignal): Promise<GenerationResponse> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const request = generationRequest.parse(input);
    const { actor, data, fixed, inputHash } = await getDb().$transaction(async tx => {
      const actor = await manager(tx, actorId);
      return { actor, ...await snapshot(tx, actor.departmentId, request) };
    }, { isolationLevel: "RepeatableRead" });
    const { entries, coverage, ...metadata } = await generateWeekly(data, request.semesterId, fixed, request.seed, {
      now: () => performance.now(), signal, pause: () => setImmediate(),
    });
    const run: Run = { actorId, departmentId: actor.departmentId, request, inputHash, policy: generationPolicy, entries, metadata };
    const allocations = new Map(data.allocations.map(a => [a.id, a]));
    return {
      ok: true,
      token: metadata.status === "cancelled" ? null : encode(run),
      summary: {
        ...metadata, fixedCount: fixed.length,
        coverage: coverage.map(row => {
          const allocation = allocations.get(row.allocationId)!;
          return { ...row, course: data.courses.find(c => c.id === allocation.courseId)?.code ?? "Unavailable course",
            section: data.sections.find(s => s.id === allocation.sectionId)?.code ?? "Unavailable section" };
        }),
        entries: entries.map(p => ({
          id: p.seriesId, allocationId: p.allocationId, weekday: p.weekday, startMinute: p.startMinute,
          endMinute: p.endMinute, room: data.rooms.find(r => r.id === p.roomId)!.code,
        })).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.room.localeCompare(b.room)),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function importGeneration(actorId: string | null, input: unknown): Promise<ScheduleResult> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const { requestId, token } = importRequest.parse(input), run = decode(token);
    return await getDb().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await manager(tx, actorId), { departmentId } = actor;
      if (run.actorId !== actor.id || run.departmentId !== departmentId) throw new AccessError("FORBIDDEN");
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      const fingerprint = digest({ operation: "import-generation", token });
      const receipt = await tx.mutationReceipt.findUnique({ where: { id: requestId } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) {
          throw new ScheduleError("CONFLICT", "This request key was used for a different operation. Retry from the current proposal.");
        }
        return receipt.result as unknown as ScheduleResult;
      }
      const { data, fixed, semester, inputHash } = await snapshot(tx, departmentId, run.request);
      if (run.inputHash !== inputHash || digest(run.policy) !== digest(generationPolicy)) throw stale();
      for (const [index, placement] of run.entries.entries()) {
        if (placementConflicts(placement, run.entries.slice(0, index), data).length) {
          throw new ScheduleError("CONFLICT", "The proposal no longer meets weekly rules. Generate again.");
        }
      }
      const fixedIds = new Set(fixed.map(p => p.seriesId));
      const entries = run.entries.map(p => ({ ...p, seriesId: fixedIds.has(p.seriesId) ? p.seriesId : randomUUID() }));
      const { effectiveFrom, seed } = run.request;
      const revision = semester.scheduleRevision;
      const draft = await tx.timetableVersion.create({
        data: {
          departmentId, semesterId: semester.id, effectiveFrom, effectiveTo: semester.endDate, baseScheduleRevision: revision,
        },
      });
      if (entries.length) await tx.timetableEntry.createMany({
        data: entries.map(p => ({ ...p, departmentId, timetableVersionId: draft.id })),
      });
      await tx.auditEvent.create({ data: {
        departmentId, actorId, action: "TIMETABLE_DRAFT_CREATED", entityId: draft.id, before: {},
        after: { status: draft.status, version: draft.version, semesterId: semester.id, effectiveFrom, revision,
          entries, generation: { ...run.metadata, policy: run.policy, seed, inputHash, fixedCount: fixed.length } },
      } });
      const result = { ok: true, message: "Generated draft saved.", draftId: draft.id, version: draft.version, revision };
      await tx.mutationReceipt.create({ data: { id: requestId, departmentId, actorId, fingerprint, result: result satisfies Prisma.InputJsonValue } });
      return result;
    });
  } catch (error) {
    return failure(error);
  }
}
