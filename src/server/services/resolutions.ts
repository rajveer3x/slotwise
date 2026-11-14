import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { AccessError, actorSelect, sessionIdentity } from "@/server/auth/session";
import { instant } from "@/domain/scheduling/timetable";
import { resolveBatch, resolutionPolicy, type Assignment, type Decisions, type ResolutionSnapshot } from "@/domain/resolution/engine";
import { resolutionCommand, resolutionDecisions, type Board, type ResolutionResult } from "@/features/resolutions/schema";
import { consentHistory, expireCovers, invalidateItemConsent } from "./consent-store";
import { schedulingData, occurrenceInclude, type StoredOccurrence, type Tx, ScheduleError } from "./scheduling-store";

export async function resolutionActor(tx: Tx, id: string | null) {
  const actor = id ? await tx.user.findUnique({ where: { id }, select: actorSelect }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  if (!["COORDINATOR", "ADMIN"].includes(actor.role)) throw new AccessError("FORBIDDEN");
  if (actor.department.timezone !== "Asia/Kolkata") throw new ScheduleError("VALIDATION_ERROR", "This pilot supports Asia/Kolkata only.");
  return actor;
}
function asAssignment(o: StoredOccurrence): Assignment {
  return { occurrenceId: o.id, obligationId: o.teachingObligationId, allocationId: o.teachingObligation.allocationId, facultyId: o.facultyId, sectionId: o.sectionId, roomId: o.roomId, date: o.localDate, startMinute: Math.round((o.startAt.getTime() - instant(o.localDate, 0).getTime()) / 60000), endMinute: Math.round((o.endAt.getTime() - instant(o.localDate, 0).getTime()) / 60000) };
}
// All resources and boundary weeks are read within the caller's repeatable-read or locked transaction.
async function snapshot(tx: Tx, departmentId: string, affectedIds: string[], hypotheticalLeave?: ResolutionSnapshot["leaves"][number]): Promise<ResolutionSnapshot> {
  const data = await schedulingData(tx, departmentId);
  const department = await tx.department.findUniqueOrThrow({ where: { id: departmentId }, select: { onlineTeachingEnabled: true } });
  const semesters = await tx.semester.findMany({ where: { departmentId }, select: { id: true, startDate: true, endDate: true, archived: true, scheduleRevision: true }, orderBy: { id: "asc" } });
  const holidays = await tx.holiday.findMany({ where: { departmentId, archived: false }, select: { semesterId: true, date: true } });
  const leaves = await tx.leaveRequest.findMany({ where: { departmentId, status: "APPROVED" }, select: { facultyId: true, startDate: true, endDate: true } });
  const faculty = await tx.faculty.findMany({ where: { departmentId }, select: { id: true, targetMinutesPerWeek: true } });
  const sections = await tx.section.findMany({ where: { departmentId }, select: { id: true, preferredPeriodsPerDay: true } });
  const rows = await tx.classOccurrence.findMany({ where: { departmentId, OR: [{ schedulingStatus: "ACTIVE" }, { id: { in: affectedIds } }] }, include: occurrenceInclude, orderBy: { id: "asc" } });
  const now = new Date();
  return { data, faculty: faculty.map(f => ({ ...f, confirmedCoversThisMonth: 0 })), sections, semesters, holidays, leaves: [...leaves, ...(hypotheticalLeave ? [hypotheticalLeave] : [])], active: rows.filter(o => o.schedulingStatus === "ACTIVE" && !affectedIds.includes(o.id)).map(asAssignment), affected: rows.filter(o => affectedIds.includes(o.id)).map(asAssignment), swappableIds: rows.filter(o => o.schedulingStatus === "ACTIVE" && o.deliveryStatus === "PENDING" && !o.resolved && o.startAt > now && !affectedIds.includes(o.id)).map(o => o.id), now: now.toISOString(), onlineEnabled: department.onlineTeachingEnabled, policy: resolutionPolicy };
}
export async function estimateResolution(tx: Tx, departmentId: string, ids: string[], leave: ResolutionSnapshot["leaves"][number]) {
  const s = await snapshot(tx, departmentId, ids, leave), decisions: Decisions = { selected: {}, rejected: {} };
  // Provisional greedy reservations prevent the estimate double-counting one free interval.
  for (const item of resolveBatch(s)) {
    const current = resolveBatch(s, decisions).find(x => x.original.occurrenceId === item.original.occurrenceId)!;
    if (current.candidates[0]) decisions.selected[item.original.occurrenceId] = current.candidates[0].id;
  }
  const items = resolveBatch(s, decisions);
  return { possible: items.filter(i => i.selected).length, unresolved: items.filter(i => !i.selected).length, searchComplete: items.every(i => i.searchComplete), tiers: [1, 2, 3, 4, 5].map(tier => ({ tier, count: items.filter(i => i.selected?.tier === tier).length })) };
}
export async function buildResolutionBoard(tx: Tx, actor: Awaited<ReturnType<typeof resolutionActor>>, leaveId: string, override?: Decisions) {
  const departmentId = actor.departmentId;
  const leave = await tx.leaveRequest.findFirst({ where: { id: leaveId, departmentId, status: "APPROVED" }, select: { id: true, semesterId: true, version: true } });
  if (!leave) throw new AccessError("FORBIDDEN");
  const rows = await tx.classOccurrence.findMany({ where: { departmentId, leaveRequestId: leaveId, schedulingStatus: "CANCELLED", deliveryStatus: "PENDING", resolved: false, replacement: null, teachingObligation: { occurrences: { none: { schedulingStatus: "ACTIVE" } } } }, select: { id: true } });
  const s = await snapshot(tx, departmentId, rows.map(o => o.id));
  const plan = await tx.resolutionPlan.findUnique({ where: { leaveRequestId_ownerId: { leaveRequestId: leaveId, ownerId: actor.id } }, include: { items: true } });
  const saved: Decisions = { selected: {}, rejected: {} };
  for (const item of plan?.items ?? []) {
    if (!rows.some(row => row.id === item.occurrenceId)) continue;
    if (item.selectedCandidateId) saved.selected[item.occurrenceId] = item.selectedCandidateId;
    saved.rejected[item.occurrenceId] = item.rejectedCandidates as Decisions["rejected"][string];
  }
  const decisions = override ?? saved;
  const ids = new Set(s.affected.map(o => o.occurrenceId));
  if (override && [...Object.keys(override.selected), ...Object.keys(override.rejected)].some(id => !ids.has(id))) throw new ScheduleError("VALIDATION_ERROR", "A chosen class is no longer an unresolved item of this approved leave. Refresh the board.");
  const history = await consentHistory(tx, departmentId, [...ids], new Date(s.now));
  const automatic = history.filter(h => ["DECLINED", "EXPIRED", "REJECTED"].includes(h.status));
  const effective: Decisions = { selected: decisions.selected, rejected: { ...decisions.rejected } };
  for (const h of automatic) effective.rejected[h.occurrenceId] = [...(effective.rejected[h.occurrenceId] ?? []), { candidateId: h.candidateId, reason: h.kind === "cover" ? `Faculty response: ${h.status.toLowerCase()}.` : `HoD rejected: ${h.decisionReason ?? "See exception history."}` }];
  const revisions = s.semesters.map(({ id, scheduleRevision }) => ({ id, scheduleRevision }));
  const token = createHash("sha256").update(JSON.stringify({ revisions, policy: s.policy, onlineEnabled: s.onlineEnabled, leaveVersion: leave.version, responses: automatic.map(h => [h.id, h.status]) })).digest("hex");
  const labels: Record<string, string> = {};
  for (const f of s.data.faculty) labels[f.id] = f.name;
  for (const r of s.data.rooms) labels[r.id] = r.code;
  for (const section of s.data.sections) labels[section.id] = section.code;
  for (const a of s.data.allocations) { const c = s.data.courses.find(c => c.id === a.courseId); labels[a.id] = `${c?.code} · ${c?.name}`; }
  const board: Board = { items: resolveBatch(s, effective), decisions, history, savedSelections: Object.fromEntries((plan?.items ?? []).map(i => [i.occurrenceId, { itemId: i.id, candidateId: i.selectedCandidateId }])), token, revision: s.semesters.find(x => x.id === leave.semesterId)!.scheduleRevision, revisions, policyVersion: s.policy.version, planVersion: plan?.version ?? 0, stale: !!plan && plan.snapshotToken !== token, computedAt: s.now, labels };
  return { board, plan, snapshot: s };
}
export async function readResolutionWorkspace(actorId: string | null, leaveId?: string) {
  return getDb().$transaction(async tx => {
    const actor = await resolutionActor(tx, actorId);
    const requests = await tx.leaveRequest.findMany({ where: { departmentId: actor.departmentId, status: "APPROVED" }, select: { id: true, startDate: true, endDate: true, faculty: { select: { user: { select: { name: true } } } } }, orderBy: [{ startDate: "asc" }, { id: "asc" }] });
    const selected = leaveId ?? requests[0]?.id;
    return { requests, leaveId: selected ?? null, board: selected ? (await buildResolutionBoard(tx, actor, selected)).board : null };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
export type ResolutionWorkspace = Awaited<ReturnType<typeof readResolutionWorkspace>>;
function failure(error: unknown): ResolutionResult {
  if (error instanceof AccessError) return { ok: false, code: error.code, message: error.code === "UNAUTHORIZED" ? "Sign in with an active account." : "You cannot access this resolution draft." };
  if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Check the draft fields. Rejections need a reason of 1–500 characters." };
  if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return { ok: false, code: "CONFLICT", message: "The draft changed. Recompute and retry; no partial change was saved." };
  console.error("Resolution operation failed", error instanceof Error ? error.name : "Unknown error");
  return { ok: false, code: "ERROR", message: "Could not complete the operation. Your choices are retained. Retry or recompute." };
}
export async function mutateResolution(input: unknown) { return changeResolution(await sessionIdentity(), input); }
export async function changeResolution(actorId: string | null, input: unknown): Promise<ResolutionResult> {
  try {
    const command = resolutionCommand.parse(input);
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const fingerprint = createHash("sha256").update(JSON.stringify({ feature: "resolution", command })).digest("hex");
    return await getDb().$transaction(async tx => {
      if (command.operation === "save") await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await resolutionActor(tx, actorId), departmentId = actor.departmentId;
      if (command.operation === "save") await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      // Recheck entity scope before replaying even a successful receipt.
      const scoped = await tx.leaveRequest.findFirst({ where: { id: command.leaveId, departmentId, status: "APPROVED" }, select: { id: true } });
      if (!scoped) throw new AccessError("FORBIDDEN");
      if (command.operation === "save") {
        const receipt = await tx.mutationReceipt.findUnique({ where: { id: command.requestId } });
        if (receipt) {
          if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) throw new ScheduleError("CONFLICT", "This retry key belongs to another operation.");
          return receipt.result as unknown as ResolutionResult;
        }
      }
      if (command.operation === "save") await expireCovers(tx, departmentId, actorId, new Date());
      const { board, plan, snapshot: s } = await buildResolutionBoard(tx, actor, command.leaveId, resolutionDecisions.parse(command.decisions));
      if (command.operation === "compute") return { ok: true, message: "Recomputed against current resources. Review choices, then save the draft. Nothing is reserved.", board: { ...board, stale: false } };
      if (board.token !== command.expectedToken || board.planVersion !== command.expectedVersion) throw new ScheduleError("STALE_VERSION", "The schedule, policy or draft changed. Recompute and review before saving. Your choices are retained.");
      if (board.items.some(i => i.selectionError)) throw new ScheduleError("CONFLICT", "A selected candidate is no longer valid in this batch. Recompute and choose again or clear it.");
      const data = { baseScheduleRevision: board.revision, revisionSnapshot: board.revisions as Prisma.InputJsonValue, policySnapshot: { ...s.policy, onlineEnabled: s.onlineEnabled }, snapshotToken: board.token };
      const stored = plan ? await tx.resolutionPlan.update({ where: { id: plan.id }, data: { ...data, version: { increment: 1 } } }) : await tx.resolutionPlan.create({ data: { ...data, departmentId, leaveRequestId: command.leaveId, ownerId: actorId } });
      // Keep stable items so response/exception foreign keys and terminal history survive edits.
      const savedSelections: Board["savedSelections"] = {};
      for (const old of plan?.items ?? []) if (!board.items.some(i => i.original.occurrenceId === old.occurrenceId)) {
        await invalidateItemConsent(tx, departmentId, actorId, old.id, null, new Date());
        await tx.resolutionItem.update({ where: { id: old.id }, data: { selectedCandidateId: null } });
      }
      for (const item of board.items) {
        const data = { selectedCandidateId: item.selected?.id ?? null, rejectedCandidates: (command.decisions.rejected[item.original.occurrenceId] ?? []) as Prisma.InputJsonValue, explanation: item as unknown as Prisma.InputJsonValue };
        const row = await tx.resolutionItem.upsert({ where: { planId_occurrenceId: { planId: stored.id, occurrenceId: item.original.occurrenceId } }, create: { ...data, departmentId, planId: stored.id, occurrenceId: item.original.occurrenceId }, update: data });
        await invalidateItemConsent(tx, departmentId, actorId, row.id, data.selectedCandidateId, new Date());
        savedSelections[item.original.occurrenceId] = { itemId: row.id, candidateId: data.selectedCandidateId };
      }
      await tx.auditEvent.create({ data: { departmentId, actorId, action: "RESOLUTION_DRAFT_SAVED", entityId: stored.id, before: { version: plan?.version ?? 0 }, after: { version: stored.version, revision: board.revision, selected: board.items.filter(i => i.selected).length } } });
      const result: ResolutionResult = { ok: true, message: "Draft saved. No reservations, publication or delivery changes were made. Changed choices invalidate previous consent.", board: { ...board, planVersion: stored.version, savedSelections, history: await consentHistory(tx, departmentId, board.items.map(i => i.original.occurrenceId), new Date()), stale: false } };
      await tx.mutationReceipt.create({ data: { id: command.requestId, departmentId, actorId, fingerprint, result: result as unknown as Prisma.InputJsonValue } });
      return result;
    }, command.operation === "compute" ? { isolationLevel: "RepeatableRead", timeout: 30000 } : { timeout: 30000, maxWait: 10000 });
  } catch (error) { return failure(error); }
}
