import "dotenv/config";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getDb } from "../../src/server/db";
import { changeNotification, readAcknowledgementCounts, readNotification, readNotificationInbox } from "../../src/server/services/notifications";
import { changePublication } from "../../src/server/services/publications";
import { changeResolution, readResolutionWorkspace } from "../../src/server/services/resolutions";
import { changeCover, readCoverWorkspace } from "../../src/server/services/covers";
import { changeMasterData } from "../../src/server/services/master-data";
import { readLeaveWorkspace } from "../../src/server/services/leave";
import { readTimetable } from "../../src/server/services/timetable";
import { guardPublishedSchedule } from "../../src/server/services/scheduling-store";
import { type Decisions } from "../../src/domain/resolution/engine";
import { instant } from "../../src/domain/scheduling/timetable";
import type { Board } from "../../src/features/resolutions/schema";
import type { PublicationResult } from "../../src/features/publications/schema";
import { coverFixture, saturdayOnly } from "../support/cover-fixture";
import { resolutionFixture } from "../support/resolution-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
after(() => db.$disconnect());
type Fixture = Awaited<ReturnType<typeof resolutionFixture>>;
async function fixture(run: (f: Fixture) => Promise<void>) { const f = await resolutionFixture(db, "synthetic-no-login"); try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); } }
function good(r: PublicationResult) { assert.equal(r.ok, true, JSON.stringify(r)); return r; }
const code = (r: { ok: true } | { ok: false; code: string }) => r.ok ? "OK" : r.code;
async function board(f: Fixture, actor = f.coordinator.id) { return (await readResolutionWorkspace(actor, f.leaveId)).board!; }
async function save(f: Fixture, b: Board, decisions: Decisions, actor = f.coordinator.id) {
  const r = await changeResolution(actor, { operation: "save", leaveId: f.leaveId, decisions, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() });
  assert.ok(r.ok, JSON.stringify(r)); return r.board!;
}
async function choose(f: Fixture, indices = [0], actor = f.coordinator.id) {
  let b = await board(f, actor), decisions: Decisions = { selected: {}, rejected: {} };
  for (const index of indices) {
    decisions = { ...decisions, selected: { ...decisions.selected, [b.items[index].original.occurrenceId]: b.items[index].candidates[0].id } };
    const computed = await changeResolution(actor, { operation: "compute", leaveId: f.leaveId, decisions, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() });
    assert.ok(computed.ok); b = computed.board!;
  }
  return save(f, b, decisions, actor);
}
function input(f: Fixture, b: Board, ids = b.items.filter(i => i.selected).map(i => i.original.occurrenceId), meetingUrls: Record<string, string> = {}) {
  return { operation: "preview", leaveId: f.leaveId, occurrenceIds: ids, meetingUrls, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() };
}
async function command(f: Fixture, b: Board, actor = f.coordinator.id, ids?: string[], meetingUrls: Record<string, string> = {}) {
  const payload = input(f, b, ids, meetingUrls), p = good(await changePublication(actor, payload)).preview!;
  assert.deepEqual(p.blockers, []);
  return { ...payload, operation: "publish", requestId: randomUUID(), previewFingerprint: p.fingerprint };
}
async function state(f: Fixture) {
  const where = { departmentId: f.departmentId }, orderBy = { id: "asc" as const };
  return { occurrences: await db.classOccurrence.findMany({ where, orderBy }), obligations: await db.teachingObligation.findMany({ where, orderBy }), reservations: await db.resourceReservation.findMany({ where, orderBy }), plans: await db.resolutionPlan.findMany({ where, orderBy }), items: await db.resolutionItem.findMany({ where, orderBy }), covers: await db.substitutionRequest.findMany({ where, orderBy }), exceptions: await db.saturdayException.findMany({ where, orderBy }), publications: await db.schedulePublication.findMany({ where, orderBy }), audits: await db.auditEvent.findMany({ where, orderBy }), notifications: await db.notification.findMany({ where, orderBy }), receipts: await db.mutationReceipt.findMany({ where, orderBy }), semesters: await db.semester.findMany({ where, orderBy }) };
}
async function noOverlaps(f: Fixture) {
  const rows = await db.resourceReservation.findMany({ where: { departmentId: f.departmentId } });
  for (const a of rows) for (const b of rows) if (a.id !== b.id && a.resourceType === b.resourceType && a.resourceId === b.resourceId) assert.ok(a.startAt >= b.endAt || b.startAt >= a.endAt, `${a.id} overlaps ${b.id}`);
}

