import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { AccessError, sessionIdentity } from "@/server/auth/session";
import { instant } from "@/domain/scheduling/timetable";
import { assignmentErrors, type Candidate } from "@/domain/resolution/engine";
import { publicationCommand, type PublicationPreview, type PublicationResult } from "@/features/publications/schema";
import { buildResolutionBoard, resolutionActor } from "./resolutions";
import { assertExactConsent, invalidateItemConsent } from "./consent-store";
import { asAssignment, occurrenceInclude, ScheduleError, type Tx } from "./scheduling-store";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Command = z.infer<typeof publicationCommand>;
function meetingUrl(value: string | undefined) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.href : null; } catch { return null; }
}
async function prepare(tx: Tx, actor: Awaited<ReturnType<typeof resolutionActor>>, command: Command) {
  const { board, plan, snapshot } = await buildResolutionBoard(tx, actor, command.leaveId);
  if (!plan || plan.status !== "DRAFT" || board.stale || plan.version !== command.expectedVersion || board.token !== command.expectedToken) throw new ScheduleError("STALE_VERSION", "The schedule, policy or saved draft changed. Recompute, review and save the draft before previewing again.");
  const selected = board.items.filter(i => command.occurrenceIds.includes(i.original.occurrenceId));
  if (selected.length !== command.occurrenceIds.length || selected.some(i => !i.selected || i.selectionError || plan.items.find(p => p.occurrenceId === i.original.occurrenceId)?.status !== "DRAFT")) throw new ScheduleError("CONFLICT", "Only current valid saved selections can publish. Recompute and review the selected classes.");
  if (Object.keys(command.meetingUrls).some(id => !selected.some(i => i.original.occurrenceId === id && i.selected!.tier === 4))) throw new ScheduleError("VALIDATION_ERROR", "Meeting links belong only to selected online classes.");
  // Re-solve only the explicitly selected subset. Unselected drafts reserve nothing.
  const subset = await buildResolutionBoard(tx, actor, command.leaveId, { selected: Object.fromEntries(selected.map(i => [i.original.occurrenceId, i.selected!.id])), rejected: board.decisions.rejected });
  const candidates = selected.map(i => {
    const current = subset.board.items.find(b => b.original.occurrenceId === i.original.occurrenceId)?.selected;
    if (!current || current.id !== i.selected!.id) throw new ScheduleError("CONFLICT", "The selected subset needs recomputation against current resources and tier order.");
    return { item: plan.items.find(p => p.occurrenceId === i.original.occurrenceId)!, candidate: current };
  });
  const changes: PublicationPreview["changes"] = [], blockers: string[] = [];
  const allAssignments = candidates.flatMap(c => c.candidate.assignments);
  if (new Set(allAssignments.map(a => a.obligationId)).size !== allAssignments.length) throw new ScheduleError("CONFLICT", "Two selected items change the same teaching obligation.");
  const removed = candidates.flatMap(c => c.candidate.removes);
  const retained = snapshot.active.filter(a => !removed.includes(a.occurrenceId));
  for (const { item, candidate } of candidates) {
    const errors = assignmentErrors(candidate.assignments, [...retained, ...allAssignments.filter(a => !candidate.assignments.includes(a))], snapshot, candidate.tier);
    if (errors.length) throw new ScheduleError("CONFLICT", `A selected class conflicts with the current schedule: ${errors.join(", ")}. No changes published.`);
    try { await assertExactConsent(tx, actor.departmentId, item.id, candidate); }
    catch (error) { if (!(error instanceof ScheduleError)) throw error; blockers.push(error.message); }
    const url = candidate.tier === 4 ? meetingUrl(command.meetingUrls[item.occurrenceId]) : null;
    if (candidate.tier === 4 && !url) blockers.push("Each selected online class needs a valid HTTPS meeting URL without embedded credentials.");
    for (const a of candidate.assignments) {
      const old = await tx.classOccurrence.findFirst({ where: { id: a.occurrenceId, departmentId: actor.departmentId }, include: { ...occurrenceInclude, replacement: true } });
      const original = a.occurrenceId === item.occurrenceId;
      if (!old || old.replacement || old.resolved || old.deliveryStatus !== "PENDING" || old.teachingObligationId !== a.obligationId || old.teachingObligation.allocationId !== a.allocationId || old.teachingObligation.requiredMinutes !== a.endMinute - a.startMinute || old.sectionId !== a.sectionId || (original ? old.schedulingStatus !== "CANCELLED" || old.leaveRequestId !== command.leaveId : old.schedulingStatus !== "ACTIVE" || !candidate.removes.includes(old.id)) || await tx.classOccurrence.count({ where: { teachingObligationId: a.obligationId, id: { not: old.id }, OR: [{ schedulingStatus: "ACTIVE" }, { deliveryStatus: "HELD" }] } })) throw new ScheduleError("CONFLICT", "A teaching obligation changed or was already resolved. Recompute; no partial publication is allowed.");
      changes.push({ itemId: item.id, tier: candidate.tier, beforeStatus: old.schedulingStatus, before: asAssignment(old), after: a, meetingUrl: url });
    }
  }
  const facultyIds = [...new Set(changes.flatMap(c => [c.before.facultyId, c.after.facultyId]))], sectionIds = [...new Set(changes.map(c => c.after.sectionId))];
  const recipients = await tx.user.findMany({ where: { departmentId: actor.departmentId, active: true, OR: [{ role: { in: ["ADMIN", "COORDINATOR", "HOD"] } }, { faculty: { id: { in: facultyIds } } }, { role: "STUDENT", memberships: { some: { archived: false, sectionId: { in: sectionIds } } } }] }, select: { id: true, name: true, role: true }, orderBy: { id: "asc" } });
  const preview = { token: board.token, planVersion: plan.version, revision: board.revision, changes, selectedCount: selected.length, unresolved: board.items.filter(i => !command.occurrenceIds.includes(i.original.occurrenceId)).map(i => i.original), recipients, blockers: [...new Set(blockers)], labels: Object.fromEntries(Object.entries(board.labels).sort(([a], [b]) => a.localeCompare(b))) };
  return { plan, candidates, preview: { ...preview, fingerprint: hash({ ...preview, consent: board.history.filter(h => command.occurrenceIds.includes(h.occurrenceId)) }) } };
}
export async function mutatePublication(input: unknown) { return changePublication(await sessionIdentity(), input); }
export async function changePublication(actorId: string | null, input: unknown): Promise<PublicationResult> {
  try {
    const parsed = publicationCommand.parse(input);
    // Canonical subset order makes semantically identical retries identical.
    const command = { ...parsed, occurrenceIds: [...parsed.occurrenceIds].sort(), meetingUrls: Object.fromEntries(Object.entries(parsed.meetingUrls).sort(([a], [b]) => a.localeCompare(b))) };
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const fingerprint = hash({ feature: "publication", command });
    return await getDb().$transaction(async tx => {
      const lockedUsers = new Set([actorId]);
      if (command.operation === "publish") {
        // Account revocation locks User rather than Department. Lock all proposed
        // assignees in stable order before Department, then revalidate the saved
        // plan below. This closes the eligibility/revocation race without
        // preventing an administrator from revoking an already assigned account.
        const items = await tx.resolutionItem.findMany({ where: { plan: { ownerId: actorId, leaveRequestId: command.leaveId }, occurrenceId: { in: command.occurrenceIds } }, select: { explanation: true } });
        const facultyIds = items.flatMap(i => (i.explanation as unknown as { selected?: Candidate }).selected?.assignments.map(a => a.facultyId) ?? []);
        const faculty = await tx.faculty.findMany({ where: { id: { in: facultyIds } }, select: { userId: true } });
        for (const f of faculty) lockedUsers.add(f.userId);
        for (const id of [...lockedUsers].sort()) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR NO KEY UPDATE`;
      }
      const actor = await resolutionActor(tx, actorId), departmentId = actor.departmentId;
      if (command.operation === "publish") await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${departmentId} FOR UPDATE`;
      // Scope and current role are checked even when replaying a successful receipt.
      const scoped = await tx.resolutionPlan.findFirst({ where: { departmentId, ownerId: actorId, leaveRequestId: command.leaveId } });
      if (!scoped) throw new AccessError("FORBIDDEN");
      if (command.operation === "publish") {
        const receipt = await tx.mutationReceipt.findUnique({ where: { id: command.requestId } });
        if (receipt) {
          if (receipt.actorId !== actorId || receipt.departmentId !== departmentId || receipt.fingerprint !== fingerprint) throw new ScheduleError("CONFLICT", "This retry key belongs to a different operation or payload.");
          return receipt.result as unknown as PublicationResult;
        }
      }
      const prepared = await prepare(tx, actor, command), { preview, plan } = prepared;
      if (command.operation === "preview") return { ok: true, message: preview.blockers.length ? "Preview blocked. Resolve the listed requirements, then preview again." : "Review this subset before publication. Preview reserves nothing.", preview };
      if (command.previewFingerprint !== preview.fingerprint) throw new ScheduleError("STALE_VERSION", "This preview changed or is missing. Preview again and review before publishing.");
      if (preview.blockers.length) throw new ScheduleError("CONFLICT", preview.blockers.join(" "));
      const assignees = await tx.faculty.findMany({ where: { departmentId, id: { in: preview.changes.map(c => c.after.facultyId) } }, select: { userId: true } });
      if (assignees.some(f => !lockedUsers.has(f.userId))) throw new ScheduleError("STALE_VERSION", "The saved assignees changed while publishing. Preview again.");
      const publication = await tx.schedulePublication.create({ data: { departmentId, planId: plan.id, actorId, previewFingerprint: preview.fingerprint, details: preview as unknown as Prisma.InputJsonValue } });
      const replacedIds = preview.changes.map(c => c.before.occurrenceId);
      // Release every side before creating any side; swaps cannot depend on write order.
      await tx.resourceReservation.deleteMany({ where: { departmentId, occurrenceId: { in: replacedIds } } });
      await tx.classOccurrence.updateMany({ where: { departmentId, id: { in: replacedIds } }, data: { schedulingStatus: "CANCELLED" } });
      for (const change of preview.changes) {
        const a = change.after;
        const old = await tx.classOccurrence.findUniqueOrThrow({ where: { id: change.before.occurrenceId } });
        const occurrence = await tx.classOccurrence.create({ data: { departmentId, entryId: old.entryId, teachingObligationId: old.teachingObligationId, facultyId: a.facultyId, sectionId: a.sectionId, roomId: a.roomId, localDate: a.date, startAt: instant(a.date, a.startMinute), endAt: instant(a.date, a.endMinute), replacesId: old.id, resolved: true, resolutionTier: change.tier, meetingUrl: change.meetingUrl, publicationId: publication.id } });
        const resources: { resourceType: "FACULTY" | "SECTION" | "ROOM"; resourceId: string }[] = [{ resourceType: "FACULTY", resourceId: a.facultyId }, { resourceType: "SECTION", resourceId: a.sectionId }, ...(a.roomId ? [{ resourceType: "ROOM" as const, resourceId: a.roomId }] : [])];
        await tx.resourceReservation.createMany({ data: resources.map(r => ({ ...r, departmentId, occurrenceId: occurrence.id, startAt: occurrence.startAt, endAt: occurrence.endAt })) });
      }
      const itemIds = prepared.candidates.map(c => c.item.id);
      await tx.resolutionItem.updateMany({ where: { id: { in: itemIds } }, data: { status: "PUBLISHED", publicationId: publication.id } });
      // Any older departmental plan used a snapshot invalidated by this commit.
      await tx.resolutionItem.updateMany({ where: { departmentId, status: { not: "PUBLISHED" } }, data: { status: "SUPERSEDED" } });
      await tx.resolutionPlan.updateMany({ where: { departmentId, status: { not: "PUBLISHED" } }, data: { status: "SUPERSEDED", version: { increment: 1 } } });
      if (!preview.unresolved.length) await tx.resolutionPlan.update({ where: { id: plan.id }, data: { status: "PUBLISHED" } });
      // Preserve committed consent. Competing drafts for the same unit are obsolete.
      const competing = await tx.resolutionItem.findMany({ where: { departmentId, occurrenceId: { in: replacedIds }, id: { notIn: itemIds }, status: { not: "PUBLISHED" } } });
      for (const item of competing) await invalidateItemConsent(tx, departmentId, actorId, item.id, null, new Date());
      const allocationIds = [...new Set(preview.changes.map(c => c.after.allocationId))];
      const allocations = await tx.courseAllocation.findMany({ where: { departmentId, id: { in: allocationIds } }, select: { semesterId: true } });
      await tx.semester.updateMany({ where: { departmentId, id: { in: [...new Set(allocations.map(a => a.semesterId))] } }, data: { scheduleRevision: { increment: 1 } } });
      await tx.auditEvent.create({ data: { departmentId, actorId, action: "RESOLUTION_PUBLISHED", entityId: publication.id, before: { revision: preview.revision, changes: preview.changes.map(c => c.before) } as unknown as Prisma.InputJsonValue, after: { revision: preview.revision + 1, changes: preview.changes.map(c => c.after), unresolvedIds: preview.unresolved.map(a => a.occurrenceId) } as unknown as Prisma.InputJsonValue } });
      await tx.notification.createMany({ data: preview.recipients.map(r => ({ departmentId, recipientId: r.id, changeId: publication.id, message: `Schedule recovery published: ${preview.selectedCount} changes. View your timetable for current teacher, time and room. Delivery remains pending.` })) });
      // Recheck time at the end of the transaction as well as after lock acquisition.
      if (preview.changes.some(c => instant(c.after.date, c.after.startMinute) <= new Date())) throw new ScheduleError("STALE_VERSION", "A selected class started while publishing. Nothing committed; recompute.");
      const result: PublicationResult = { ok: true, publicationId: publication.id, revision: preview.revision + 1, message: `Published ${preview.selectedCount} changes. ${preview.unresolved.length} unresolved classes need recomputation. Required minutes and delivery are unchanged.` };
      await tx.mutationReceipt.create({ data: { id: command.requestId, departmentId, actorId, fingerprint, result: result as Prisma.InputJsonValue } });
      return result;
    }, command.operation === "preview" ? { isolationLevel: "RepeatableRead", timeout: 30000 } : { timeout: 30000, maxWait: 10000 });
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, code: error.code, message: error.code === "UNAUTHORIZED" ? "Sign in with an active account." : "You cannot publish this resolution plan." };
    if (error instanceof z.ZodError) return { ok: false, code: "VALIDATION_ERROR", message: "Select saved classes and check the preview fields and meeting links." };
    if (error instanceof ScheduleError) return { ok: false, code: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2004", "P2010", "P2034"].includes(error.code)) return { ok: false, code: "CONFLICT", message: "Another scheduling change won. Nothing was partially published. Recompute and preview again." };
    console.error("Publication failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, code: "ERROR", message: "Could not publish. No partial change committed. Your selections are retained; retry or recompute." };
  }
}
