import "server-only";
import { createHash } from "node:crypto";
import { rejectionLabels, resolutionPolicy, tierNames, type Assignment } from "@/domain/resolution/engine";
import { simulateDisruption } from "@/domain/scheduling/simulation";
import { localDate } from "@/domain/scheduling/timetable";
import { baselineCheck, simulationRequest, type ClassSummary, type SimulationFailure, type SimulationResult } from "@/features/simulation/schema";
import { requireScope } from "@/server/auth/permissions";
import { AccessError } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { resolutionActor } from "./resolutions";
import { resolutionSnapshot, ScheduleError, type Tx } from "./scheduling-store";

const transactionOptions = { isolationLevel: "RepeatableRead", timeout: 30000 } as const;
const published = { entry: { timetableVersion: { status: "PUBLISHED" as const } } };
const maxAffected = 30;

async function simulationActor(tx: Tx, actorId: string | null, departmentId: string) {
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const actor = await resolutionActor(tx, actorId);
  requireScope(actor, ["ADMIN", "COORDINATOR"], departmentId);
}

async function baselineState(tx: Tx, departmentId: string, now: Date) {
  const department = await tx.department.findUniqueOrThrow({ where: { id: departmentId }, select: { onlineTeachingEnabled: true } });
  const semesters = await tx.semester.findMany({
    where: { departmentId }, orderBy: { id: "asc" },
    select: { id: true, name: true, archived: true, startDate: true, endDate: true, scheduleRevision: true },
  });
  // Account access changes can alter candidate eligibility without advancing a semester revision.
  const staff = await tx.faculty.findMany({
    where: { departmentId }, orderBy: { id: "asc" },
    select: { id: true, user: { select: { name: true, active: true, role: true } } },
  });
  const policy = { ...resolutionPolicy, onlineEnabled: department.onlineTeachingEnabled };
  const month = localDate(now).slice(0, 7);
  const token = createHash("sha256").update(JSON.stringify({ departmentId, semesters, policy, staff, month })).digest("hex");
  return { token, semesters, policy };
}

export async function readSimulationWorkspace(actorId: string | null, departmentId: string) {
  return getDb().$transaction(async tx => {
    await simulationActor(tx, actorId, departmentId);
    const today = localDate();
    const terms = await tx.semester.findMany({
      where: { departmentId, archived: false, endDate: { gte: today } },
      select: { startDate: true }, orderBy: { startDate: "asc" },
    });
    const rooms = await tx.room.findMany({ where: { departmentId, archived: false }, select: { id: true, code: true, type: true }, orderBy: { code: "asc" } });
    const faculty = await tx.faculty.findMany({
      where: { departmentId, archived: false, user: { active: true, role: { in: ["FACULTY", "HOD"] } } },
      select: { id: true, user: { select: { name: true } } }, orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
    });
    const first = terms[0];
    return {
      departmentId, today, defaultDate: first ? (first.startDate > today ? first.startDate : today) : null,
      rooms: rooms.map(r => ({ id: r.id, label: `${r.code} · ${r.type === "LAB" ? "Lab" : "Classroom"}` })),
      faculty: faculty.map(f => ({ id: f.id, label: f.user.name })),
    };
  }, transactionOptions);
}

function failure(error: unknown): SimulationFailure {
  if (error instanceof AccessError) return { ok: false, code: error.code, message: error.code === "UNAUTHORIZED" ? "Sign in with an active account." : "This simulation scope is unavailable to your account." };
  if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
  console.error("Simulation read failed", error instanceof Error ? error.name : "Unknown error");
  return { ok: false, code: "ERROR", message: "Could not read the current schedule. Your scenario is retained. Try again." };
}

