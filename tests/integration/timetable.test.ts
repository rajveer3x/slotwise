import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../src/server/db";
import { changeTimetable, readTimetable } from "../../src/server/services/timetable";
import { changeMasterData } from "../../src/server/services/master-data";
import { timetableFixture, cleanupTimetable } from "../support/timetable-fixture";
import type { ScheduleResult } from "../../src/features/timetable/schema";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
type Fixture = Awaited<ReturnType<typeof timetableFixture>>;
after(() => db.$disconnect());
async function fixture(run: (f: Fixture) => Promise<void>) { const f = await timetableFixture(db); try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); } }
function good(result: ScheduleResult) { assert.equal(result.ok, true, JSON.stringify(result)); return result; }
async function draft(f: Fixture, effectiveFrom = "2099-01-05", expectedRevision = 0) {
  const created = good(await changeTimetable(f.coordinator.id, { operation: "create", requestId: randomUUID(), semesterId: f.semester.id, expectedRevision, effectiveFrom }));
  return { draftId: created.draftId!, semesterId: f.semester.id, expectedVersion: 1, expectedRevision };
}
async function ready(f: Fixture) {
  const d = await draft(f);
  good(await changeTimetable(f.coordinator.id, { ...d, operation: "save", requestId: randomUUID(), effectiveFrom: "2099-01-05", entries: f.entries }));
  return { ...d, expectedVersion: 2 };
}
async function preview(f: Fixture, d: Awaited<ReturnType<typeof draft>>) { return good(await changeTimetable(f.coordinator.id, { ...d, operation: "preview", requestId: randomUUID() })).preview!; }
async function publish(f: Fixture, d: Awaited<ReturnType<typeof draft>>) { const p = await preview(f, d); return { ...d, operation: "publish", requestId: randomUUID(), previewFingerprint: p.fingerprint }; }

