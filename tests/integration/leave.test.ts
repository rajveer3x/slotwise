import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../src/server/db";
import { changeLeave, readLeaveImpact, readLeaveWorkspace } from "../../src/server/services/leave";
import { changeTimetable, readTimetable } from "../../src/server/services/timetable";
import { changeMasterData } from "../../src/server/services/master-data";
import { localDate, instant } from "../../src/domain/scheduling/timetable";
import { timetableFixture, cleanupTimetable } from "../support/timetable-fixture";
import { publishFixture, addFaculty, type LeaveFixture } from "../support/leave-fixture";
import type { LeaveResult } from "../../src/features/leave/schema";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
after(() => db.$disconnect());
async function fixture(run: (f: LeaveFixture) => Promise<void>) { const f = await timetableFixture(db); try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); } }
function good(r: LeaveResult) { assert.equal(r.ok, true, JSON.stringify(r)); return r; }
const dates = (f: LeaveFixture, startDate = "2099-01-05", endDate = startDate) => ({ semesterId: f.semester.id, startDate, endDate });
const submit = (f: LeaveFixture, start = "2099-01-05", end = start) => ({ ...dates(f, start, end), operation: "submit", requestId: randomUUID(), privateReason: "Private synthetic medical reason" });
const decision = (id: string, operation = "approve") => ({ operation, requestId: randomUUID(), leaveId: id, expectedVersion: 1 });
async function counts(f: LeaveFixture) {
  const where = { departmentId: f.departmentId };
  return { occurrences: await db.classOccurrence.findMany({ where, orderBy: { id: "asc" } }), obligations: await db.teachingObligation.findMany({ where, orderBy: { id: "asc" } }), reservations: await db.resourceReservation.findMany({ where, orderBy: { id: "asc" } }), audits: await db.auditEvent.count({ where }), receipts: await db.mutationReceipt.count({ where }), requests: await db.leaveRequest.count({ where }), revision: (await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision };
}
test("real dated preview includes exactly two classes and minutes with no persisted changes; approval preserves all obligations", () => fixture(async f => {
  await publishFixture(f);
  const before = await counts(f);
  const preview = good(await readLeaveImpact(f.teacher.id, dates(f)));
  assert.equal(preview.impact!.classes.length, 2); assert.equal(preview.impact!.minutes, 120);
  assert.ok(preview.impact!.classes.every(c => c.date === "2099-01-05"));
  assert.deepEqual(await counts(f), before);
  const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  assert.deepEqual((await counts(f)).occurrences, before.occurrences);
  const command = decision(id);
  const results = await Promise.all([changeLeave(f.hod.id, command), changeLeave(f.hod.id, command)]); results.forEach(good); assert.deepEqual(results[0], results[1]);
  const after = await counts(f);
  assert.deepEqual(after.obligations, before.obligations); assert.equal(after.revision, 2); assert.equal(after.reservations.length, 12);
  assert.equal(after.occurrences.filter(o => o.schedulingStatus === "CANCELLED" && o.leaveRequestId === id).length, 2);
  assert.ok(after.occurrences.every(o => o.deliveryStatus === "PENDING"));
  assert.equal(await db.auditEvent.count({ where: { entityId: id, action: "LEAVE_APPROVED" } }), 1);
  const detail = (await readLeaveWorkspace(f.teacher.id, id)).detail!; assert.equal(detail.cancelled, 2);
  assert.equal((await changeLeave(f.hod.id, { ...command, operation: "reject", rejectionReason: "changed payload" })).code, "CONFLICT");
}));
test("inclusive local dates select late and early classes at both boundaries; outside dates stay active", () => fixture(async f => {
  await publishFixture(f);
  const originals = await db.classOccurrence.findMany({ where: { departmentId: f.departmentId, localDate: "2099-01-05" }, orderBy: { startAt: "asc" } });
  // Synthetic boundary placements bypass normal slot rules solely to test local-date selection.
  for (const [row, date, start, end] of [[originals[0], "2099-01-06", 1, 61], [originals[1], "2099-01-07", 1380, 1440]] as const) {
    await db.resourceReservation.deleteMany({ where: { occurrenceId: row.id } });
    await db.classOccurrence.update({ where: { id: row.id }, data: { localDate: date, startAt: instant(date, start), endAt: instant(date, end) } });
  }
  const preview = good(await readLeaveImpact(f.teacher.id, dates(f, "2099-01-06", "2099-01-07"))).impact!;
  assert.equal(preview.classes.length, 2); assert.equal(preview.minutes, 120); assert.equal(preview.classes[0].startMinute, 1); assert.equal(preview.classes[1].endMinute, 1440);
  const id = good(await changeLeave(f.teacher.id, submit(f, "2099-01-06", "2099-01-07"))).leaveId!;
  good(await changeLeave(f.hod.id, decision(id)));
  assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId, schedulingStatus: "ACTIVE" } }), 4);
}));
test("zero-class leave can be approved and does not fabricate recovery counts", () => fixture(async f => {
  const preview = good(await readLeaveImpact(f.teacher.id, dates(f))).impact!; assert.equal(preview.minutes, 0); assert.equal(preview.classes.length, 0);
  const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  assert.match(good(await changeLeave(f.hod.id, decision(id))).message, /No class resolution is needed/);
  assert.equal((await counts(f)).revision, 1); assert.equal((await counts(f)).obligations.length, 0);
  // A later initial publication must respect approved absence even with no prior occurrences.
  await assert.rejects(publishFixture(f, 1), /approved leave/);
}));
test("past, reversed, outside-semester, impossible and overlapping dates are rejected, including concurrent submissions", () => fixture(async f => {
  for (const command of [submit(f, "2000-01-01"), submit(f, "2099-01-07", "2099-01-06"), submit(f, "2099-01-30", "2099-01-31"), submit(f, "2099-02-30")]) assert.equal((await changeLeave(f.teacher.id, command)).code, "VALIDATION_ERROR");
  const one = submit(f, "2099-01-05", "2099-01-06"), two = submit(f, "2099-01-06", "2099-01-07");
  const results = await Promise.all([changeLeave(f.teacher.id, one), changeLeave(f.teacher.id, two)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.code === "VALIDATION_ERROR").length, 1);
  const id = results.find(r => r.ok)!.leaveId!; good(await changeLeave(f.hod.id, decision(id)));
  assert.equal((await changeLeave(f.teacher.id, submit(f, "2099-01-06"))).code, "VALIDATION_ERROR");
  // DB protection stands independently of the service lock.
  await assert.rejects(db.leaveRequest.create({ data: { departmentId: f.departmentId, facultyId: f.faculty.id, semesterId: f.semester.id, startDate: "2099-01-06", endDate: "2099-01-06", privateReason: "Synthetic" } }), /leave_no_overlap|exclusion|23P01/i);
}));
test("approval re-queries changed timetable rather than cancelling the old preview", () => fixture(async f => {
  await publishFixture(f);
  assert.equal(good(await readLeaveImpact(f.teacher.id, dates(f))).impact!.classes.length, 2);
  const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  await publishFixture(f, 1, 2);
  good(await changeLeave(f.hod.id, decision(id)));
  assert.equal(await db.classOccurrence.count({ where: { leaveRequestId: id } }), 0);
  assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId, schedulingStatus: "ACTIVE", localDate: "2099-01-06" } }), 2);
}));
test("approval catches classes published after a zero-class preview", () => fixture(async f => {
  assert.equal(good(await readLeaveImpact(f.teacher.id, dates(f))).impact!.classes.length, 0);
  const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  await publishFixture(f);
  good(await changeLeave(f.hod.id, decision(id)));
  assert.equal(await db.classOccurrence.count({ where: { leaveRequestId: id } }), 2);
}));
test("direct unauthorized access, ownership, department, self-approval and private data scoping", () => fixture(async f => {
  await publishFixture(f);
  const other = await addFaculty(f), foreign = await timetableFixture(db);
  try {
    const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!, command = decision(id);
    for (const actor of [f.teacher.id, other.user.id, f.student.id, f.admin.id, f.coordinator.id, foreign.hod.id]) assert.equal((await changeLeave(actor, command)).code, "FORBIDDEN");
    assert.equal((await changeLeave(null, command)).code, "UNAUTHORIZED");
    assert.equal((await changeLeave(other.user.id, decision(id, "withdraw"))).code, "FORBIDDEN");
    await assert.rejects(readLeaveWorkspace(other.user.id, id), /FORBIDDEN/); await assert.rejects(readLeaveWorkspace(f.student.id, id), /FORBIDDEN/);
    await assert.rejects(readLeaveWorkspace(foreign.hod.id, id), /FORBIDDEN/); await assert.rejects(readLeaveWorkspace(null), /UNAUTHORIZED/);
    for (const actor of [f.admin.id, f.coordinator.id]) assert.equal((await readLeaveWorkspace(actor, id)).detail!.privateFields, null);
    assert.equal((await readLeaveWorkspace(f.hod.id, id)).detail!.privateFields!.privateReason, "Private synthetic medical reason");
    assert.ok(!JSON.stringify(await readTimetable(f.student.id)).includes("Private synthetic"));
    assert.ok(!JSON.stringify(await readTimetable(f.student.id)).includes("privateReason"));
    assert.equal((await changeLeave(f.teacher.id, { ...submit(f), facultyId: other.faculty.id })).code, "VALIDATION_ERROR");
    assert.equal((await readLeaveImpact(f.teacher.id, dates(foreign))).code, "FORBIDDEN");
    await db.faculty.create({ data: { departmentId: f.departmentId, userId: f.hod.id, designation: "HoD", targetMinutesPerWeek: 720, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080 } });
    const own = good(await changeLeave(f.hod.id, submit(f, "2099-01-08"))).leaveId!;
    assert.equal((await changeLeave(f.hod.id, decision(own))).code, "FORBIDDEN");
    assert.equal((await readLeaveWorkspace(f.hod.id, own)).eligibleApprover, false);
    const secondHod = await addFaculty(f, "HOD"); good(await changeLeave(secondHod.user.id, decision(own)));
  } finally { await cleanupTimetable(db, foreign.departmentId); }
}));
test("rejection requires a reason, withdrawal/rejection are final, and dates can be requested again", () => fixture(async f => {
  const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  assert.equal((await changeLeave(f.hod.id, decision(id, "reject"))).code, "VALIDATION_ERROR");
  good(await changeLeave(f.hod.id, { ...decision(id, "reject"), rejectionReason: "Synthetic decision reason" }));
  assert.equal((await readLeaveWorkspace(f.teacher.id, id)).detail!.privateFields!.rejectionReason, "Synthetic decision reason");
  assert.equal((await changeLeave(f.hod.id, decision(id))).code, "STALE_VERSION");
  const second = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  good(await changeLeave(f.teacher.id, decision(second, "withdraw")));
  assert.equal((await changeLeave(f.hod.id, decision(second))).code, "STALE_VERSION");
}));
test("competing approve/reject/withdraw decisions have exactly one terminal transition and one audit", () => fixture(async f => {
  await publishFixture(f); const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  const results = await Promise.all([changeLeave(f.hod.id, decision(id)), changeLeave(f.hod.id, { ...decision(id, "reject"), rejectionReason: "Synthetic" }), changeLeave(f.teacher.id, decision(id, "withdraw"))]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.code === "STALE_VERSION").length, 2);
  assert.equal(await db.auditEvent.count({ where: { entityId: id, action: { not: "LEAVE_SUBMITTED" } } }), 1);
  const request = await db.leaveRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(await db.classOccurrence.count({ where: { leaveRequestId: id } }), request.status === "APPROVED" ? 2 : 0);
}));
test("late database failure rolls back cancellations, reservations, revisions, status, audit and receipt", () => fixture(async f => {
  await publishFixture(f); const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!, command = decision(id), before = await counts(f);
  const constraint = `leave_rollback_${randomUUID().replaceAll("-", "")}`;
  // Scoped failure injection in the isolated database only. Other fixtures remain valid.
  await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ADD CONSTRAINT "${constraint}" CHECK (NOT ("departmentId" = '${f.departmentId}' AND action = 'LEAVE_APPROVED')) NOT VALID`);
  try {
    assert.equal((await changeLeave(f.hod.id, command)).ok, false);
    assert.deepEqual(await counts(f), before);
    assert.equal((await db.leaveRequest.findUniqueOrThrow({ where: { id } })).status, "SUBMITTED");
  } finally { await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DROP CONSTRAINT "${constraint}"`); }
  good(await changeLeave(f.hod.id, command));
}));
test("approved leave blocks template resurrection and invalid semester edits", () => fixture(async f => {
  await publishFixture(f); const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!; good(await changeLeave(f.hod.id, decision(id)));
  await assert.rejects(publishFixture(f, 2), /approved leave|recovery/);
  const result = await changeMasterData(f.coordinator.id, { kind: "semester", operation: "save", requestId: randomUUID(), id: f.semester.id, expectedVersion: 1, data: { code: f.semester.code, name: f.semester.name, startDate: "2099-01-06", endDate: f.semester.endDate, active: true } });
  assert.equal(result.code, "CONFLICT");
}));
test("concurrent publication and approval cannot leave active teaching during approved absence", () => fixture(async f => {
  const { publish } = await publishFixture(f); const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  // Two real writers: publication cloned at revision one vs approval.
  const draft = await changeTimetable(f.coordinator.id, { semesterId: f.semester.id, expectedRevision: 1, operation: "create", requestId: randomUUID(), effectiveFrom: "2099-01-05" });
  const p = await changeTimetable(f.coordinator.id, { semesterId: f.semester.id, expectedRevision: 1, expectedVersion: 1, draftId: draft.draftId, operation: "preview", requestId: randomUUID() }); assert.equal(p.ok, true);
  const results = await Promise.all([changeLeave(f.hod.id, decision(id)), changeTimetable(f.coordinator.id, { ...publish, expectedRevision: 1, expectedVersion: 1, draftId: draft.draftId, requestId: randomUUID(), previewFingerprint: p.preview!.fingerprint })]);
  assert.equal(results[0].ok, true, JSON.stringify(results));
  assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId, localDate: "2099-01-05", schedulingStatus: "ACTIVE" } }), 0);
  assert.equal(await db.teachingObligation.count({ where: { departmentId: f.departmentId } }), 6);
}));
test("approval reloads revoked actor and owner eligibility and never cancels held/not-held classes", () => fixture(async f => {
  await publishFixture(f); const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  await db.user.update({ where: { id: f.teacher.id }, data: { active: false } });
  assert.equal((await changeLeave(f.hod.id, decision(id))).code, "CONFLICT");
  await db.user.update({ where: { id: f.teacher.id }, data: { active: true } });
  const rows = await db.classOccurrence.findMany({ where: { departmentId: f.departmentId, localDate: "2099-01-05" } });
  await db.classOccurrence.update({ where: { id: rows[0].id }, data: { deliveryStatus: "HELD" } });
  await db.classOccurrence.update({ where: { id: rows[1].id }, data: { deliveryStatus: "NOT_HELD" } });
  assert.equal(good(await readLeaveImpact(f.teacher.id, dates(f))).impact!.classes.length, 0);
  good(await changeLeave(f.hod.id, decision(id)));
  assert.equal(await db.classOccurrence.count({ where: { leaveRequestId: id } }), 0);
  const another = good(await changeLeave(f.teacher.id, submit(f, "2099-01-06"))).leaveId!;
  let release!: () => void, locked!: () => void;
  const hold = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { locked = r; });
  const revoke = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${f.hod.id} FOR NO KEY UPDATE`; await tx.user.update({ where: { id: f.hod.id }, data: { active: false } }); locked(); await hold; });
  await ready; const approving = changeLeave(f.hod.id, decision(another)); release(); await revoke; assert.equal((await approving).code, "UNAUTHORIZED");
  assert.ok(localDate() < f.semester.startDate);
}));

test("same-day leave excludes classes that already started and submission retries return one committed request", () => fixture(async f => {
  await publishFixture(f);
  const today = localDate();
  await db.semester.update({ where: { id: f.semester.id }, data: { startDate: today } });
  const row = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId } });
  await db.resourceReservation.deleteMany({ where: { occurrenceId: row.id } });
  await db.classOccurrence.update({ where: { id: row.id }, data: { localDate: today, startAt: new Date(Date.now() - 60_000), endAt: new Date(Date.now() + 60_000) } });
  const payload = submit(f, today);
  const results = await Promise.all([changeLeave(f.teacher.id, payload), changeLeave(f.teacher.id, payload)]); results.forEach(good); assert.deepEqual(results[0], results[1]);
  assert.equal(await db.leaveRequest.count({ where: { departmentId: f.departmentId } }), 1);
  assert.equal(good(await readLeaveImpact(f.teacher.id, dates(f, today))).impact!.classes.length, 0);
  good(await changeLeave(f.hod.id, decision(results[0].leaveId!)));
  assert.equal((await db.classOccurrence.findUniqueOrThrow({ where: { id: row.id } })).schedulingStatus, "ACTIVE");
  assert.ok(!JSON.stringify(await db.auditEvent.findMany({ where: { departmentId: f.departmentId } })).includes("Private synthetic medical reason"));
}));

test("leave cancels all assigned occurrences across overlapping semesters and advances both revisions", () => fixture(async f => {
  await publishFixture(f);
  const semester = await db.semester.create({ data: { departmentId: f.departmentId, code: "SECOND", name: "Second synthetic semester", startDate: f.semester.startDate, endDate: f.semester.endDate } });
  const section = await db.section.create({ data: { departmentId: f.departmentId, semesterId: semester.id, code: "SECOND", name: "Second semester section", strength: 30, preferredPeriodsPerDay: 5 } });
  const allocation = await db.courseAllocation.create({ data: { departmentId: f.departmentId, semesterId: semester.id, sectionId: section.id, courseId: f.allocations[0].courseId, facultyId: f.faculty.id, weeklyPeriods: 1, requiredContactMinutes: 240 } });
  await publishFixture({ ...f, semester, entries: [{ ...f.entries[0], allocationId: allocation.id, seriesId: randomUUID(), startMinute: 660, endMinute: 720 }] });
  assert.equal(good(await readLeaveImpact(f.teacher.id, dates(f))).impact!.classes.length, 3);
  const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!; good(await changeLeave(f.hod.id, decision(id)));
  assert.equal(await db.classOccurrence.count({ where: { leaveRequestId: id } }), 3);
  for (const semesterId of [semester.id, f.semester.id]) assert.equal((await db.semester.findUniqueOrThrow({ where: { id: semesterId } })).scheduleRevision, 2);
}));

test("a midweek template cannot recreate a leave-cancelled obligation before its effective boundary", () => fixture(async f => {
  await publishFixture(f);
  const id = good(await changeLeave(f.teacher.id, submit(f))).leaveId!;
  good(await changeLeave(f.hod.id, decision(id)));
  const before = await counts(f);
  const command = { semesterId: f.semester.id, expectedRevision: 2, effectiveFrom: "2099-01-06" };
  const created = await changeTimetable(f.coordinator.id, { ...command, operation: "create", requestId: randomUUID() });
  assert.equal(created.ok, true, JSON.stringify(created));
  const draft = { ...command, draftId: created.draftId, expectedVersion: 1 };
  const saved = await changeTimetable(f.coordinator.id, { ...draft, operation: "save", requestId: randomUUID(), entries: f.entries.map(e => ({ ...e, weekday: 2 })) });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const result = await changeTimetable(f.coordinator.id, { ...draft, expectedVersion: 2, operation: "preview", requestId: randomUUID() });
  assert.equal(result.code, "CONFLICT", JSON.stringify(result));
  assert.match(result.message, /leave|recovery/i);
  const publishing = await changeTimetable(f.coordinator.id, { ...draft, expectedVersion: 2, operation: "publish", requestId: randomUUID(), previewFingerprint: "a".repeat(64) });
  assert.equal(publishing.code, "CONFLICT", JSON.stringify(publishing));
  assert.match(publishing.message, /leave|recovery/i);
  const after = await counts(f);
  assert.deepEqual(after.occurrences, before.occurrences);
  assert.deepEqual(after.obligations, before.obligations);
  assert.deepEqual(after.reservations, before.reservations);
  assert.equal(after.revision, before.revision);
}));