export async function runSimulation(actorId: string | null, input: unknown): Promise<SimulationFailure | { ok: true; result: SimulationResult }> {
  const parsed = simulationRequest.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALIDATION_ERROR", message: "Choose a resource and an inclusive date range of up to 31 days, with the end on or after the start." };
  const scenario = parsed.data;
  try {
    const scoped = await getDb().$transaction(async tx => {
      const { departmentId, kind, resourceId, startDate, endDate } = scenario;
      await simulationActor(tx, actorId, departmentId);
      const where = { id: resourceId, departmentId, archived: false };
      const resource = kind === "room"
        ? (await tx.room.findFirst({ where, select: { code: true } }))?.code
        : (await tx.faculty.findFirst({ where: { ...where, user: { active: true, role: { in: ["FACULTY", "HOD"] } } }, select: { user: { select: { name: true } } } }))?.user.name;
      if (resource === undefined) throw new AccessError("FORBIDDEN");

      const now = new Date();
      const state = await baselineState(tx, departmentId, now);
      if (startDate < localDate(now) || !state.semesters.some(s => !s.archived && s.startDate <= startDate && endDate <= s.endDate)) {
        throw new ScheduleError("VALIDATION_ERROR", "Choose dates from today onwards within a configured semester.");
      }
      const affected = await tx.classOccurrence.findMany({
        where: {
          departmentId, ...published, schedulingStatus: "ACTIVE", deliveryStatus: "PENDING",
          startAt: { gt: now }, localDate: { gte: startDate, lte: endDate },
          ...(kind === "room" ? { roomId: resourceId } : { facultyId: resourceId }),
        },
        select: { id: true }, take: maxAffected + 1,
      });
      if (affected.length > maxAffected) throw new ScheduleError("VALIDATION_ERROR", `This range affects more than ${maxAffected} classes. Choose a shorter range.`);
      const baseline = await resolutionSnapshot(tx, departmentId, [], undefined, { now, publishedOnly: true });
      const affectedIds = new Set(affected.map(row => row.id));
      return { resource, state, baseline, affected: baseline.active.filter(a => affectedIds.has(a.occurrenceId)) };
    }, transactionOptions);

    const { resource, state, baseline, affected } = scoped;
    const { items, workload } = simulateDisruption(baseline, affected, scenario);
    const describe = (a: Assignment): ClassSummary => {
      const allocation = baseline.data.allocations.find(row => row.id === a.allocationId);
      const course = baseline.data.courses.find(row => row.id === allocation?.courseId);
      return {
        course: course ? `${course.code} · ${course.name}` : "Course unavailable",
        section: baseline.data.sections.find(row => row.id === a.sectionId)?.code ?? "Section unavailable",
        faculty: baseline.data.faculty.find(row => row.id === a.facultyId)?.name ?? "Faculty unavailable",
        room: a.roomId ? baseline.data.rooms.find(row => row.id === a.roomId)?.code ?? "Room unavailable" : "Online",
        date: a.date, start: a.startMinute, end: a.endMinute,
      };
    };
    return { ok: true, result: {
      scenario, resource,
      baseline: {
        token: state.token, computedAt: baseline.now, policy: state.policy,
        revisions: state.semesters.filter(s => !s.archived).map(s => ({ name: s.name, revision: s.scheduleRevision })),
      },
      items: items.map(item => ({
        id: item.original.occurrenceId, original: describe(item.original), searchComplete: item.searchComplete,
        candidates: item.candidates.map(candidate => ({
          tier: tierNames[candidate.tier], assignments: candidate.assignments.map(describe), why: candidate.why, requires: candidate.requires,
        })),
        blockers: [...new Set(item.rejections.flatMap(rejection => rejection.codes))].sort().map(code => rejectionLabels[code] ?? code),
      })),
      workload,
    } };
  } catch (error) { return failure(error); }
}

export async function checkSimulation(actorId: string | null, input: unknown): Promise<SimulationFailure | { ok: true; stale: boolean }> {
  const parsed = baselineCheck.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALIDATION_ERROR", message: "Run the scenario again to obtain a baseline." };
  const { departmentId, token } = parsed.data;
  try {
    return await getDb().$transaction(async tx => {
      await simulationActor(tx, actorId, departmentId);
      const current = await baselineState(tx, departmentId, new Date());
      return { ok: true, stale: token !== current.token };
    }, transactionOptions);
  } catch (error) { return failure(error); }
}