test("read-only before/after preview and complete batch commit retain requirements/history and atomically create audit, recipients and reservations", () => fixture(async f => {
  const b = await choose(f, [0, 1]), before = await state(f);
  const p = good(await changePublication(f.coordinator.id, input(f, b))).preview!;
  assert.deepEqual(await state(f), before); assert.equal(p.selectedCount, 2); assert.equal(p.changes.length, 2); assert.equal(p.unresolved.length, 0);
  assert.ok(p.changes.every(c => c.before.date === "2099-01-05" && c.after.date > c.before.date));
  assert.deepEqual(p.recipients.map(r => r.id).sort(), [f.admin.id, f.coordinator.id, f.hod.id, f.teacher.id, f.student.id].sort());
  good(await changePublication(f.coordinator.id, await command(f, b)));
  const after = await state(f); assert.deepEqual(after.obligations, before.obligations);
  assert.equal(after.publications.length, 1); assert.equal(after.occurrences.length, before.occurrences.length + 2);
  assert.equal(after.reservations.length, before.reservations.length + 6); assert.equal(after.notifications.length, 5);
  assert.equal(after.audits.filter(a => a.action === "RESOLUTION_PUBLISHED").length, 1); assert.equal(after.semesters[0].scheduleRevision, 3);
  assert.ok(after.items.every(i => i.status === "PUBLISHED" && i.publicationId === after.publications[0].id));
  assert.equal(after.plans[0].status, "PUBLISHED");
  for (const old of before.occurrences) assert.deepEqual(after.occurrences.find(o => o.id === old.id), old);
  const replacements = after.occurrences.filter(o => o.publicationId); assert.ok(replacements.every(o => o.resolved && o.deliveryStatus === "PENDING" && o.replacesId && o.schedulingStatus === "ACTIVE"));
  assert.ok((await board(f)).items.length === 0); assert.equal((await readLeaveWorkspace(f.coordinator.id, f.leaveId)).detail!.unresolved, 0); await noOverlaps(f);
  const student = await readTimetable(f.student.id); assert.ok(student.occurrences.some(o => o.replacesId)); assert.ok(!JSON.stringify(student).includes("Private browser resolution reason"));
}));
test("same-key concurrent publication returns original result; changed payload/key actor cannot replay and no duplicates appear", () => fixture(async f => {
  const b = await choose(f), c = await command(f, b);
  const results = await Promise.all([changePublication(f.coordinator.id, c), changePublication(f.coordinator.id, c)]); results.forEach(good); assert.deepEqual(results[0], results[1]);
  const snapshot = await state(f); assert.equal(snapshot.publications.length, 1);
  assert.deepEqual(await changePublication(f.coordinator.id, c), results[0]);
  assert.equal(code(await changePublication(f.coordinator.id, { ...c, previewFingerprint: "0".repeat(64) })), "CONFLICT");
  assert.equal(code(await changePublication(f.coordinator.id, { ...c, occurrenceIds: [b.items[1].original.occurrenceId] })), "CONFLICT");
  await choose(f, [0], f.admin.id);
  assert.equal(code(await changePublication(f.admin.id, c)), "CONFLICT");
  assert.equal(await db.schedulePublication.count({ where: { departmentId: f.departmentId } }), 1);
  assert.equal(await db.notification.count({ where: { changeId: good(results[0]).publicationId } }), 5);
}));
test("notification reads and writes enforce recipient scope, preserve seen timestamps, and count an acknowledgement once", () => fixture(async f => {
  const inactive = await db.user.create({ data: {
    departmentId: f.departmentId, name: "Inactive synthetic student", email: `${randomUUID()}@test.invalid`,
    passwordHash: "synthetic", role: "STUDENT", active: false,
  } });
  await db.sectionMembership.create({ data: { departmentId: f.departmentId, sectionId: f.section.id, userId: inactive.id } });
  const firstSectionOnly = await db.user.create({ data: {
    departmentId: f.departmentId, name: "Synthetic student", email: `${randomUUID()}@test.invalid`,
    passwordHash: "synthetic", role: "STUDENT",
  } });
  await db.sectionMembership.create({ data: { departmentId: f.departmentId, sectionId: f.section.id, userId: firstSectionOnly.id } });
  const anotherSection = await db.section.create({ data: {
    departmentId: f.departmentId, semesterId: f.semester.id, code: "TEST2", name: "Another synthetic affected section",
    strength: 36, preferredPeriodsPerDay: 5,
  } });
  await db.sectionMembership.create({ data: { departmentId: f.departmentId, sectionId: anotherSection.id, userId: f.student.id } });
  // Move the second test class into a second section before generating the publication.
  await db.courseAllocation.update({ where: { id: f.allocations[1].id }, data: { sectionId: anotherSection.id } });
  const second = await db.classOccurrence.findMany({ where: { teachingObligation: { allocationId: f.allocations[1].id } }, select: { id: true } });
  await db.classOccurrence.updateMany({ where: { id: { in: second.map(o => o.id) } }, data: { sectionId: anotherSection.id } });
  await db.resourceReservation.updateMany({ where: { occurrenceId: { in: second.map(o => o.id) }, resourceType: "SECTION" }, data: { resourceId: anotherSection.id } });
  const c = await command(f, await choose(f, [0, 1]));
  const published = good(await changePublication(f.coordinator.id, c));
  assert.deepEqual(await changePublication(f.coordinator.id, c), published);
  const inbox = await readNotificationInbox(f.student.id);
  assert.equal(inbox.unread, 1);
  assert.equal(inbox.notices.length, 1);
  const notice = inbox.notices[0], notificationId = notice.id;
  assert.equal(notice.changes.length, 2);
  const firstSectionInbox = await readNotificationInbox(firstSectionOnly.id);
  assert.equal(firstSectionInbox.notices.length, 1);
  assert.deepEqual(firstSectionInbox.notices[0].changes, notice.changes.filter(c => c.title.includes("CS101")));
  assert.match(notice.changes[0].before, /2099-01-05/);
  assert.doesNotMatch(JSON.stringify(notice), /Private browser resolution reason|meetingUrl|recipients/);
  assert.equal((await readNotificationInbox(f.outsider.id)).unread, 0);
  assert.equal(await db.notification.count({ where: { recipientId: inactive.id } }), 0);
  const otherDepartment = await resolutionFixture(db, "synthetic");
  try {
    for (const id of [f.outsider.id, f.coordinator.id, f.admin.id, otherDepartment.coordinator.id]) {
      await assert.rejects(readNotification(id, notificationId), { code: "FORBIDDEN" });
      assert.equal(code(await changeNotification(id, { notificationId, operation: "read" })), "FORBIDDEN");
      assert.equal(code(await changeNotification(id, { notificationId, operation: "acknowledge" })), "FORBIDDEN");
    }
    assert.deepEqual(await readAcknowledgementCounts(otherDepartment.coordinator.id), []);
  } finally { await cleanupTimetable(db, otherDepartment.departmentId); }

  await assert.rejects(readAcknowledgementCounts(f.student.id), { code: "FORBIDDEN" });
  assert.equal(code(await changeNotification(null, { notificationId, operation: "read" })), "UNAUTHORIZED");
  assert.equal(code(await changeNotification(f.student.id, { notificationId, operation: "read", recipientId: f.student.id })), "VALIDATION_ERROR");
  const where = { id: notificationId };
  assert.equal((await changeNotification(f.student.id, { notificationId, operation: "read" })).ok, true);
  assert.equal((await readNotificationInbox(f.student.id)).unread, 0);
  const seen = (await db.notification.findUniqueOrThrow({ where })).readAt;
  assert.ok(seen);
  assert.equal((await readAcknowledgementCounts(f.coordinator.id))[0].acknowledged, 0);
  const delivery = await db.classOccurrence.findMany({ where: { publicationId: published.publicationId }, orderBy: { id: "asc" } });
  const attempts = await Promise.all(Array.from({ length: 4 }, () =>
    changeNotification(f.student.id, { notificationId, operation: "acknowledge" })));
  assert.ok(attempts.every(r => r.ok));
  assert.equal(await db.publicationAcknowledgement.count({ where: { recipientId: f.student.id } }), 1);
  const saved = await readNotification(f.student.id, notificationId);
  assert.ok(saved.acknowledgedAt);
  assert.deepEqual((await db.notification.findUniqueOrThrow({ where })).readAt, seen);
  assert.deepEqual((await readAcknowledgementCounts(f.coordinator.id)).map(p => [p.recipients, p.acknowledged]), [[6, 1]]);
  assert.deepEqual(await db.classOccurrence.findMany({ where: { publicationId: published.publicationId }, orderBy: { id: "asc" } }), delivery);
  assert.equal(await db.deliveryRecord.count({ where: { departmentId: f.departmentId } }), 0);

  await db.sectionMembership.updateMany({ where: { userId: f.student.id }, data: { archived: true } });
  assert.equal((await readNotification(f.student.id, notificationId)).changes.length, 2);
  assert.deepEqual((await readAcknowledgementCounts(f.coordinator.id)).map(p => [p.recipients, p.acknowledged]), [[6, 1]]);
  await db.user.update({ where: { id: f.student.id }, data: { active: false } });
  assert.equal(code(await changeNotification(f.student.id, { notificationId, operation: "acknowledge" })), "UNAUTHORIZED");
}));

