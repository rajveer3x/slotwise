import "dotenv/config";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { getDb } from "../../src/server/db";
import { changeLeave, readLeaveImpact } from "../../src/server/services/leave";
import { changeResolution, readResolutionWorkspace } from "../../src/server/services/resolutions";
import { timetableFixture, cleanupTimetable } from "../support/timetable-fixture";
import { publishFixture } from "../support/leave-fixture";
import type { Board, ResolutionResult } from "../../src/features/resolutions/schema";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
type Fixture = Awaited<ReturnType<typeof timetableFixture>> & { leaveId: string };
async function fixture(run: (f: Fixture) => Promise<void>) {
  const f = await timetableFixture(db);
  try {
    await publishFixture(f);
    const submitted = await changeLeave(f.teacher.id, { operation: "submit", requestId: randomUUID(), semesterId: f.semester.id, startDate: "2099-01-05", endDate: "2099-01-05", privateReason: "Private resolution test reason" }); assert.ok(submitted.ok);
    const approved = await changeLeave(f.hod.id, { operation: "approve", requestId: randomUUID(), leaveId: submitted.leaveId, expectedVersion: 1 }); assert.ok(approved.ok);
    await run({ ...f, leaveId: submitted.leaveId! });
  } finally { await cleanupTimetable(db, f.departmentId); }
}
function good(r: ResolutionResult) { assert.equal(r.ok, true, JSON.stringify(r)); return r.board!; }
async function board(f: Fixture, actorId = f.coordinator.id) { return (await readResolutionWorkspace(actorId, f.leaveId)).board!; }
function command(f: Fixture, b: Board, operation = "save") { return { operation, leaveId: f.leaveId, decisions: b.decisions, expectedVersion: b.planVersion, expectedToken: b.token, requestId: randomUUID() }; }
function selectFirst(b: Board) { return { selected: { [b.items[0].original.occurrenceId]: b.items[0].candidates[0].id }, rejected: {} }; }
async function scheduleState(f: Fixture) {
  return { occurrences: await db.classOccurrence.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } }), reservations: await db.resourceReservation.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } }), obligations: await db.teachingObligation.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } }), semester: await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } }) };
}
test("read-only board/compute and durable draft capture policy/revisions without changing teaching or reserving resources; exact retries", () => fixture(async f => {
  const before = await scheduleState(f), b = await board(f);
  assert.equal(b.items.length, 2); assert.ok(b.items.every(i => i.tier === 3)); assert.ok(!JSON.stringify(b).includes("Private resolution test reason"));
  const computed = good(await changeResolution(f.coordinator.id, { ...command(f, b, "compute"), decisions: selectFirst(b) }));
  assert.equal(await db.resolutionPlan.count({ where: { departmentId: f.departmentId } }), 0);
  assert.equal(computed.items.filter(i => i.selected).length, 1);
  const save = command(f, computed);
  const responses = await Promise.all([changeResolution(f.coordinator.id, save), changeResolution(f.coordinator.id, save)]); responses.forEach(good); assert.deepEqual(responses[0], responses[1]);
  const stored = await db.resolutionPlan.findFirstOrThrow({ where: { departmentId: f.departmentId }, include: { items: true } });
  assert.equal(stored.ownerId, f.coordinator.id); assert.equal(stored.baseScheduleRevision, 2); assert.equal(stored.status, "DRAFT"); assert.equal(stored.version, 1); assert.equal(stored.items.length, 2);
  assert.equal((stored.policySnapshot as { version: string }).version, "demo-v1"); assert.deepEqual(stored.revisionSnapshot, b.revisions);
  assert.equal((await board(f)).decisions.selected[b.items[0].original.occurrenceId], b.items[0].candidates[0].id);
  assert.deepEqual(await scheduleState(f), before);
  assert.equal(await db.auditEvent.count({ where: { departmentId: f.departmentId, action: "RESOLUTION_DRAFT_SAVED" } }), 1);
  assert.equal((await changeResolution(f.coordinator.id, { ...save, expectedVersion: 20 })).code, "CONFLICT");
}));
test("draft service enforces direct role, department and entity scope without leaking private leave reasons", () => fixture(async f => {
  const b = await board(f), input = command(f, b);
  for (const id of [f.teacher.id, f.student.id, f.hod.id]) {
    assert.equal((await changeResolution(id, input)).code, "FORBIDDEN");
    await assert.rejects(readResolutionWorkspace(id, f.leaveId), /FORBIDDEN/);
  }
  assert.equal((await changeResolution(null, input)).code, "UNAUTHORIZED");
  await assert.rejects(readResolutionWorkspace(null), /UNAUTHORIZED/);
  const foreign = await timetableFixture(db);
  try { assert.equal((await changeResolution(foreign.coordinator.id, input)).code, "FORBIDDEN"); await assert.rejects(readResolutionWorkspace(foreign.coordinator.id, f.leaveId), /FORBIDDEN/); }
  finally { await cleanupTimetable(db, foreign.departmentId); }
  assert.equal((await changeResolution(f.coordinator.id, { ...input, decisions: { selected: { forged: b.items[0].candidates[0].id }, rejected: {} } })).code, "VALIDATION_ERROR");
  assert.equal((await changeResolution(f.coordinator.id, { ...input, ownerId: f.admin.id })).code, "VALIDATION_ERROR");
  await db.user.update({ where: { id: f.coordinator.id }, data: { active: false } });
  assert.equal((await changeResolution(f.coordinator.id, input)).code, "UNAUTHORIZED");
}));
test("draft ownership is isolated even between authorized staff and independently versioned", () => fixture(async f => {
  const b = await board(f);
  good(await changeResolution(f.coordinator.id, { ...command(f, b), decisions: selectFirst(b) }));
  const adminBoard = await board(f, f.admin.id); assert.equal(adminBoard.planVersion, 0); assert.deepEqual(adminBoard.decisions.selected, {});
  good(await changeResolution(f.admin.id, command(f, adminBoard)));
  assert.equal(await db.resolutionPlan.count({ where: { departmentId: f.departmentId } }), 2);
  assert.equal(Object.keys((await board(f)).decisions.selected).length, 1);
}));
test("concurrent different edits have one winner, unchanged schedule, no lost updates; schedule revisions require recomputation", () => fixture(async f => {
  const b = await board(f), before = await scheduleState(f);
  const results = await Promise.all([changeResolution(f.coordinator.id, { ...command(f, b), decisions: selectFirst(b) }), changeResolution(f.coordinator.id, command(f, b))]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.code === "STALE_VERSION").length, 1);
  assert.deepEqual(await scheduleState(f), before);
  const current = await board(f);
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  assert.equal((await changeResolution(f.coordinator.id, command(f, current))).code, "STALE_VERSION");
  assert.equal((await board(f)).stale, true);
  const fresh = good(await changeResolution(f.coordinator.id, command(f, current, "compute")));
  assert.equal(fresh.revision, 3); good(await changeResolution(f.coordinator.id, command(f, fresh)));
}));
test("both selected items competing for the same resource are rejected atomically; explicit rejections need reasons", () => fixture(async f => {
  const b = await board(f), selected = Object.fromEntries(b.items.map(i => [i.original.occurrenceId, i.candidates[0].id]));
  assert.equal((await changeResolution(f.coordinator.id, { ...command(f, b), decisions: { selected, rejected: {} } })).code, "CONFLICT");
  assert.equal(await db.resolutionPlan.count({ where: { departmentId: f.departmentId } }), 0);
  assert.equal((await changeResolution(f.coordinator.id, { ...command(f, b), decisions: { selected: {}, rejected: { [b.items[0].original.occurrenceId]: [{ candidateId: b.items[0].candidates[0].id, reason: " " }] } } })).code, "VALIDATION_ERROR");
  const rejection = { candidateId: b.items[0].candidates[0].id, reason: "Synthetic timing preference" };
  const computed = good(await changeResolution(f.coordinator.id, { ...command(f, b, "compute"), decisions: { selected: {}, rejected: { [b.items[0].original.occurrenceId]: [rejection] } } }));
  good(await changeResolution(f.coordinator.id, command(f, computed)));
  assert.deepEqual((await board(f)).decisions.rejected[b.items[0].original.occurrenceId], [rejection]);
}));
test("failed audit rolls back plan, items and receipt together", () => fixture(async f => {
  const b = await board(f), input = command(f, b), name = `resolution_failure_${randomUUID().replaceAll("-", "")}`;
  await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ADD CONSTRAINT "${name}" CHECK (NOT ("departmentId" = '${f.departmentId}' AND action = 'RESOLUTION_DRAFT_SAVED')) NOT VALID`);
  try { assert.equal((await changeResolution(f.coordinator.id, input)).ok, false); assert.equal(await db.resolutionPlan.count({ where: { departmentId: f.departmentId } }), 0); assert.equal(await db.mutationReceipt.count({ where: { id: input.requestId } }), 0); }
  finally { await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DROP CONSTRAINT "${name}"`); }
  good(await changeResolution(f.coordinator.id, input));
}));
test("faculty estimates are provisional, batch-aware, private and read-only", () => fixture(async f => {
  // Preview a later active Monday with hypothetical full-day absence.
  const before = await scheduleState(f);
  const result = await readLeaveImpact(f.teacher.id, { semesterId: f.semester.id, startDate: "2099-01-19", endDate: "2099-01-19" });
  assert.equal(result.ok, true); assert.equal(result.impact?.classes.length, 2); assert.equal(result.impact?.coverage?.possible, 2); assert.equal(result.impact?.coverage?.unresolved, 0);
  assert.ok(!JSON.stringify(result).includes("passwordHash")); assert.ok(!JSON.stringify(result.impact?.coverage).includes("facultyId"));
  assert.deepEqual(await scheduleState(f), before);
}));
test("zero impact produces an empty board and unresolved alternatives never invent a selection", () => fixture(async f => {
  await db.facultyAvailability.updateMany({ where: { departmentId: f.departmentId }, data: { archived: true } });
  const b = await board(f); assert.ok(b.items.every(i => !i.candidates.length && i.unresolvedReason && !i.selected));
  good(await changeResolution(f.coordinator.id, command(f, b)));
  const empty = await changeLeave(f.teacher.id, { operation: "submit", requestId: randomUUID(), semesterId: f.semester.id, startDate: "2099-01-07", endDate: "2099-01-07", privateReason: "" }); assert.ok(empty.ok);
  assert.ok((await changeLeave(f.hod.id, { operation: "approve", requestId: randomUUID(), leaveId: empty.leaveId, expectedVersion: 1 })).ok);
  assert.deepEqual((await readResolutionWorkspace(f.coordinator.id, empty.leaveId)).board!.items, []);
}));
