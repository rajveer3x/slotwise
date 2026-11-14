import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { actorSelect, AccessError, sessionIdentity } from "@/server/auth/session";
import { requireScope } from "@/server/auth/permissions";
import { alternatives, completeness, materialize, localDate, validatePlacements, weekOf, clockTime, type Placement } from "@/domain/scheduling/timetable";
import { scheduleInput, type ScheduleResult, type Preview } from "@/features/timetable/schema";
import { guardApprovedAbsence, schedulingData, ScheduleError, occurrenceInclude, asPlacement, validateDated, type Tx } from "./scheduling-store";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function actorFor(tx: Tx, id: string | null, write = false) {
  const actor = id ? await tx.user.findUnique({ where: { id }, select: actorSelect }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  if (write) requireScope(actor, ["ADMIN", "COORDINATOR"], actor.departmentId);
  if (actor.department.timezone !== "Asia/Kolkata") throw new ScheduleError("VALIDATION_ERROR", "This pilot currently supports Asia/Kolkata scheduling only.");
  return actor;
}
export async function readTimetable(actorId: string | null, semesterId?: string) {
  return getDb().$transaction(async tx => {
    const actor = await actorFor(tx, actorId), departmentId = actor.departmentId;
    const canEdit = ["ADMIN", "COORDINATOR"].includes(actor.role);
    const semesters = await tx.semester.findMany({ where: { departmentId, archived: false }, orderBy: [{ active: "desc" }, { startDate: "desc" }] });
    const semester = semesterId ? semesters.find(s => s.id === semesterId) : semesters[0];
    if (semesterId && !semester) throw new AccessError("FORBIDDEN");
    const memberships = actor.role === "STUDENT" ? await tx.sectionMembership.findMany({ where: { departmentId, userId: actor.id, archived: false, section: { semesterId: semester?.id ?? "" } } }) : [];
    const occurrences = semester ? await tx.classOccurrence.findMany({ where: { departmentId, entry: { timetableVersion: { semesterId: semester.id } }, ...(actor.role === "STUDENT" ? { sectionId: { in: memberships.map(m => m.sectionId) } } : {}) }, include: { ...occurrenceInclude, faculty: { select: { user: { select: { name: true } } } }, room: { select: { code: true } }, section: { select: { code: true } }, teachingObligation: { include: { allocation: { include: { course: { select: { code: true, name: true } } } } } } }, orderBy: [{ startAt: "asc" }, { id: "asc" }] }) : [];
    const drafts = canEdit && semester ? await tx.timetableVersion.findMany({ where: { departmentId, semesterId: semester.id, status: "DRAFT" }, include: { entries: { orderBy: { seriesId: "asc" } } }, orderBy: { id: "asc" } }) : [];
    const data = canEdit ? await schedulingData(tx, departmentId) : null;
    return {
      canEdit, role: actor.role, timezone: actor.department.timezone, today: localDate(),
      semesters: semesters.map(s => ({ id: s.id, name: s.name })), semester: semester ? { id: semester.id, name: semester.name, startDate: semester.startDate, endDate: semester.endDate, scheduleRevision: semester.scheduleRevision } : null,
      data, drafts: drafts.map(d => ({ id: d.id, version: d.version, baseScheduleRevision: d.baseScheduleRevision, effectiveFrom: d.effectiveFrom, entries: d.entries.map(({ seriesId, allocationId, roomId, weekday, startMinute, endMinute }) => ({ seriesId, allocationId, roomId, weekday, startMinute, endMinute })) })),
      occurrences: occurrences.map(o => ({ id: o.id, localDate: o.localDate, startMinute: asPlacement(o).startMinute, endMinute: asPlacement(o).endMinute, course: `${o.teachingObligation.allocation.course.code} · ${o.teachingObligation.allocation.course.name}`, facultyId: o.facultyId, faculty: o.faculty.user.name, sectionId: o.sectionId, section: o.section.code, roomId: o.roomId, room: o.room.code, schedulingStatus: o.schedulingStatus, deliveryStatus: o.deliveryStatus })),
    };
  }, { isolationLevel: "RepeatableRead" });
}
export type TimetableSnapshot = Awaited<ReturnType<typeof readTimetable>>;

async function publication(tx: Tx, draftId: string, departmentId: string) {
  const draft = await tx.timetableVersion.findFirstOrThrow({ where: { id: draftId, departmentId }, include: { entries: true, semester: true } });
  const data = await schedulingData(tx, departmentId), now = new Date();
  const conflicts = [...validatePlacements(draft.entries, data), ...completeness(draft.entries, data, draft.semesterId)];
  if (!draft.entries.length) conflicts.push({ rule: "EMPTY", seriesId: "", message: "Place classes before publishing." });
  if (draft.effectiveFrom < localDate() || draft.effectiveFrom < draft.semester.startDate || draft.effectiveTo !== draft.semester.endDate || draft.effectiveFrom > draft.effectiveTo) throw new ScheduleError("VALIDATION_ERROR", "Choose a current or future effective date within the semester, then save the draft.");
  if (conflicts.length) throw new ScheduleError("CONFLICT", "Publication is blocked. Repair the draft and complete its weekly allocations.", conflicts);
  const holidays = await tx.holiday.findMany({ where: { departmentId, semesterId: draft.semesterId, archived: false } });
  const proposed = materialize(draft.entries, draft.effectiveFrom, draft.effectiveTo, holidays.map(h => h.date));
  if (proposed.some(p => p.startAt <= now)) throw new ScheduleError("CONFLICT", "The effective date includes a class that has already started. Choose a later date.");
  const existing = await tx.classOccurrence.findMany({ where: { departmentId, entry: { timetableVersion: { semesterId: draft.semesterId } } }, include: occurrenceInclude });
  if (existing.some(o => o.localDate >= draft.effectiveFrom && (o.resolved || o.leaveRequestId))) throw new ScheduleError("CONFLICT", "Future classes are affected by approved leave or published resolutions. Review recovery before changing this template.");
  const cancel = existing.filter(o => o.schedulingStatus === "ACTIVE" && o.localDate >= draft.effectiveFrom && o.deliveryStatus === "PENDING" && o.startAt > now);
  const cancelIds = new Set(cancel.map(o => o.id));
  const obligations = await tx.teachingObligation.findMany({ where: { departmentId, allocation: { semesterId: draft.semesterId } } });
  const key = (series: string, date: string) => `${series}/${weekOf(date)}`;
  const obligationMap = new Map(obligations.map(o => [`${o.seriesId}/${o.weekDate}`, o]));
  const next = proposed.filter(p => {
    const obligation = obligationMap.get(key(p.seriesId, p.localDate));
    // A weekly teaching unit already taught or before the effective boundary is
    // retained; moving the weekday cannot manufacture a second obligation.
    return !obligation || !existing.some(o => o.teachingObligationId === obligation.id && (o.deliveryStatus !== "PENDING" || (o.schedulingStatus === "ACTIVE" && !cancelIds.has(o.id))));
  });
  // A boundary-week move can target an obligation whose leave cancellation is
  // before effectiveFrom. Protect its identity, not only its original date.
  const leaveObligations = new Set(existing.filter(o => o.leaveRequestId).map(o => o.teachingObligationId));
  for (const p of next) {
    const obligation = obligationMap.get(key(p.seriesId, p.localDate));
    if (obligation && leaveObligations.has(obligation.id)) throw new ScheduleError("CONFLICT", "A teaching obligation was cancelled by approved leave. Use the reviewed recovery workflow instead of recreating it through a template.");
    if (obligation && (obligation.allocationId !== p.allocationId || obligation.requiredMinutes !== p.endMinute - p.startMinute)) throw new ScheduleError("CONFLICT", "Existing teaching units keep their allocation and duration. Move them without changing their duration.");
  }
  const retained = await tx.classOccurrence.findMany({ where: { departmentId, schedulingStatus: "ACTIVE", localDate: { gte: weekOf(draft.effectiveFrom) }, id: { notIn: [...cancelIds] } }, include: occurrenceInclude });
  const datedConflicts = validateDated([...retained.map(o => ({ ...asPlacement(o), localDate: o.localDate })), ...next], data);
  if (datedConflicts.length) throw new ScheduleError("CONFLICT", "The dated schedule conflicts with retained classes or another semester.", datedConflicts);
  await guardApprovedAbsence(tx, departmentId, next.map(p => ({ facultyId: data.allocations.find(a => a.id === p.allocationId)!.facultyId, localDate: p.localDate })));
  const sectionIds = [...new Set(draft.entries.map(p => data.allocations.find(a => a.id === p.allocationId)!.sectionId))];
  const facultyIds = [...new Set(draft.entries.map(p => data.allocations.find(a => a.id === p.allocationId)!.facultyId))];
  const recipients = await tx.user.findMany({ where: { departmentId, active: true, OR: [{ role: { in: ["ADMIN", "COORDINATOR", "HOD"] } }, { faculty: { id: { in: facultyIds } } }, { role: "STUDENT", memberships: { some: { archived: false, sectionId: { in: sectionIds } } } }] }, select: { id: true }, orderBy: { id: "asc" } });
  const describe = (p: Placement, date: string) => { const a = data.allocations.find(a => a.id === p.allocationId)!; return `${date} ${clockTime(p.startMinute)}–${clockTime(p.endMinute)} · ${data.courses.find(c => c.id === a.courseId)!.code} · ${data.sections.find(s => s.id === a.sectionId)!.code} · ${data.faculty.find(f => f.id === a.facultyId)!.name} · ${data.rooms.find(r => r.id === p.roomId)!.code}`; };
  const matched = new Set<string>();
  const changes = next.map(p => {
    const old = cancel.find(o => key(o.entry.seriesId, o.localDate) === key(p.seriesId, p.localDate));
    if (old) matched.add(old.id);
    return { before: old ? describe(asPlacement(old), old.localDate) : "Not scheduled", after: describe(p, p.localDate) };
  });
  changes.push(...cancel.filter(o => !matched.has(o.id)).map(o => ({ before: describe(asPlacement(o), o.localDate), after: "Cancelled; teaching obligation retained" })));
  const preview: Preview = { fingerprint: hash({ draftId, version: draft.version, revision: draft.semester.scheduleRevision, changes, preserved: existing.filter(o => !cancelIds.has(o.id)).map(o => [o.id, o.deliveryStatus, o.schedulingStatus]), recipients }), revision: draft.semester.scheduleRevision, count: next.length, cancelledCount: cancel.length, preservedCount: existing.filter(o => o.schedulingStatus === "ACTIVE" && !cancelIds.has(o.id)).length, recipientCount: recipients.length, effectiveFrom: draft.effectiveFrom, effectiveTo: draft.effectiveTo, changes };
  return { draft, data, cancel, next, obligationMap, key, recipients, preview };
}
export async function mutateTimetable(input: unknown) { return changeTimetable(await sessionIdentity(), input); }
// actorId is resolved by the server adapter; never accepted from browser payloads.
export async function changeTimetable(actorId: string | null, input: unknown): Promise<ScheduleResult> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const command = scheduleInput.parse(input), fingerprint = hash(command);
    return await getDb().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await actorFor(tx, actorId, true), departmentId = actor.departmentId;
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      const receipt = await tx.mutationReceipt.findUnique({ where: { id: command.requestId } });
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) throw new ScheduleError("CONFLICT", "This request key was used for a different operation. Refresh and retry.");
        return receipt.result as unknown as ScheduleResult;
      }
      const semester = await tx.semester.findFirst({ where: { id: command.semesterId, departmentId, archived: false } });
      if (!semester) throw new AccessError("FORBIDDEN");
      if (semester.scheduleRevision !== command.expectedRevision) throw new ScheduleError("STALE_VERSION", "The schedule or master data changed. Refresh, review your draft and preview again.");
      let result: ScheduleResult;
      if (command.operation === "create") {
        const effectiveFrom = command.effectiveFrom;
        if (!effectiveFrom || effectiveFrom < localDate() || effectiveFrom < semester.startDate || effectiveFrom > semester.endDate) throw new ScheduleError("VALIDATION_ERROR", "Choose a current or future effective date within the semester.");
        const previous = await tx.timetableVersion.findFirst({ where: { semesterId: semester.id, departmentId, status: "PUBLISHED" }, include: { entries: true }, orderBy: { publishedAt: "desc" } });
        const draft = await tx.timetableVersion.create({ data: { departmentId, semesterId: semester.id, effectiveFrom, effectiveTo: semester.endDate, baseScheduleRevision: semester.scheduleRevision } });
        if (previous) await tx.timetableEntry.createMany({ data: previous.entries.map(({ seriesId, allocationId, roomId, weekday, startMinute, endMinute }) => ({ departmentId, timetableVersionId: draft.id, seriesId, allocationId, roomId, weekday, startMinute, endMinute })) });
        result = { ok: true, message: "Draft created. It reserves no resources.", draftId: draft.id, version: draft.version, revision: semester.scheduleRevision };
      } else {
        const draft = await tx.timetableVersion.findFirst({ where: { id: command.draftId ?? "", departmentId, semesterId: semester.id }, include: { entries: true } });
        if (!draft) throw new AccessError("FORBIDDEN");
        if (draft.status !== "DRAFT" || draft.version !== command.expectedVersion) throw new ScheduleError("STALE_VERSION", "This draft changed or was published. Your input is retained. Refresh before trying again.");
        if (command.operation === "save") {
          const entries = command.entries;
          if (!entries || !command.effectiveFrom || command.effectiveFrom < localDate() || command.effectiveFrom < semester.startDate || command.effectiveFrom > semester.endDate) throw new ScheduleError("VALIDATION_ERROR", "Provide entries and a current or future effective date within the semester.");
          const data = await schedulingData(tx, departmentId);
          if (new Set(entries.map(e => e.seriesId)).size !== entries.length || entries.some(e => !data.allocations.some(a => a.id === e.allocationId && a.semesterId === semester.id))) throw new ScheduleError("VALIDATION_ERROR", "Choose unique classes and allocations from this semester.");
          for (const e of entries) {
            const prior = await tx.timetableEntry.findFirst({ where: { seriesId: e.seriesId }, include: { timetableVersion: true } });
            if (prior && (prior.departmentId !== departmentId || prior.allocationId !== e.allocationId || prior.timetableVersion.semesterId !== semester.id)) throw new ScheduleError("FORBIDDEN", "A teaching unit cannot be reassigned to another allocation or semester.");
          }
          const conflicts = validatePlacements(entries, data);
          if (conflicts.length) {
            const candidate = entries.filter(e => !draft.entries.some(old => old.seriesId === e.seriesId && old.roomId === e.roomId && old.weekday === e.weekday && old.startMinute === e.startMinute && old.endMinute === e.endMinute)).at(-1) ?? entries[0];
            return { ok: false, code: "CONFLICT", message: "Move rejected; the saved draft is unchanged.", conflicts, alternatives: candidate ? alternatives(candidate, entries, data) : [] };
          }
          await tx.timetableEntry.deleteMany({ where: { timetableVersionId: draft.id } });
          await tx.timetableEntry.createMany({ data: entries.map(e => ({ ...e, departmentId, timetableVersionId: draft.id })) });
          await tx.timetableVersion.update({ where: { id: draft.id }, data: { effectiveFrom: command.effectiveFrom, effectiveTo: semester.endDate, baseScheduleRevision: semester.scheduleRevision, version: { increment: 1 } } });
          result = { ok: true, message: "Draft saved. No resources reserved.", draftId: draft.id, version: draft.version + 1, revision: semester.scheduleRevision };
        } else {
          if (draft.baseScheduleRevision !== semester.scheduleRevision) throw new ScheduleError("STALE_VERSION", "Master data or the schedule changed. Refresh and save this draft to revalidate it before previewing.");
          const plan = await publication(tx, draft.id, departmentId);
          if (command.operation === "preview") return { ok: true, message: "Preview only. Publication will revalidate these changes.", preview: plan.preview };
          if (command.previewFingerprint !== plan.preview.fingerprint) throw new ScheduleError("STALE_VERSION", "The preview is missing or changed. Preview this draft again before publication.");
          await tx.resourceReservation.deleteMany({ where: { occurrenceId: { in: plan.cancel.map(o => o.id) } } });
          await tx.classOccurrence.updateMany({ where: { id: { in: plan.cancel.map(o => o.id) } }, data: { schedulingStatus: "CANCELLED" } });
          for (const p of plan.next) {
            const a = plan.data.allocations.find(a => a.id === p.allocationId)!;
            let obligation = plan.obligationMap.get(plan.key(p.seriesId, p.localDate));
            if (!obligation) obligation = await tx.teachingObligation.create({ data: { departmentId, allocationId: p.allocationId, seriesId: p.seriesId, weekDate: weekOf(p.localDate), originalDate: p.localDate, requiredMinutes: p.endMinute - p.startMinute } });
            const old = plan.cancel.find(o => o.teachingObligationId === obligation.id);
            const occurrence = await tx.classOccurrence.create({ data: { departmentId, entryId: plan.draft.entries.find(e => e.seriesId === p.seriesId)!.id, teachingObligationId: obligation.id, facultyId: a.facultyId, sectionId: a.sectionId, roomId: p.roomId, localDate: p.localDate, startAt: p.startAt, endAt: p.endAt, replacesId: old?.id } });
            await tx.resourceReservation.createMany({ data: ([['FACULTY', a.facultyId], ['SECTION', a.sectionId], ['ROOM', p.roomId]] as const).map(([resourceType, resourceId]) => ({ departmentId, occurrenceId: occurrence.id, resourceType, resourceId, startAt: p.startAt, endAt: p.endAt })) });
          }
          if (plan.next.some(p => p.startAt <= new Date())) throw new ScheduleError("STALE_VERSION", "A proposed class started while publishing. Refresh and choose a later effective date.");
          await tx.timetableVersion.update({ where: { id: draft.id }, data: { status: "PUBLISHED", publishedAt: new Date(), version: { increment: 1 } } });
          await tx.semester.update({ where: { id: semester.id }, data: { scheduleRevision: { increment: 1 } } });
          await tx.auditEvent.create({ data: { departmentId, actorId, action: "TIMETABLE_PUBLISHED", entityId: draft.id, before: { revision: semester.scheduleRevision, occurrenceIds: plan.cancel.map(o => o.id) }, after: { revision: semester.scheduleRevision + 1, effectiveFrom: draft.effectiveFrom, occurrences: plan.next.length } } });
          await tx.notification.createMany({ data: plan.recipients.map(r => ({ departmentId, recipientId: r.id, changeId: draft.id, message: `Timetable published from ${draft.effectiveFrom}. View your timetable for details.` })) });
          result = { ok: true, message: `Published ${plan.next.length} dated classes. Delivery remains pending.`, draftId: draft.id, revision: semester.scheduleRevision + 1 };
        }
      }
      await tx.mutationReceipt.create({ data: { id: command.requestId, departmentId, actorId, fingerprint, result: result as Prisma.InputJsonValue } });
      return result;
    }, { timeout: 30000, maxWait: 10000 });
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, code: error.code, message: error.code === "UNAUTHORIZED" ? "Your session is no longer active. Sign in again." : "You do not have permission for this timetable." };
    if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Check the date, class, room and teaching slots. All required values must be valid." };
    if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message, conflicts: error.conflicts };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2004", "P2010", "P2034"].includes(error.code)) return { ok: false, code: "CONFLICT", message: "A resource or schedule changed during publication. Nothing was partially published. Refresh and preview again." };
    console.error("Scheduling mutation failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, code: "ERROR", message: "Could not save the schedule. No partial change was committed. Retry with your input retained." };
  }
}
