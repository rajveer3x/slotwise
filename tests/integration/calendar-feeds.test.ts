import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import ICAL from "ical.js";
import { getDb } from "../../src/server/db";
import { changeCalendarSubscription, readCalendarFeed, readCalendarSubscriptions } from "../../src/server/services/calendar-feeds";
import { changeAccountActive } from "../../src/server/services/accounts";
import { changeCover } from "../../src/server/services/covers";
import { changeLeave } from "../../src/server/services/leave";
import { changePublication } from "../../src/server/services/publications";
import { changeResolution, readResolutionWorkspace } from "../../src/server/services/resolutions";
import type { CalendarChange } from "../../src/features/calendar-feeds/schema";
import { addSubstitutes } from "../support/cover-fixture";
import { publishFixture, type LeaveFixture } from "../support/leave-fixture";
import { cleanupTimetable, timetableFixture } from "../support/timetable-fixture";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || new URL(testUrl).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = testUrl;
const db = getDb();
after(() => db.$disconnect());

async function fixture(run: (f: LeaveFixture) => Promise<void>) {
  const f = await timetableFixture(db);
  try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); }
}

const section = (scopeId: string): CalendarChange => ({ operation: "create", scope: "SECTION", scopeId, expectedVersion: 0 });
const faculty = (scopeId: string): CalendarChange => ({ operation: "create", scope: "FACULTY", scopeId, expectedVersion: 0 });
const keyFrom = (url: string) => new URL(url).pathname.split("/").at(-1)!;

async function createLink(actorId: string, command: CalendarChange) {
  const result = await changeCalendarSubscription(actorId, command);
  assert.ok(result.ok && result.url, "Expected an issued calendar URL.");
  return keyFrom(result.url);
}

async function readEvents(key: string) {
  const content = await readCalendarFeed(key);
  assert.ok(content, "Expected an authorized calendar.");
  const parsed = new ICAL.Component(ICAL.parse(content));
  assert.equal(parsed.getFirstPropertyValue("version"), "2.0");
  const events = parsed.getAllSubcomponents("vevent").map(event => new ICAL.Event(event));
  assert.equal(new Set(events.map(event => event.uid)).size, events.length);
  return { events, content };
}

test("parser round-trips Unicode, separators, backslashes and folded CRLF text in an owner-scoped feed", () => fixture(async f => {
  const courseName = ("ਕਲਾਸ 🎓 — café; A,B \\ lab\r\nSUMMARY: embedded text\n").repeat(3).trimEnd();
  await db.course.update({ where: { id: f.allocations[0].courseId }, data: { name: `\u0007${courseName}` } });
  const { draft } = await publishFixture(f);
  await db.timetableVersion.create({
    data: { departmentId: f.departmentId, semesterId: f.semester.id, status: "DRAFT",
      baseScheduleRevision: 1, effectiveFrom: draft.effectiveFrom, effectiveTo: f.semester.endDate },
  });
  const studentKey = await createLink(f.student.id, section(f.section.id));
  const teacherKey = await createLink(f.teacher.id, faculty(f.faculty.id));
  const outsideKey = await createLink(f.outsider.id, section(f.section2.id));

  const { events, content } = await readEvents(studentKey);
  assert.equal(events.length, 6);
  assert.deepEqual((await readEvents(teacherKey)).events.map(e => e.uid).sort(), events.map(e => e.uid).sort());
  assert.equal((await readEvents(outsideKey)).events.length, 0);
  const event = events.find(e => e.summary.startsWith("CS101"))!;
  assert.equal(event.summary, `CS101 · ${courseName.replaceAll("\r\n", "\n")}`);
  assert.equal(event.component.getAllProperties("summary").length, 1);
  assert.equal(event.startDate.toJSDate().toISOString(), "2099-01-05T03:30:00.000Z");
  assert.equal(event.endDate.toJSDate().toISOString(), "2099-01-05T04:30:00.000Z");
  assert.equal(event.location, "R1");
  assert.equal(event.description, "Section S1");
  assert.ok(content.includes("\r\n "));
  assert.ok(content.endsWith("END:VCALENDAR\r\n"));
  assert.ok(content.split("\r\n").every(line => Buffer.byteLength(line) <= 75));
  assert.ok(!content.includes(f.teacher.email) && !content.includes(f.teacher.name) && !content.includes("PRIVATE"));
  assert.equal(await readCalendarFeed(studentKey.replace(/^[A-Za-z0-9_-]{43}/, "wrong")), null);
}));