test("a notification retains the old assignment and follows the current occurrence by teaching obligation", () => fixture(async f => {
  const publication = good(await changePublication(f.coordinator.id, await command(f, await choose(f))));
  const original = (await readNotificationInbox(f.student.id)).notices[0];
  const old = await db.classOccurrence.findFirstOrThrow({ where: { publicationId: publication.publicationId } });
  assert.equal(original.changes[0].status, "Published assignment");
  // Synthetic successor models the output of a later scheduler while preserving the first publication.
  const { id: oldId, ...assignment } = old;
  const newDate = "2099-01-21";
  await db.$transaction(async tx => {
    await tx.resourceReservation.deleteMany({ where: { occurrenceId: oldId } });
    await tx.classOccurrence.update({ where: { id: oldId }, data: { schedulingStatus: "CANCELLED" } });
    await tx.classOccurrence.create({ data: {
      ...assignment, replacesId: oldId, localDate: newDate, startAt: instant(newDate, 540), endAt: instant(newDate, 600),
      publicationId: null, resolutionTier: null, resolved: false,
    } });
  });
  const historic = (await readNotification(f.student.id, original.id)).changes[0];
  assert.equal(historic.status, "Historical assignment · superseded");
  assert.equal(historic.after, original.changes[0].after);
  assert.equal(historic.timetableHref, `/timetable?semester=${f.semester.id}&week=${newDate}`);
  assert.equal((await changeNotification(f.student.id, { notificationId: original.id, operation: "acknowledge" })).ok, true);
}));