test("drafts reserve nothing; conflicts identify teacher/section/room, alternatives repair, and incomplete/invalid drafts cannot publish", () => fixture(async f => {
  const d = await draft(f);
  let result = await changeTimetable(f.coordinator.id, { ...d, operation: "preview", requestId: randomUUID() }); assert.equal(result.code, "CONFLICT");
  result = await changeTimetable(f.coordinator.id, { ...d, operation: "save", requestId: randomUUID(), effectiveFrom: "2099-01-05", entries: [f.entries[0], { ...f.entries[1], startMinute: 540, endMinute: 600 }] });
  assert.equal(result.code, "CONFLICT"); assert.equal(result.alternatives?.length, 3);
  for (const name of ["Teacher", "Section S1", "Room R1"]) assert.ok(result.conflicts?.some(c => c.message.includes(name)));
  assert.equal(await db.timetableEntry.count({ where: { timetableVersionId: d.draftId } }), 0);
  good(await changeTimetable(f.coordinator.id, { ...d, operation: "save", requestId: randomUUID(), effectiveFrom: "2099-01-05", entries: [f.entries[0], result.alternatives![0]] }));
  assert.equal(await db.resourceReservation.count({ where: { departmentId: f.departmentId } }), 0);
  const p = await preview(f, { ...d, expectedVersion: 2 }); assert.equal(p.count, 6); assert.equal(p.cancelledCount, 0);
  // Stored draft warnings are never trusted at publication time.
  await db.timetableEntry.updateMany({ where: { timetableVersionId: d.draftId, seriesId: f.entries[1].seriesId }, data: { startMinute: 540, endMinute: 600, roomId: f.room.id } });
  result = await changeTimetable(f.coordinator.id, { ...d, expectedVersion: 2, operation: "publish", requestId: randomUUID(), previewFingerprint: p.fingerprint }); assert.equal(result.code, "CONFLICT");
  assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId } }), 0);
}));
test("publication skips holidays, records pending delivery, audit and recipients; concurrent same-key retries create one result", () => fixture(async f => {
  const d = await ready(f), command = await publish(f, d);
  const results = await Promise.all([changeTimetable(f.coordinator.id, command), changeTimetable(f.coordinator.id, command)]); results.forEach(good); assert.deepEqual(results[0], results[1]);
  assert.equal(await db.teachingObligation.count({ where: { departmentId: f.departmentId } }), 6);
  const rows = await db.classOccurrence.findMany({ where: { departmentId: f.departmentId } }); assert.equal(rows.length, 6); assert.ok(rows.every(o => o.localDate !== "2099-01-12" && o.deliveryStatus === "PENDING"));
  assert.equal(await db.resourceReservation.count({ where: { departmentId: f.departmentId } }), 18);
  assert.equal(await db.auditEvent.count({ where: { departmentId: f.departmentId, action: "TIMETABLE_PUBLISHED" } }), 1);
  assert.equal(await db.notification.count({ where: { departmentId: f.departmentId } }), 5);
  assert.equal((await changeTimetable(f.coordinator.id, { ...command, previewFingerprint: "a".repeat(64) })).code, "CONFLICT");
  assert.equal((await changeTimetable(f.admin.id, command)).code, "CONFLICT");
  assert.equal((await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision, 1);
}));
test("distinct coordinators competing to publish the same interval yield one commit and one stale result", () => fixture(async f => {
  const first = await ready(f), second = await ready(f), one = await publish(f, first), two = await publish(f, second);
  const results = await Promise.all([changeTimetable(f.coordinator.id, one), changeTimetable(f.admin.id, two)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.code === "STALE_VERSION").length, 1, JSON.stringify(results));
  assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId } }), 6);
}));
test("PostgreSQL exclusion rejects overlaps independently and allows adjacent reservations", () => fixture(async f => {
  good(await changeTimetable(f.coordinator.id, await publish(f, await ready(f))));
  const rows = await db.classOccurrence.findMany({ where: { departmentId: f.departmentId, localDate: "2099-01-05" }, orderBy: { startAt: "asc" } });
  assert.equal(rows[0].endAt.getTime(), rows[1].startAt.getTime());
  await assert.rejects(db.$transaction(async tx => {
    await tx.resourceReservation.deleteMany({ where: { occurrenceId: rows[1].id, resourceType: "ROOM" } });
    await tx.resourceReservation.create({ data: { departmentId: f.departmentId, occurrenceId: rows[1].id, resourceType: "ROOM", resourceId: f.room.id, startAt: rows[0].startAt, endAt: rows[0].endAt } });
  }), /exclusion|resource_no_overlap|23P01/i);
  assert.equal(await db.resourceReservation.count({ where: { departmentId: f.departmentId } }), 18);
}));
test("a late transaction failure rolls back every publication effect, then the same request can succeed", () => fixture(async f => {
  const d = await ready(f), command = await publish(f, d);
  // A duplicate notification key forces failure after occurrences/reservations/audit
  // have been written. This is test-only fault injection, with no global trigger.
  await db.notification.create({ data: { departmentId: f.departmentId, recipientId: f.teacher.id, changeId: d.draftId, message: "Synthetic collision" } });
  const failed = await changeTimetable(f.coordinator.id, command); assert.equal(failed.ok, false);
  for (const count of [await db.classOccurrence.count({ where: { departmentId: f.departmentId } }), await db.teachingObligation.count({ where: { departmentId: f.departmentId } }), await db.resourceReservation.count({ where: { departmentId: f.departmentId } }), await db.auditEvent.count({ where: { departmentId: f.departmentId, action: "TIMETABLE_PUBLISHED" } })]) assert.equal(count, 0);
  assert.equal((await db.timetableVersion.findUniqueOrThrow({ where: { id: d.draftId } })).status, "DRAFT");
  assert.equal((await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision, 0);
  await db.notification.deleteMany({ where: { departmentId: f.departmentId } }); good(await changeTimetable(f.coordinator.id, command));
}));
test("prospective revisions retain delivered/history records and obligation identities; future resolutions block overwrites", () => fixture(async f => {
  good(await changeTimetable(f.coordinator.id, await publish(f, await ready(f))));
  const first = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, localDate: "2099-01-05" } });
  await db.classOccurrence.update({ where: { id: first.id }, data: { deliveryStatus: "HELD" } });
  const history = await db.classOccurrence.findUniqueOrThrow({ where: { id: first.id } });
  const before = await db.teachingObligation.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } });
  const d = await draft(f, "2099-01-19", 1);
  good(await changeTimetable(f.coordinator.id, { ...d, operation: "save", requestId: randomUUID(), effectiveFrom: "2099-01-19", entries: f.entries.map(p => ({ ...p, weekday: 2 })) })); d.expectedVersion = 2;
  good(await changeTimetable(f.coordinator.id, await publish(f, d)));
  assert.deepEqual(await db.classOccurrence.findUniqueOrThrow({ where: { id: first.id } }), history);
  assert.deepEqual(await db.teachingObligation.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } }), before);
  const future = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, localDate: "2099-01-20", schedulingStatus: "ACTIVE" } }); assert.ok(future.replacesId);
  await db.classOccurrence.update({ where: { id: future.id }, data: { resolved: true } });
  const blocked = await draft(f, "2099-01-19", 2);
  const result = await changeTimetable(f.coordinator.id, { ...blocked, operation: "preview", requestId: randomUUID() }); assert.equal(result.code, "CONFLICT"); assert.match(result.message, /resolutions/);
}));
test("midweek revisions do not duplicate a teaching unit before the effective boundary", () => fixture(async f => {
  good(await changeTimetable(f.coordinator.id, await publish(f, await ready(f))));
  const d = await draft(f, "2099-01-06", 1);
  good(await changeTimetable(f.coordinator.id, { ...d, operation: "save", requestId: randomUUID(), effectiveFrom: "2099-01-06", entries: f.entries.map(p => ({ ...p, weekday: 2 })) })); d.expectedVersion = 2;
  good(await changeTimetable(f.coordinator.id, await publish(f, d)));
  assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId, localDate: "2099-01-06" } }), 0);
  assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId, schedulingStatus: "ACTIVE", localDate: "2099-01-05" } }), 2);
}));
test("master-data edits cannot invalidate published schedules and harmless edits stale the preview", () => fixture(async f => {
  good(await changeTimetable(f.coordinator.id, await publish(f, await ready(f))));
  const d = await draft(f, "2099-01-19", 1), command = await publish(f, d);
  const saveRoom = (capacity: number) => changeMasterData(f.coordinator.id, { kind: "room", operation: "save", requestId: randomUUID(), id: f.room.id, expectedVersion: 1, data: { code: f.room.code, name: f.room.name, type: f.room.type, capacity } });
  assert.equal((await saveRoom(20)).code, "CONFLICT");
  assert.equal((await db.room.findUniqueOrThrow({ where: { id: f.room.id } })).capacity, 40);
  assert.equal((await changeMasterData(f.coordinator.id, { kind: "facultyQualification", operation: "archive", requestId: randomUUID(), id: (await db.facultyQualification.findFirstOrThrow({ where: { departmentId: f.departmentId } })).id, expectedVersion: 1 })).code, "CONFLICT");
  assert.equal((await changeMasterData(f.coordinator.id, { kind: "holiday", operation: "save", requestId: randomUUID(), data: { semesterId: f.semester.id, date: "2099-01-19", name: "Would cancel classes" } })).code, "CONFLICT");
  good(await saveRoom(45)); assert.equal((await changeTimetable(f.coordinator.id, command)).code, "STALE_VERSION");
}));
test("direct authorization, foreign IDs, student read scoping, revoked sessions and stale edits are enforced", () => fixture(async f => {
  const foreign = await timetableFixture(db);
  try {
    const d = await ready(f), command = await publish(f, d);
    for (const id of [f.teacher.id, f.student.id, f.hod.id]) assert.equal((await changeTimetable(id, command)).code, "FORBIDDEN");
    assert.equal((await changeTimetable(null, command)).code, "UNAUTHORIZED");
    assert.equal((await changeTimetable(foreign.admin.id, command)).code, "FORBIDDEN");
    assert.equal((await changeTimetable(f.coordinator.id, { ...command, operation: "save", entries: [f.entries[0], { ...f.entries[1], roomId: foreign.room.id }], effectiveFrom: "2099-01-05" })).code, "CONFLICT");
    await assert.rejects(readTimetable(f.student.id, foreign.semester.id), /FORBIDDEN/);
    await assert.rejects(readTimetable(null), /UNAUTHORIZED/);
    good(await changeTimetable(f.coordinator.id, command));
    const own = await readTimetable(f.student.id); assert.equal(own.occurrences.length, 6); assert.equal(own.data, null); assert.equal(own.drafts.length, 0); assert.ok(own.occurrences.every(o => o.sectionId === f.section.id));
    assert.equal((await readTimetable(f.outsider.id)).occurrences.length, 0);
    const edit = await draft(f, "2099-01-19", 1);
    const payload = { ...edit, operation: "save", requestId: randomUUID(), effectiveFrom: "2099-01-19", entries: f.entries };
    good(await changeTimetable(f.coordinator.id, payload));
    assert.equal((await changeTimetable(f.coordinator.id, { ...payload, requestId: randomUUID() })).code, "STALE_VERSION");
    await db.user.update({ where: { id: f.coordinator.id }, data: { active: false } });
    assert.equal((await changeTimetable(f.coordinator.id, payload)).code, "UNAUTHORIZED");
  } finally { await cleanupTimetable(db, foreign.departmentId); }
}));
test("publication rechecks actor after waiting on concurrent revocation", () => fixture(async f => {
  const command = await publish(f, await ready(f));
  let release!: () => void, locked!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; }), lockReady = new Promise<void>(resolve => { locked = resolve; });
  const revocation = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${f.coordinator.id} FOR UPDATE`; await tx.user.update({ where: { id: f.coordinator.id }, data: { active: false } }); locked(); await hold; });
  await lockReady; const publishing = changeTimetable(f.coordinator.id, command); release(); await revocation;
  assert.equal((await publishing).code, "UNAUTHORIZED"); assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId } }), 0);
}));
test("labs reject unsuitable rooms and split intervals in the real service, then publish consecutive slots", () => fixture(async f => {
  await db.course.update({ where: { id: f.allocations[0].courseId }, data: { type: "LAB" } });
  await db.courseAllocation.update({ where: { id: f.allocations[0].id }, data: { weeklyPeriods: 2 } });
  await db.courseAllocation.update({ where: { id: f.allocations[1].id }, data: { archived: true } });
  const d = await draft(f), save = (p: typeof f.entries[number]) => changeTimetable(f.coordinator.id, { ...d, operation: "save", requestId: randomUUID(), effectiveFrom: "2099-01-05", entries: [p] });
  assert.equal((await save({ ...f.entries[0], endMinute: 660 })).conflicts?.some(c => c.rule === "LAB"), true);
  assert.equal((await save({ ...f.entries[0], roomId: f.room2.id, endMinute: 840 })).conflicts?.some(c => c.rule === "SLOTS"), true);
  good(await save({ ...f.entries[0], roomId: f.room2.id, endMinute: 660 })); d.expectedVersion = 2;
  good(await changeTimetable(f.coordinator.id, await publish(f, d)));
  const reservations = await db.resourceReservation.findMany({ where: { departmentId: f.departmentId } }); assert.equal(reservations.length, 9); assert.ok(reservations.every(r => r.endAt.getTime() - r.startAt.getTime() === 120 * 60000));
}));
test("publications in different semesters still share resource and workload conflict protection", () => fixture(async f => {
  const first = await ready(f);
  const semester = await db.semester.create({ data: { departmentId: f.departmentId, code: "OVERLAPPING", name: "Overlapping synthetic semester", startDate: "2099-01-05", endDate: "2099-01-30" } });
  const section = await db.section.create({ data: { departmentId: f.departmentId, semesterId: semester.id, code: "S3", name: "New semester section", strength: 30, preferredPeriodsPerDay: 5 } });
  const allocation = await db.courseAllocation.create({ data: { departmentId: f.departmentId, semesterId: semester.id, sectionId: section.id, courseId: f.allocations[0].courseId, facultyId: f.faculty.id, weeklyPeriods: 1, requiredContactMinutes: 240 } });
  const other = { ...f, semester, entries: [{ ...f.entries[0], seriesId: randomUUID(), allocationId: allocation.id }] };
  const second = await ready(other), one = await publish(f, first), two = await publish(other, second);
  const results = await Promise.all([changeTimetable(f.coordinator.id, one), changeTimetable(f.admin.id, two)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.code === "CONFLICT").length, 1, JSON.stringify(results));
}));
test("a simultaneous room downgrade and publication serialize without invalid published capacity", () => fixture(async f => {
  const command = await publish(f, await ready(f));
  const [publishing, room] = await Promise.all([
    changeTimetable(f.coordinator.id, command),
    changeMasterData(f.admin.id, { operation: "save", requestId: randomUUID(), kind: "room", id: f.room.id, expectedVersion: 1, data: { code: f.room.code, name: f.room.name, type: "THEORY", capacity: 20 } }),
  ]);
  assert.equal([publishing, room].filter(r => r.ok).length, 1);
  if (publishing.ok) { assert.equal(room.code, "CONFLICT"); assert.equal((await db.room.findUniqueOrThrow({ where: { id: f.room.id } })).capacity, 40); }
  else { assert.equal(publishing.code, "STALE_VERSION"); assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId } }), 0); }
}));