test("current account, role and section membership gate reads and writes; storage holds only a hash", () => fixture(async f => {
  const command = section(f.section.id);
  for (const [actorId, operation] of [[null, command], [f.outsider.id, command], [f.coordinator.id, command],
    [f.student.id, faculty(f.faculty.id)], [f.hod.id, faculty(f.faculty.id)]] as const) {
    const result = await changeCalendarSubscription(actorId, operation);
    assert.ok(!result.ok);
    assert.equal(result.code, actorId ? "FORBIDDEN" : "UNAUTHORIZED");
  }
  const key = await createLink(f.student.id, command);
  const stored = await db.calendarSubscription.findFirstOrThrow({ where: { ownerId: f.student.id } });
  assert.equal(stored.tokenHash, createHash("sha256").update(key.slice(0, -4)).digest("hex"));
  assert.ok(!JSON.stringify(await readCalendarSubscriptions(f.student.id)).includes(stored.tokenHash!));
  assert.ok(!(await changeCalendarSubscription(f.outsider.id, { ...command, operation: "revoke", expectedVersion: 1 })).ok);

  assert.ok((await changeAccountActive(f.admin.id, { userId: f.student.id, active: false, expectedActive: true })).ok);
  assert.equal(await readCalendarFeed(key), null);
  assert.ok((await changeAccountActive(f.admin.id, { userId: f.student.id, active: true, expectedActive: false })).ok);
  await db.user.update({ where: { id: f.student.id }, data: { role: "COORDINATOR" } });
  assert.equal(await readCalendarFeed(key), null);
  await db.user.update({ where: { id: f.student.id }, data: { role: "STUDENT" } });
  await db.sectionMembership.updateMany({ where: { userId: f.student.id }, data: { archived: true } });
  assert.equal(await readCalendarFeed(key), null);
  assert.equal((await readCalendarSubscriptions(f.student.id))[0].allowed, false);
  assert.ok(!(await changeCalendarSubscription(f.student.id, { ...command, operation: "rotate", expectedVersion: 1 })).ok);
  assert.ok((await changeCalendarSubscription(f.student.id, { ...command, operation: "revoke", expectedVersion: 1 })).ok);
  await db.sectionMembership.updateMany({ where: { userId: f.student.id }, data: { archived: false } });
  assert.equal(await readCalendarFeed(key), null);
}));

test("concurrent creates and rotations issue once, and a stale rotation cannot revive a revoked link", () => fixture(async f => {
  const command = section(f.section.id);
  async function race(input: CalendarChange) {
    const results = await Promise.all([changeCalendarSubscription(f.student.id, input), changeCalendarSubscription(f.student.id, input)]);
    const success = results.find(r => r.ok);
    const stale = results.find(r => !r.ok);
    assert.ok(success?.ok && success.url);
    assert.ok(stale && !stale.ok && stale.code === "STALE_VERSION");
    return keyFrom(success.url);
  }
  const first = await race(command);
  const second = await race({ ...command, operation: "rotate", expectedVersion: 1 });
  assert.notEqual(first, second);
  assert.equal(await readCalendarFeed(first), null);
  assert.ok(await readCalendarFeed(second));
  assert.ok((await changeCalendarSubscription(f.student.id, { ...command, operation: "revoke", expectedVersion: 2 })).ok);
  assert.ok(!(await changeCalendarSubscription(f.student.id, { ...command, operation: "rotate", expectedVersion: 2 })).ok);
  assert.equal(await readCalendarFeed(second), null);
  assert.equal(await db.calendarSubscription.count({ where: { ownerId: f.student.id } }), 1);
}));