test("competing different obligations target the same faculty, section and room; department lock allows only one publication", () => fixture(async f => {
  const one = await choose(f, [0]), two = await choose(f, [1], f.admin.id);
  const a = one.items[0].selected!.assignments[0], b = two.items[1].selected!.assignments[0];
  assert.equal(a.date, b.date); assert.equal(a.startMinute, b.startMinute); assert.equal(a.roomId, b.roomId); assert.notEqual(a.obligationId, b.obligationId);
  const [c1, c2] = [await command(f, one), await command(f, two, f.admin.id)];
  const results = await Promise.all([changePublication(f.coordinator.id, c1), changePublication(f.admin.id, c2)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => code(r) === "STALE_VERSION").length, 1, JSON.stringify(results));
  assert.equal(await db.schedulePublication.count({ where: { departmentId: f.departmentId } }), 1); await noOverlaps(f);
}));
test("partial publication keeps unselected obligations explicitly unresolved, supersedes their previews and requires recompute/save", () => fixture(async f => {
  const b = await choose(f, [0, 1]), unselected = b.items[1].original, stale = await command(f, b, f.coordinator.id, [unselected.occurrenceId]);
  const before = await db.teachingObligation.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } });
  good(await changePublication(f.coordinator.id, await command(f, b, f.coordinator.id, [b.items[0].original.occurrenceId])));
  assert.equal(code(await changePublication(f.coordinator.id, stale)), "STALE_VERSION");
  const item = await db.resolutionItem.findFirstOrThrow({ where: { occurrenceId: unselected.occurrenceId } }); assert.equal(item.status, "SUPERSEDED"); assert.equal((await readLeaveWorkspace(f.coordinator.id, f.leaveId)).detail!.unresolved, 1);
  assert.equal(await db.classOccurrence.count({ where: { teachingObligationId: unselected.obligationId, schedulingStatus: "ACTIVE" } }), 0);
  const current = await board(f); assert.equal(current.items.length, 1); assert.equal(current.items[0].original.occurrenceId, unselected.occurrenceId); assert.equal(current.stale, true);
  const saved = await save(f, current, current.decisions); good(await changePublication(f.coordinator.id, await command(f, saved)));
  assert.deepEqual(await db.teachingObligation.findMany({ where: { departmentId: f.departmentId }, orderBy: { id: "asc" } }), before);
  assert.equal((await board(f)).items.length, 0);
}));
test("revision change in any department semester and draft edits invalidate the exact preview", () => fixture(async f => {
  const b = await choose(f), c = await command(f, b);
  const semester = await db.semester.create({ data: { departmentId: f.departmentId, code: "SECOND", name: "Synthetic cross-semester revision", startDate: f.semester.startDate, endDate: f.semester.endDate } });
  assert.equal(code(await changePublication(f.coordinator.id, c)), "STALE_VERSION");
  await db.semester.delete({ where: { id: semester.id } });
  await save(f, await board(f), b.decisions);
  assert.equal(code(await changePublication(f.coordinator.id, c)), "STALE_VERSION");
  assert.equal(await db.schedulePublication.count({ where: { departmentId: f.departmentId } }), 0);
}));
test("one invalid selected candidate rejects the whole batch even when revision did not advance", () => fixture(async f => {
  const b = await choose(f, [0, 1]), c = await command(f, b), second = b.items[1].selected!.assignments[0];
  // Simulate an externally changed resource bypassing application revision invalidation.
  await db.facultyAvailability.updateMany({ where: { facultyId: second.facultyId, weekday: 2 }, data: { startMinute: second.endMinute } });
  const before = await state(f); assert.equal(code(await changePublication(f.coordinator.id, c)), "CONFLICT"); assert.deepEqual(await state(f), before);
}));
for (const table of ["Notification", "MutationReceipt"]) test(`late ${table} failure rolls back the entire selected batch, history, reservations, plan/items, publication, revisions and side effects`, () => fixture(async f => {
  const b = await choose(f, [0, 1]), c = await command(f, b), before = await state(f), name = `publication_fault_${randomUUID().replaceAll("-", "")}`;
  // Target only this synthetic fixture; a receipt fault happens after notifications.
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK ("departmentId" <> '${f.departmentId}') NOT VALID`);
  try { assert.equal((await changePublication(f.coordinator.id, c)).ok, false); assert.deepEqual(await state(f), before); }
  finally { await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`); }
  good(await changePublication(f.coordinator.id, c)); assert.equal(await db.schedulePublication.count({ where: { departmentId: f.departmentId } }), 1);
}));
test("direct authorization checks anonymous, wrong roles, foreign entity, other owner, revoked actors and strict browser shapes including replay", () => fixture(async f => {
  const b = await choose(f), c = await command(f, b);
  for (const id of [f.teacher.id, f.hod.id, f.student.id, f.admin.id]) assert.equal(code(await changePublication(id, c)), "FORBIDDEN");
  assert.equal(code(await changePublication(null, c)), "UNAUTHORIZED");
  const foreign = await resolutionFixture(db, "synthetic");
  try { assert.equal(code(await changePublication(foreign.coordinator.id, c)), "FORBIDDEN"); } finally { await cleanupTimetable(db, foreign.departmentId); }
  assert.equal(code(await changePublication(f.coordinator.id, { ...c, actorId: f.coordinator.id })), "VALIDATION_ERROR");
  assert.equal(code(await changePublication(f.coordinator.id, { ...c, occurrenceIds: [...c.occurrenceIds, ...c.occurrenceIds] })), "VALIDATION_ERROR");
  good(await changePublication(f.coordinator.id, c));
  await db.user.update({ where: { id: f.coordinator.id }, data: { active: false } });
  assert.equal(code(await changePublication(f.coordinator.id, c)), "UNAUTHORIZED");
  await db.user.update({ where: { id: f.coordinator.id }, data: { active: true, role: "FACULTY" } }); assert.equal(code(await changePublication(f.coordinator.id, c)), "FORBIDDEN");
}));
test("actor is reloaded after waiting for concurrent revocation", () => fixture(async f => {
  const c = await command(f, await choose(f));
  let release!: () => void, ready!: () => void;
  const hold = new Promise<void>(r => { release = r; }), locked = new Promise<void>(r => { ready = r; });
  const revoke = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${f.coordinator.id} FOR UPDATE`; await tx.user.update({ where: { id: f.coordinator.id }, data: { active: false } }); ready(); await hold; });
  await locked; const publish = changePublication(f.coordinator.id, c); release(); await revoke;
  assert.equal(code(await publish), "UNAUTHORIZED"); assert.equal(await db.schedulePublication.count({ where: { departmentId: f.departmentId } }), 0);
}));
test("substitute needs exact acceptance; accepted deadline may pass, committed assignment cannot be cancelled and master guards use assigned teacher", async () => {
  const f = await coverFixture(db);
  try {
    const b = await choose(f), preview = good(await changePublication(f.coordinator.id, input(f, b))).preview!;
    assert.match(preview.blockers.join(), /accepted cover/); assert.equal(code(await changePublication(f.coordinator.id, { ...input(f, b), operation: "publish", previewFingerprint: preview.fingerprint })), "CONFLICT");
    const selected = b.items[0].selected!, invite = await changeCover(f.coordinator.id, { operation: "invite", leaveId: f.leaveId, occurrenceId: b.items[0].original.occurrenceId, candidateId: selected.id, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() }); assert.ok(invite.ok);
    const request = await db.substitutionRequest.findUniqueOrThrow({ where: { id: invite.id } });
    assert.ok((await changeCover(request.invitedUserId, { operation: "accept", id: request.id, requestId: randomUUID() })).ok);
    await db.substitutionRequest.update({ where: { id: request.id }, data: { createdAt: new Date(Date.now() - 10000), expiresAt: new Date(Date.now() - 1000) } });
    const c = await command(f, await board(f)); good(await changePublication(f.coordinator.id, c));
    const replacement = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, publicationId: { not: null } } }); assert.equal(replacement.facultyId, selected.assignments[0].facultyId); assert.equal(replacement.localDate, b.items[0].original.date);
    await db.$transaction(tx => guardPublishedSchedule(tx, f.departmentId));
    const view = await readCoverWorkspace(request.invitedUserId); assert.equal(view.covers[0].published, true); assert.equal(view.covers[0].stale, false);
    assert.equal((await changeCover(f.coordinator.id, { operation: "cancel-cover", id: request.id, requestId: randomUUID() })).code, "CONFLICT");
    const qualification = await db.facultyQualification.findFirstOrThrow({ where: { facultyId: replacement.facultyId, courseId: f.allocations[0].courseId } });
    assert.equal((await changeMasterData(f.admin.id, { operation: "archive", kind: "facultyQualification", id: qualification.id, expectedVersion: qualification.version, requestId: randomUUID() })).code, "CONFLICT");
  } finally { await cleanupTimetable(db, f.departmentId); }
});
test("changed or revoked consent after preview cannot publish or partially reserve a substitute", async () => {
  const f = await coverFixture(db);
  try {
    const b = await choose(f), candidate = b.items[0].selected!;
    const r = await changeCover(f.coordinator.id, { operation: "invite", leaveId: f.leaveId, occurrenceId: b.items[0].original.occurrenceId, candidateId: candidate.id, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() }); assert.ok(r.ok);
    const invite = await db.substitutionRequest.findUniqueOrThrow({ where: { id: r.id } }); assert.ok((await changeCover(invite.invitedUserId, { operation: "accept", id: invite.id, requestId: randomUUID() })).ok);
    const c = await command(f, await board(f));
    assert.ok((await changeCover(f.coordinator.id, { operation: "cancel-cover", id: invite.id, requestId: randomUUID() })).ok);
    const before = await state(f); assert.equal(code(await changePublication(f.coordinator.id, c)), "STALE_VERSION"); assert.deepEqual(await state(f), before);
  } finally { await cleanupTimetable(db, f.departmentId); }
});
test("Saturday needs exact HoD approval and persists approved Saturday in student reads with no delivery credit", () => fixture(async f => {
  await saturdayOnly(db, f); const b = await choose(f), candidate = b.items[0].selected!; assert.equal(candidate.tier, 5);
  assert.match(good(await changePublication(f.coordinator.id, input(f, b))).preview!.blockers.join(), /HoD approval/);
  const r = await changeCover(f.coordinator.id, { operation: "request-exception", leaveId: f.leaveId, occurrenceId: b.items[0].original.occurrenceId, candidateId: candidate.id, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID(), reason: "Synthetic earlier tiers exhausted" }); assert.ok(r.ok);
  assert.ok((await changeCover(f.hod.id, { operation: "approve-exception", id: r.id, requestId: randomUUID(), reason: "Synthetic exact Saturday reviewed" })).ok);
  good(await changePublication(f.coordinator.id, await command(f, await board(f))));
  const row = (await readTimetable(f.student.id)).occurrences.find(o => o.resolutionTier === 5)!; assert.ok(row); assert.equal(row.deliveryStatus, "PENDING"); assert.equal(row.localDate, candidate.assignments[0].date);
  // Other fixture weekdays were deliberately made unavailable to force Saturday; check only the published recovery.
  assert.equal(await db.resourceReservation.count({ where: { occurrenceId: row.id } }), 3);
}));
test("online publication validates safe HTTPS links, reserves faculty/section only and survives later master-data validation", () => fixture(async f => {
  await db.department.update({ where: { id: f.departmentId }, data: { onlineTeachingEnabled: true } });
  // Synthetic fixture forces the online tier by making rooms unavailable.
  await db.room.updateMany({ where: { departmentId: f.departmentId }, data: { archived: true } });
  const b = await choose(f), id = b.items[0].original.occurrenceId; assert.equal(b.items[0].selected!.tier, 4);
  for (const value of ["", "javascript:alert(1)", "http://meet.example.test/class", "https://user:secret@meet.example.test/class"]) {
    const p = good(await changePublication(f.coordinator.id, input(f, b, [id], { [id]: value }))).preview!;
    assert.match(p.blockers.join(), /HTTPS meeting URL/);
    assert.equal(code(await changePublication(f.coordinator.id, { ...input(f, b, [id], { [id]: value }), operation: "publish", previewFingerprint: p.fingerprint })), "CONFLICT");
  }
  assert.equal(code(await changePublication(f.coordinator.id, input(f, b, [id], { [id]: "https://meet.example.test/class", foreign: "https://meet.example.test/other" }))), "VALIDATION_ERROR");
  good(await changePublication(f.coordinator.id, await command(f, b, f.coordinator.id, [id], { [id]: "https://meet.example.test/class" })));
  const row = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, publicationId: { not: null } } });
  assert.equal(row.roomId, null); assert.equal(row.meetingUrl, "https://meet.example.test/class"); assert.equal(row.deliveryStatus, "PENDING");
  assert.deepEqual((await db.resourceReservation.findMany({ where: { occurrenceId: row.id } })).map(r => r.resourceType).sort(), ["FACULTY", "SECTION"]);
  await db.room.updateMany({ where: { departmentId: f.departmentId }, data: { archived: false } });
  await db.$transaction(tx => guardPublishedSchedule(tx, f.departmentId));
  const student = (await readTimetable(f.student.id)).occurrences.find(o => o.id === row.id)!; assert.equal(student.room, "Online"); assert.equal(student.meetingUrl, row.meetingUrl);
  await db.department.update({ where: { id: f.departmentId }, data: { onlineTeachingEnabled: false } });
  await assert.rejects(db.$transaction(tx => guardPublishedSchedule(tx, f.departmentId)), /ONLINE_POLICY/);
}));
test("equal-duration swaps release and replace both sides atomically, and a late receipt failure restores both originals", () => fixture(async f => {
  const user = await db.user.create({ data: { departmentId: f.departmentId, email: `${randomUUID()}@swap.slotwise.test`, name: "Synthetic swap partner", passwordHash: "synthetic", role: "FACULTY" } });
  const faculty = await db.faculty.create({ data: { departmentId: f.departmentId, userId: user.id, designation: "Lecturer", targetMinutesPerWeek: 720, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080 } });
  await db.facultyQualification.create({ data: { departmentId: f.departmentId, facultyId: faculty.id, courseId: f.allocations[1].courseId } });
  for (const weekday of [1, 2]) await db.facultyAvailability.create({ data: { departmentId: f.departmentId, facultyId: faculty.id, weekday, startMinute: 540, endMinute: 1020 } });
  const entry = await db.timetableEntry.findFirstOrThrow({ where: { departmentId: f.departmentId, allocationId: f.allocations[1].id } });
  // Add an ordinary active Tuesday partner for the same section, with its own teacher.
  const obligation = await db.teachingObligation.create({ data: { departmentId: f.departmentId, allocationId: f.allocations[1].id, seriesId: randomUUID(), weekDate: "2099-01-05", originalDate: "2099-01-06", requiredMinutes: 60 } });
  const partner = await db.classOccurrence.create({ data: { departmentId: f.departmentId, entryId: entry.id, teachingObligationId: obligation.id, facultyId: faculty.id, sectionId: f.section.id, roomId: f.room2.id, localDate: "2099-01-06", startAt: instant("2099-01-06", 540), endAt: instant("2099-01-06", 600) } });
  await db.resourceReservation.createMany({ data: ([['FACULTY', faculty.id], ['SECTION', f.section.id], ['ROOM', f.room2.id]] as const).map(([resourceType, resourceId]) => ({ departmentId: f.departmentId, occurrenceId: partner.id, resourceType, resourceId, startAt: partner.startAt, endAt: partner.endAt })) });
  const b = await choose(f); assert.equal(b.items[0].selected!.tier, 2);
  const c = await command(f, b), before = await state(f), name = `swap_fault_${randomUUID().replaceAll("-", "")}`;
  await db.$executeRawUnsafe(`ALTER TABLE "MutationReceipt" ADD CONSTRAINT "${name}" CHECK ("id" <> '${c.requestId}') NOT VALID`);
  try { assert.equal((await changePublication(f.coordinator.id, c)).ok, false); assert.deepEqual(await state(f), before); }
  finally { await db.$executeRawUnsafe(`ALTER TABLE "MutationReceipt" DROP CONSTRAINT "${name}"`); }
  good(await changePublication(f.coordinator.id, c)); const after = await state(f);
  assert.deepEqual(after.obligations, before.obligations); assert.equal(after.occurrences.filter(o => o.publicationId).length, 2);
  assert.equal(after.occurrences.find(o => o.id === partner.id)!.schedulingStatus, "CANCELLED");
  const replacement = after.occurrences.find(o => o.replacesId === partner.id)!; assert.equal(replacement.facultyId, faculty.id); assert.equal(replacement.localDate, "2099-01-05");
  assert.equal(replacement.deliveryStatus, "PENDING"); assert.equal(await db.resourceReservation.count({ where: { occurrenceId: partner.id } }), 0); await noOverlaps(f);
}));
test("a conflicting destination inserted after preview without revision rejects every selected change", () => fixture(async f => {
  const b = await choose(f, [0, 1]), c = await command(f, b), destination = b.items[1].selected!.assignments[0];
  const entry = await db.timetableEntry.findFirstOrThrow({ where: { departmentId: f.departmentId } });
  const blockerEntry = await db.timetableEntry.create({ data: { departmentId: f.departmentId, timetableVersionId: entry.timetableVersionId, seriesId: randomUUID(), allocationId: f.allocations[1].id, roomId: destination.roomId!, weekday: 2, startMinute: destination.startMinute, endMinute: destination.endMinute } });
  const obligation = await db.teachingObligation.create({ data: { departmentId: f.departmentId, allocationId: f.allocations[1].id, seriesId: blockerEntry.seriesId, weekDate: "2099-01-05", originalDate: destination.date, requiredMinutes: 60 } });
  const row = await db.classOccurrence.create({ data: { departmentId: f.departmentId, entryId: blockerEntry.id, teachingObligationId: obligation.id, facultyId: destination.facultyId, sectionId: destination.sectionId, roomId: destination.roomId, localDate: destination.date, startAt: instant(destination.date, destination.startMinute), endAt: instant(destination.date, destination.endMinute) } });
  await db.resourceReservation.createMany({ data: ([['FACULTY', row.facultyId], ['SECTION', row.sectionId], ['ROOM', row.roomId!]] as const).map(([resourceType, resourceId]) => ({ departmentId: f.departmentId, occurrenceId: row.id, resourceType, resourceId, startAt: row.startAt, endAt: row.endAt })) });
  const before = await state(f); assert.equal(code(await changePublication(f.coordinator.id, c)), "CONFLICT"); assert.deepEqual(await state(f), before); await noOverlaps(f);
}));
test("publication rechecks class start after waiting for the department lock", t => fixture(async f => {
  const b = await choose(f), c = await command(f, b), a = b.items[0].selected!.assignments[0];
  let release!: () => void, ready!: () => void;
  const hold = new Promise<void>(r => { release = r; }), locked = new Promise<void>(r => { ready = r; });
  const locker = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${f.departmentId} FOR UPDATE`; ready(); await hold; });
  await locked;
  const publication = changePublication(f.coordinator.id, c);
  t.mock.timers.enable({ apis: ["Date"], now: instant(a.date, a.startMinute) });
  try { release(); await locker; assert.equal((await publication).ok, false); assert.equal(await db.schedulePublication.count({ where: { departmentId: f.departmentId } }), 0); }
  finally { t.mock.timers.reset(); release(); }
}));
async function acceptedSubstitute(f: Fixture) {
  const b = await choose(f), candidate = b.items[0].selected!;
  const result = await changeCover(f.coordinator.id, { operation: "invite", leaveId: f.leaveId, occurrenceId: b.items[0].original.occurrenceId, candidateId: candidate.id, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() }); assert.ok(result.ok);
  const invite = await db.substitutionRequest.findUniqueOrThrow({ where: { id: result.id } });
  assert.ok((await changeCover(invite.invitedUserId, { operation: "accept", id: invite.id, requestId: randomUUID() })).ok);
  return { command: await command(f, await board(f)), invite, candidate };
}
test("publication locks proposed assignees before Department, closing the concurrent account-revocation validation window", async () => {
  const f = await coverFixture(db);
  try {
    const accepted = await acceptedSubstitute(f);
    let release!: () => void, ready!: (pid: number) => void;
    const hold = new Promise<void>(r => { release = r; }), locked = new Promise<number>(r => { ready = r; });
    const locker = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${f.departmentId} FOR UPDATE`; const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; ready(pid); await hold; });
    const pid = await locked;
    const publishing = changePublication(f.coordinator.id, accepted.command);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const [{ count }] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
        if (count) { waiting = true; break; }
        await new Promise(r => setTimeout(r, 10));
      }
      assert.ok(waiting, "Publication must reach the held Department lock after acquiring user locks.");
      await assert.rejects(db.$transaction(tx => tx.$queryRaw`SELECT id FROM "User" WHERE id = ${accepted.invite.invitedUserId} FOR NO KEY UPDATE NOWAIT`), /could not obtain lock|55P03/);
    } finally { release(); await locker; }
    good(await publishing);
  } finally { await cleanupTimetable(db, f.departmentId); }
});
test("simultaneous substitute qualification removal and publication serialize with exactly one valid outcome", async () => {
  const f = await coverFixture(db);
  try {
    const accepted = await acceptedSubstitute(f), facultyId = accepted.candidate.assignments[0].facultyId;
    const qualification = await db.facultyQualification.findFirstOrThrow({ where: { facultyId, courseId: f.allocations[0].courseId } });
    const [published, archived] = await Promise.all([changePublication(f.coordinator.id, accepted.command), changeMasterData(f.admin.id, { operation: "archive", kind: "facultyQualification", id: qualification.id, expectedVersion: qualification.version, requestId: randomUUID() })]);
    assert.equal([published, archived].filter(r => r.ok).length, 1);
    if (published.ok) { assert.equal(archived.code, "CONFLICT"); assert.equal((await db.facultyQualification.findUniqueOrThrow({ where: { id: qualification.id } })).archived, false); }
    else { assert.equal(published.code, "STALE_VERSION"); assert.equal(await db.schedulePublication.count({ where: { departmentId: f.departmentId } }), 0); }
    await noOverlaps(f);
  } finally { await cleanupTimetable(db, f.departmentId); }
});
test("database independently rejects missing online links and invalid room/mode combinations", () => fixture(async f => {
  await db.department.update({ where: { id: f.departmentId }, data: { onlineTeachingEnabled: true } });
  await db.room.updateMany({ where: { departmentId: f.departmentId }, data: { archived: true } });
  const b = await choose(f), id = b.items[0].original.occurrenceId;
  good(await changePublication(f.coordinator.id, await command(f, b, f.coordinator.id, [id], { [id]: "https://meet.example.test/database-guard" })));
  const row = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, resolutionTier: 4 } });
  for (const data of [{ meetingUrl: null }, { meetingUrl: "http://meet.example.test/insecure" }, { roomId: f.room.id }, { resolutionTier: 3 }]) {
    await assert.rejects(db.classOccurrence.update({ where: { id: row.id }, data }), /occurrence_recovery_mode|check constraint/i);
    assert.deepEqual(await db.classOccurrence.findUniqueOrThrow({ where: { id: row.id } }), row);
  }
}));
