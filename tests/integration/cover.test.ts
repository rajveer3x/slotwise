import "dotenv/config";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { getDb } from "../../src/server/db";
import { changeCover, readCoverWorkspace } from "../../src/server/services/covers";
import { changeResolution, readResolutionWorkspace } from "../../src/server/services/resolutions";
import { assertExactConsent, consentFingerprint } from "../../src/server/services/consent-store";
import { candidateId, type Candidate } from "../../src/domain/resolution/engine";
import type { Board } from "../../src/features/resolutions/schema";
import type { CoverResult } from "../../src/features/covers/schema";
import { coverFixture, saturdayOnly } from "../support/cover-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
type Fixture = Awaited<ReturnType<typeof coverFixture>>;
async function fixture(run: (f: Fixture) => Promise<void>) { const f = await coverFixture(db); try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); } }
function good(r: CoverResult) { assert.equal(r.ok, true, JSON.stringify(r)); return r.id!; }
async function board(f: Fixture, actor = f.coordinator.id) { return (await readResolutionWorkspace(actor, f.leaveId)).board!; }
async function save(f: Fixture, b: Board, selected: Record<string, string>, actor = f.coordinator.id) {
  const r = await changeResolution(actor, { operation: "save", leaveId: f.leaveId, decisions: { ...b.decisions, selected }, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() });
  assert.ok(r.ok, JSON.stringify(r)); return r.board!;
}
function invitation(f: Fixture, b: Board, operation = "invite") { const item = b.items[0]; return { operation, leaveId: f.leaveId, occurrenceId: item.original.occurrenceId, candidateId: item.selected!.id, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID(), ...(operation === "request-exception" ? { reason: "Synthetic: earlier tiers exhausted; recover required teaching." } : {}) }; }
async function invite(f: Fixture, actor = f.coordinator.id, candidateIndex = 0) {
  const b = await board(f, actor), item = b.items[0]; assert.equal(item.tier, 1);
  const saved = await save(f, b, { [item.original.occurrenceId]: item.candidates[candidateIndex].id }, actor);
  const id = good(await changeCover(actor, invitation(f, saved)));
  return { id, saved, candidate: saved.items[0].selected!, invited: await db.substitutionRequest.findUniqueOrThrow({ where: { id } }) };
}
function response(id: string, operation = "accept") { return { operation, id, requestId: randomUUID() }; }
async function schedulingState(f: Fixture) {
  return { classes: await db.classOccurrence.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } }), reservations: await db.resourceReservation.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } }), semester: await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } }), obligations: await db.teachingObligation.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } }) };
}
test("authorized exact invitation/acceptance is durable, retry-safe, audited and notified without changing teaching", () => fixture(async f => {
  const before = await schedulingState(f), r = await invite(f), command = response(r.id);
  assert.equal(r.invited.expiresAt.getTime() - r.invited.createdAt.getTime(), 86400000);
  assert.equal(r.invited.candidateFingerprint, consentFingerprint(r.candidate.id));
  const results = await Promise.all([changeCover(r.invited.invitedUserId, command), changeCover(r.invited.invitedUserId, command)]); results.forEach(good); assert.deepEqual(results[0], results[1]);
  assert.equal((await db.substitutionRequest.findUniqueOrThrow({ where: { id: r.id } })).status, "ACCEPTED");
  const itemId = r.saved.savedSelections[r.candidate.assignments[0].occurrenceId].itemId;
  await db.$transaction(tx => assertExactConsent(tx, f.departmentId, itemId, r.candidate));
  assert.equal(await db.auditEvent.count({ where: { departmentId: f.departmentId, action: "COVER_ACCEPTED" } }), 1);
  assert.equal(await db.notification.count({ where: { departmentId: f.departmentId, changeId: `${r.id}:COVER_ACCEPTED` } }), 2);
  const read = await readCoverWorkspace(r.invited.invitedUserId); assert.equal(read.covers[0].status, "ACCEPTED"); assert.equal(read.covers[0].canRespond, false); assert.ok(read.notifications.length);
  assert.ok(!JSON.stringify(read).includes("Private browser resolution reason")); assert.ok(!JSON.stringify(read).includes("passwordHash"));
  assert.deepEqual(await schedulingState(f), before);
  assert.equal((await changeCover(r.invited.invitedUserId, { ...command, operation: "decline" })).code, "CONFLICT");
}));
test("direct mutation/read authorization covers ownership, roles, department, revoked access and strict client shapes", () => fixture(async f => {
  const r = await invite(f), command = response(r.id), other = f.substitutes.find(x => x.user.id !== r.invited.invitedUserId)!;
  for (const id of [f.teacher.id, f.hod.id, f.admin.id, f.coordinator.id, f.student.id, other.user.id]) assert.equal((await changeCover(id, command)).code, "FORBIDDEN");
  assert.equal((await changeCover(null, command)).code, "UNAUTHORIZED");
  await assert.rejects(readCoverWorkspace(null), /UNAUTHORIZED/); await assert.rejects(readCoverWorkspace(f.student.id), /FORBIDDEN/);
  assert.deepEqual((await readCoverWorkspace(other.user.id)).covers, []);
  const foreign = await coverFixture(db);
  try { assert.equal((await changeCover(foreign.substitutes[0].user.id, command)).code, "FORBIDDEN"); assert.deepEqual((await readCoverWorkspace(foreign.coordinator.id)).covers, []); }
  finally { await cleanupTimetable(db, foreign.departmentId); }
  assert.equal((await changeCover(r.invited.invitedUserId, { ...command, invitedUserId: r.invited.invitedUserId })).code, "VALIDATION_ERROR");
  assert.equal((await changeCover(f.admin.id, response(r.id, "cancel-cover"))).code, "FORBIDDEN");
  await db.user.update({ where: { id: r.invited.invitedUserId }, data: { active: false } });
  assert.equal((await changeCover(r.invited.invitedUserId, command)).code, "UNAUTHORIZED");
  await assert.rejects(readCoverWorkspace(r.invited.invitedUserId), /UNAUTHORIZED/);
}));
test("server read derives expiry without a worker; exact deadline rejects response and advances recomputation preserving history", () => fixture(async f => {
  const r = await invite(f), deadline = new Date();
  await db.substitutionRequest.update({ where: { id: r.id }, data: { createdAt: new Date(deadline.getTime() - 1000), expiresAt: deadline } });
  assert.equal((await readCoverWorkspace(r.invited.invitedUserId)).covers[0].status, "EXPIRED");
  assert.equal((await db.substitutionRequest.findUniqueOrThrow({ where: { id: r.id } })).status, "PENDING");
  const result = await changeCover(r.invited.invitedUserId, response(r.id)); assert.equal(result.code, "EXPIRED");
  assert.equal((await db.substitutionRequest.findUniqueOrThrow({ where: { id: r.id } })).status, "EXPIRED");
  const b = await board(f); assert.notEqual(b.items[0].candidates[0].id, r.candidate.id); assert.ok(b.items[0].rejections.some(x => x.reason?.includes("expired"))); assert.equal(b.history[0].status, "EXPIRED");
  assert.equal((await changeCover(f.coordinator.id, invitation(f, r.saved))).code, "STALE_VERSION");
}));
test("time is taken after acquiring the department lock, so a waiting response cannot cross its deadline", () => fixture(async f => {
  const r = await invite(f);
  let release!: () => void, ready!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), locked = new Promise<void>(resolve => { ready = resolve; });
  const locker = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${f.departmentId} FOR UPDATE`; ready(); await held; });
  await locked;
  await db.substitutionRequest.update({ where: { id: r.id }, data: { expiresAt: new Date(Date.now() + 250) } });
  const acceptance = changeCover(r.invited.invitedUserId, response(r.id));
  await new Promise(resolve => setTimeout(resolve, 350)); release(); await locker;
  assert.equal((await acceptance).code, "EXPIRED");
}));
test("accept/decline race commits one final state", () => fixture(async f => {
  const first = await invite(f);
  const results = await Promise.all([changeCover(first.invited.invitedUserId, response(first.id)), changeCover(first.invited.invitedUserId, response(first.id, "decline"))]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.code === "CONFLICT").length, 1);
}));
test("competing invitations have exactly one accepted winner across independently owned drafts", () => fixture(async f => {
  const next = await invite(f), other = await invite(f, f.admin.id, 1);
  const competing = await Promise.all([changeCover(next.invited.invitedUserId, response(next.id)), changeCover(other.invited.invitedUserId, response(other.id))]);
  assert.equal(competing.filter(r => r.ok).length, 1); assert.equal(competing.filter(r => r.code === "CONFLICT").length, 1);
  assert.equal(await db.substitutionRequest.count({ where: { departmentId: f.departmentId, status: "ACCEPTED" } }), 1);
  assert.equal(await db.substitutionRequest.count({ where: { departmentId: f.departmentId, status: "PENDING" } }), 0);
}));
test("decline moves to the next eligible faculty then later tiers; server response exclusions cannot be restored by client decisions", () => fixture(async f => {
  const first = await invite(f); good(await changeCover(first.invited.invitedUserId, response(first.id, "decline")));
  const b = await board(f); assert.equal(b.items[0].tier, 1); assert.notEqual(b.items[0].candidates[0].id, first.candidate.id);
  const next = await invite(f); good(await changeCover(next.invited.invitedUserId, response(next.id, "decline")));
  const later = await board(f); assert.ok(later.items[0].tier! > 1); assert.equal(later.history.filter(h => h.status === "DECLINED").length, 2);
  await save(f, later, {});
  assert.equal(await db.substitutionRequest.count({ where: { departmentId: f.departmentId } }), 2);
  const restored = await changeResolution(f.coordinator.id, { operation: "compute", leaveId: f.leaveId, decisions: { selected: { [first.candidate.assignments[0].occurrenceId]: first.candidate.id }, rejected: {} }, expectedToken: later.token, expectedVersion: later.planVersion, requestId: randomUUID() });
  assert.ok(restored.board!.items[0].selectionError);
}));
test("current qualification, availability and candidate changes reject acceptance; changed saved candidates revoke existing consent", () => fixture(async f => {
  const first = await invite(f), invitedFaculty = f.substitutes.find(x => x.user.id === first.invited.invitedUserId)!.faculty;
  await db.facultyQualification.updateMany({ where: { facultyId: invitedFaculty.id }, data: { archived: true } });
  assert.equal((await changeCover(first.invited.invitedUserId, response(first.id))).code, "STALE_VERSION");
  await db.facultyQualification.updateMany({ where: { facultyId: invitedFaculty.id }, data: { archived: false } });
  await db.facultyAvailability.updateMany({ where: { facultyId: invitedFaculty.id }, data: { archived: true } });
  assert.equal((await changeCover(first.invited.invitedUserId, response(first.id))).code, "STALE_VERSION");
  await db.facultyAvailability.updateMany({ where: { facultyId: invitedFaculty.id }, data: { archived: false } });
  good(await changeCover(first.invited.invitedUserId, response(first.id)));
  const b = await board(f), alternate = b.items[0].candidates.find(c => c.id !== first.candidate.id)!;
  const saved = await save(f, b, { [b.items[0].original.occurrenceId]: alternate.id });
  assert.equal((await db.substitutionRequest.findUniqueOrThrow({ where: { id: first.id } })).status, "CANCELLED");
  const itemId = saved.savedSelections[b.items[0].original.occurrenceId].itemId;
  assert.equal(itemId, first.saved.savedSelections[b.items[0].original.occurrenceId].itemId);
  await assert.rejects(db.$transaction(tx => assertExactConsent(tx, f.departmentId, itemId, alternate)), /needs an accepted/);
  // Even retaining an old ID with changed time/room/faculty cannot satisfy the exact guard.
  for (const patch of [{ roomId: f.room2.id }, { startMinute: 600 }, { facultyId: f.faculty.id }]) {
    const candidate: Candidate = { ...first.candidate, assignments: [{ ...first.candidate.assignments[0], ...patch }] };
    await assert.rejects(db.$transaction(tx => assertExactConsent(tx, f.departmentId, itemId, candidate)), /changed/);
  }
  assert.equal(await db.substitutionRequest.count({ where: { departmentId: f.departmentId } }), 1);
}));
test("Saturday request includes failed tiers; only a different scoped HoD approves an exact candidate with a required reason", () => fixture(async f => {
  await saturdayOnly(db, f); const before = await schedulingState(f);
  const b = await board(f); assert.equal(b.items[0].tier, 5);
  const saved = await save(f, b, { [b.items[0].original.occurrenceId]: b.items[0].candidates[0].id });
  const command = invitation(f, saved, "request-exception"), id = good(await changeCover(f.coordinator.id, command));
  const view = await readCoverWorkspace(f.hod.id); assert.equal(view.exceptions[0].canReview, true); assert.ok(view.exceptions[0].earlierTiers!.length);
  for (const actor of [f.admin.id, f.coordinator.id, f.teacher.id]) assert.equal((await changeCover(actor, { operation: "approve-exception", id, reason: "Reviewed", requestId: randomUUID() })).code, "FORBIDDEN");
  assert.equal((await changeCover(f.hod.id, { operation: "approve-exception", id, reason: " ", requestId: randomUUID() })).code, "VALIDATION_ERROR");
  const approval = { operation: "approve-exception", id, reason: "All earlier tiers exhausted; exact Saturday is acceptable in this synthetic demo.", requestId: randomUUID() };
  const results = await Promise.all([changeCover(f.hod.id, approval), changeCover(f.hod.id, approval)]); results.forEach(good); assert.deepEqual(results[0], results[1]);
  const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: id, action: "SATURDAY_APPROVED" } });
  assert.equal((audit.after as { reason: string }).reason, approval.reason);
  const candidate = saved.items[0].selected!, itemId = saved.savedSelections[b.items[0].original.occurrenceId].itemId;
  await db.$transaction(tx => assertExactConsent(tx, f.departmentId, itemId, candidate));
  for (const patch of [{ date: "2099-01-17" }, { roomId: f.room2.id }, { facultyId: f.substitutes[0].faculty.id }]) {
    const assignments = [{ ...candidate.assignments[0], ...patch }];
    await assert.rejects(db.$transaction(tx => assertExactConsent(tx, f.departmentId, itemId, { ...candidate, id: candidateId(5, assignments), assignments })), /changed/);
  }
  const alternate = (await board(f)).items[0].candidates.find(c => c.id !== candidate.id)!;
  await save(f, await board(f), { [b.items[0].original.occurrenceId]: alternate.id });
  assert.equal((await db.saturdayException.findUniqueOrThrow({ where: { id } })).status, "CANCELLED");
  await assert.rejects(db.$transaction(tx => assertExactConsent(tx, f.departmentId, itemId, alternate)), /needs HoD approval/);
  assert.deepEqual(await schedulingState(f), before);
}));
test("HoD own-leave exceptions need a different HoD; no eligible approver is explicit, and self approval remains forbidden", () => fixture(async f => {
  await saturdayOnly(db, f);
  await db.user.update({ where: { id: f.teacher.id }, data: { role: "HOD" } });
  await db.user.update({ where: { id: f.hod.id }, data: { active: false } });
  const b = await board(f), saved = await save(f, b, { [b.items[0].original.occurrenceId]: b.items[0].candidates[0].id });
  assert.equal((await changeCover(f.coordinator.id, invitation(f, saved, "request-exception"))).code, "CONFLICT");
  await db.user.update({ where: { id: f.hod.id }, data: { active: true } });
  const id = good(await changeCover(f.coordinator.id, invitation(f, saved, "request-exception")));
  assert.equal((await readCoverWorkspace(f.teacher.id)).exceptions[0].canReview, false);
  assert.equal((await changeCover(f.teacher.id, { operation: "approve-exception", id, reason: "Own leave", requestId: randomUUID() })).code, "FORBIDDEN");
  // A requester subsequently made HoD still cannot approve their own submitted exception.
  await db.user.update({ where: { id: f.coordinator.id }, data: { role: "HOD" } });
  assert.equal((await changeCover(f.coordinator.id, { operation: "approve-exception", id, reason: "Own request", requestId: randomUUID() })).code, "FORBIDDEN");
}));
test("failed audit rolls back acceptance, notifications and receipt; concurrent Saturday decisions have one final winner", () => fixture(async f => {
  const r = await invite(f), command = response(r.id), name = `cover_failure_${randomUUID().replaceAll("-", "")}`;
  const notifications = await db.notification.count({ where: { departmentId: f.departmentId } });
  await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ADD CONSTRAINT "${name}" CHECK (NOT ("departmentId" = '${f.departmentId}' AND action = 'COVER_ACCEPTED')) NOT VALID`);
  try {
    assert.equal((await changeCover(r.invited.invitedUserId, command)).ok, false);
    assert.equal((await db.substitutionRequest.findUniqueOrThrow({ where: { id: r.id } })).status, "PENDING");
    assert.equal(await db.notification.count({ where: { departmentId: f.departmentId } }), notifications);
    assert.equal(await db.mutationReceipt.count({ where: { id: command.requestId } }), 0);
  } finally { await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DROP CONSTRAINT "${name}"`); }
  good(await changeCover(r.invited.invitedUserId, command));
  good(await changeCover(f.coordinator.id, response(r.id, "cancel-cover")));
  await saturdayOnly(db, f);
  const b = await board(f), saved = await save(f, b, { [b.items[0].original.occurrenceId]: b.items[0].candidates[0].id });
  const id = good(await changeCover(f.coordinator.id, invitation(f, saved, "request-exception")));
  const decisions = await Promise.all(["approve-exception", "reject-exception"].map(operation => changeCover(f.hod.id, { operation, id, reason: "Synthetic decision", requestId: randomUUID() })));
  assert.equal(decisions.filter(r => r.ok).length, 1); assert.equal(decisions.filter(r => r.code === "CONFLICT").length, 1);
}));
test("draft retries with pending response history return identical JSON; saving unchanged choices retains live consent", () => fixture(async f => {
  const r = await invite(f), b = await board(f);
  const command = { operation: "save", leaveId: f.leaveId, decisions: b.decisions, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() };
  const saved = await changeResolution(f.coordinator.id, command), retry = await changeResolution(f.coordinator.id, command);
  assert.ok(saved.ok); assert.deepEqual(saved, retry);
  assert.equal((await db.substitutionRequest.findUniqueOrThrow({ where: { id: r.id } })).status, "PENDING");
  good(await changeCover(r.invited.invitedUserId, response(r.id)));
  await save(f, await board(f), {});
  const again = await save(f, await board(f), { [r.candidate.assignments[0].occurrenceId]: r.candidate.id });
  await assert.rejects(db.$transaction(tx => assertExactConsent(tx, f.departmentId, again.savedSelections[r.candidate.assignments[0].occurrenceId].itemId, r.candidate)), /needs an accepted/);
}));
test("Saturday rejection advances exact alternatives, stale eligibility blocks approval and foreign HoD cannot review", () => fixture(async f => {
  await saturdayOnly(db, f);
  const b = await board(f), saved = await save(f, b, { [b.items[0].original.occurrenceId]: b.items[0].candidates[0].id });
  const id = good(await changeCover(f.coordinator.id, invitation(f, saved, "request-exception")));
  const decision = { operation: "approve-exception", id, reason: "Synthetic review", requestId: randomUUID() };
  const foreign = await coverFixture(db);
  try { assert.equal((await changeCover(foreign.hod.id, decision)).code, "FORBIDDEN"); assert.equal((await readCoverWorkspace(foreign.hod.id)).exceptions.length, 0); }
  finally { await cleanupTimetable(db, foreign.departmentId); }
  await db.room.update({ where: { id: saved.items[0].selected!.assignments[0].roomId! }, data: { archived: true } });
  assert.equal((await changeCover(f.hod.id, decision)).code, "STALE_VERSION");
  await db.room.update({ where: { id: saved.items[0].selected!.assignments[0].roomId! }, data: { archived: false } });
  good(await changeCover(f.hod.id, { ...decision, operation: "reject-exception", reason: "Synthetic room/time unsuitable for Saturday." }));
  const next = await board(f); assert.notEqual(next.items[0].candidates[0].id, saved.items[0].selected!.id); assert.equal(next.history[0].status, "REJECTED");
  assert.ok(next.items[0].rejections.some(r => r.reason?.includes("Synthetic room/time")));
}));
test("database uniqueness independently forbids accepted competing obligations; invitation endpoint requires a saved owned selection", () => fixture(async f => {
  const b = await board(f), selected = b.items[0].candidates[0];
  const forged = { operation: "invite", leaveId: f.leaveId, occurrenceId: b.items[0].original.occurrenceId, candidateId: selected.id, expectedVersion: 1, expectedToken: b.token, requestId: randomUUID() };
  for (const actor of [f.teacher.id, f.hod.id, f.student.id]) assert.equal((await changeCover(actor, forged)).code, "FORBIDDEN");
  assert.equal((await changeCover(f.coordinator.id, forged)).code, "FORBIDDEN");
  const r = await invite(f), other = await invite(f, f.admin.id, 1);
  good(await changeCover(r.invited.invitedUserId, response(r.id)));
  await assert.rejects(db.substitutionRequest.update({ where: { id: other.id }, data: { status: "ACCEPTED", respondedAt: new Date(), closedAt: new Date() } }), (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "P2002");
  assert.equal(await db.substitutionRequest.count({ where: { departmentId: f.departmentId, status: "ACCEPTED" } }), 1);
}));