test("leave and reviewed recovery publish one update per obligation, including a tombstone for the former teacher", t => fixture(async f => {
  await publishFixture(f);
  const [substitute] = await addSubstitutes(db, f, "synthetic-no-login", 1);
  await db.facultyQualification.deleteMany({ where: { facultyId: substitute.faculty.id, courseId: f.allocations[0].courseId } });
  const studentKey = await createLink(f.student.id, section(f.section.id));
  const teacherKey = await createLink(f.teacher.id, faculty(f.faculty.id));
  const substituteKey = await createLink(substitute.user.id, faculty(substitute.faculty.id));
  const before = (await readEvents(studentKey)).events.filter(e => e.startDate.toString().startsWith("2099-01-05"));
  assert.equal(before.length, 2);
  const submit = await changeLeave(f.teacher.id, { operation: "submit", requestId: randomUUID(), semesterId: f.semester.id,
    startDate: "2099-01-05", endDate: "2099-01-05", privateReason: "Private calendar test leave reason" });
  assert.ok(submit.ok && submit.leaveId);
  const leaveId = submit.leaveId;
  assert.ok((await changeLeave(f.hod.id, { operation: "approve", requestId: randomUUID(), leaveId, expectedVersion: 1 })).ok);
  const cancelled = await readEvents(studentKey);
  assert.ok(!cancelled.content.includes("Private calendar test leave reason"));
  for (const entry of before) {
    const tombstone = cancelled.events.find(e => e.uid === entry.uid)!;
    assert.equal(tombstone.component.getFirstPropertyValue("status"), "CANCELLED");
    assert.ok(tombstone.sequence > entry.sequence);
  }

  let board = (await readResolutionWorkspace(f.coordinator.id, leaveId)).board!;
  const [first, second] = board.items;
  const weekday = first.candidates.find(c => c.tier === 3)!;
  assert.ok(weekday);
  const decisions = { selected: { [first.original.occurrenceId]: weekday.id, [second.original.occurrenceId]: second.candidates[0].id }, rejected: {} };
  const saved = await changeResolution(f.coordinator.id, { operation: "save", leaveId, decisions,
    expectedToken: board.token, expectedVersion: board.planVersion, requestId: randomUUID() });
  assert.ok(saved.ok, JSON.stringify(saved));
  board = saved.board!;
  const invited = await changeCover(f.coordinator.id, { operation: "invite", leaveId, occurrenceId: second.original.occurrenceId,
    candidateId: second.candidates[0].id, expectedToken: board.token, expectedVersion: board.planVersion, requestId: randomUUID() });
  assert.ok(invited.ok, JSON.stringify(invited));
  assert.ok((await changeCover(substitute.user.id, { operation: "accept", id: invited.id, requestId: randomUUID() })).ok);
  board = (await readResolutionWorkspace(f.coordinator.id, leaveId)).board!;
  const command = { leaveId, occurrenceIds: [first.original.occurrenceId, second.original.occurrenceId], meetingUrls: {},
    expectedToken: board.token, expectedVersion: board.planVersion };
  const preview = await changePublication(f.coordinator.id, { ...command, operation: "preview", requestId: randomUUID() });
  assert.ok(preview.ok && preview.preview);
  assert.deepEqual(preview.preview.blockers, []);
  const published = await changePublication(f.coordinator.id, { ...command, operation: "publish", requestId: randomUUID(), previewFingerprint: preview.preview.fingerprint });
  assert.ok(published.ok, JSON.stringify(published));

  const student = await readEvents(studentKey);
  assert.equal(student.events.length, 6);
  assert.equal(await readCalendarFeed(studentKey), student.content);
  const movedUid = `${first.original.obligationId}@slotwise`;
  const coveredUid = `${second.original.obligationId}@slotwise`;
  const moved = student.events.find(e => e.uid === movedUid)!;
  assert.equal(moved.component.getFirstPropertyValue("status"), "CONFIRMED");
  assert.notEqual(moved.startDate.toString(), before.find(e => e.uid === movedUid)!.startDate.toString());
  assert.ok(moved.sequence > cancelled.events.find(e => e.uid === movedUid)!.sequence);
  const oldTeacher = await readEvents(teacherKey);
  const oldCover = oldTeacher.events.find(e => e.uid === coveredUid)!;
  assert.equal(oldCover.component.getFirstPropertyValue("status"), "CANCELLED");
  assert.equal(oldCover.startDate.toString(), before.find(e => e.uid === coveredUid)!.startDate.toString());
  const replacement = (await readEvents(substituteKey)).events[0];
  assert.equal(replacement.uid, coveredUid);
  assert.equal(replacement.component.getFirstPropertyValue("status"), "CONFIRMED");

  const original = await db.classOccurrence.findUniqueOrThrow({ where: { id: second.original.occurrenceId } });
  const lastRetained = original.cancelledAt!.getTime() + 30 * 24 * 60 * 60 * 1000;
  t.mock.timers.enable({ apis: ["Date"], now: lastRetained });
  try {
    assert.ok((await readEvents(teacherKey)).events.some(e => e.uid === coveredUid));
    t.mock.timers.setTime(lastRetained + 1);
    assert.ok(!(await readEvents(teacherKey)).events.some(e => e.uid === coveredUid));
    assert.ok((await readEvents(studentKey)).events.some(e => e.uid === coveredUid));
  } finally { t.mock.timers.reset(); }
}));
