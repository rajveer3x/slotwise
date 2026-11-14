import "dotenv/config";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getDb } from "../../src/server/db";
import { changeDelivery, readDeliveryWorkspace, readLedger } from "../../src/server/services/delivery";
import { changeResolution, readResolutionWorkspace } from "../../src/server/services/resolutions";
import { changePublication } from "../../src/server/services/publications";
import { readLeaveWorkspace } from "../../src/server/services/leave";
import { changeCover, readCoverWorkspace } from "../../src/server/services/covers";
import { coverFixture } from "../support/cover-fixture";
import { resolutionSnapshot } from "../../src/server/services/scheduling-store";
import { AccessError } from "../../src/server/auth/session";
import { cleanupTimetable } from "../support/timetable-fixture";
import { deliveryFixture } from "../support/delivery-fixture";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb(); after(() => db.$disconnect());
type Fixture = Awaited<ReturnType<typeof deliveryFixture>>;
async function fixture(run: (f: Fixture) => Promise<void>) { const f = await deliveryFixture(db); try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); } }
const confirm = (id: string, status = "HELD") => ({ operation: "confirm", occurrenceId: id, status, expectedRecordId: null, reason: "Synthetic confirmation review", requestId: randomUUID() });
const correct = (id: string, expectedRecordId: string, status = "NOT_HELD") => ({ ...confirm(id, status), operation: "correct", expectedRecordId, reason: "Synthetic reviewed correction" });
function good<T extends { ok: boolean }>(r: T): T & { ok: true } { assert.ok(r.ok, JSON.stringify(r)); return r as T & { ok: true }; }
const code = (r: { ok: boolean; code?: string }) => r.ok ? "OK" : r.code;
async function metrics(f: Fixture) { return (await readLedger(f.coordinator.id)).ledger.find(x => x.id === f.allocations[0].id)!; }
async function state(f: Fixture) {
  const where = { departmentId: f.departmentId }, orderBy = { id: "asc" as const };
  return { records: await db.deliveryRecord.findMany({ where, orderBy }), occurrences: await db.classOccurrence.findMany({ where, orderBy }), reservations: await db.resourceReservation.findMany({ where, orderBy }), revisions: await db.semester.findMany({ where, orderBy }), audit: await db.auditEvent.findMany({ where, orderBy }), receipts: await db.mutationReceipt.findMany({ where, orderBy }) };
}
async function recover(f: Fixture, sourceId = f.pastId) {
  const b = (await readResolutionWorkspace(f.coordinator.id, sourceId)).board!;
  assert.equal(b.items.length, 1); const item = b.items[0], candidate = item.candidates[0]; assert.ok(candidate);
  const saved = good(await changeResolution(f.coordinator.id, { operation: "save", leaveId: sourceId, decisions: { selected: { [sourceId]: candidate.id }, rejected: {} }, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() })).board!;
  const previewCommand = { operation: "preview", leaveId: sourceId, occurrenceIds: [sourceId], meetingUrls: {}, expectedToken: saved.token, expectedVersion: saved.planVersion, requestId: randomUUID() };
  const preview = good(await changePublication(f.coordinator.id, previewCommand)).preview!; assert.deepEqual(preview.blockers, []);
  const command = { ...previewCommand, operation: "publish", requestId: randomUUID(), previewFingerprint: preview.fingerprint };
  return { command, publish: () => changePublication(f.coordinator.id, command) };
}
test("future and ongoing classes reject delivery; exact end boundary permits full credit", async t => fixture(async f => {
  const o = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, schedulingStatus: "ACTIVE", id: { not: f.pastId } } });
  assert.equal(code(await changeDelivery(f.teacher.id, confirm(o.id))), "VALIDATION_ERROR");
  t.mock.timers.enable({ apis: ["Date"], now: new Date(o.endAt.getTime() - 1) });
  try { assert.equal(code(await changeDelivery(f.teacher.id, confirm(o.id))), "VALIDATION_ERROR"); t.mock.timers.setTime(o.endAt.getTime()); good(await changeDelivery(f.teacher.id, confirm(o.id))); }
  finally { t.mock.timers.reset(); }
}));
test("ended assigned class earns exactly one full obligation and duplicate retries are idempotent", () => fixture(async f => {
  const before = await metrics(f); assert.equal(before.delivered, 0); assert.equal(before.overdue, 60);
  const c = confirm(f.pastId), results = await Promise.all([changeDelivery(f.teacher.id, c), changeDelivery(f.teacher.id, c)]); results.forEach(good); assert.deepEqual(results[0], results[1]);
  good(await changeDelivery(f.coordinator.id, confirm(f.pastId)));
  const after = await metrics(f); assert.equal(after.delivered, 60); assert.equal(after.outstanding, 180); assert.equal(after.overdue, 0);
  assert.equal(await db.deliveryRecord.count({ where: { obligationId: f.obligationId } }), 1);
  assert.equal(await db.auditEvent.count({ where: { departmentId: f.departmentId, action: "DELIVERY_CONFIRMED" } }), 1);
  assert.equal(code(await changeDelivery(f.teacher.id, { ...c, status: "NOT_HELD" })), "CONFLICT");
  assert.equal((await db.classOccurrence.findUniqueOrThrow({ where: { id: f.pastId } })).schedulingStatus, "ACTIVE");
}));
test("concurrent different confirmations have one winner; changing recorded outcome needs coordinator correction", () => fixture(async f => {
  const results = await Promise.all([changeDelivery(f.teacher.id, confirm(f.pastId)), changeDelivery(f.coordinator.id, confirm(f.pastId, "NOT_HELD"))]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(code(results.find(r => !r.ok)!), "STALE_VERSION");
  assert.equal(await db.deliveryRecord.count({ where: { obligationId: f.obligationId, current: true } }), 1);
}));
test("authorized corrections reverse/replace credit with reason and keep both states and scheduling separate", () => fixture(async f => {
  const initial = good(await changeDelivery(f.teacher.id, confirm(f.pastId)));
  const c = correct(f.pastId, initial.recordId); const results = await Promise.all([changeDelivery(f.coordinator.id, c), changeDelivery(f.coordinator.id, c)]); results.forEach(good); assert.deepEqual(results[0], results[1]);
  assert.equal((await metrics(f)).delivered, 0); assert.equal((await metrics(f)).overdue, 60);
  const missed = await db.classOccurrence.findUniqueOrThrow({ where: { id: f.pastId } }); assert.equal(missed.deliveryStatus, "NOT_HELD"); assert.equal(missed.schedulingStatus, "CANCELLED");
  assert.equal(await db.resourceReservation.count({ where: { occurrenceId: f.pastId } }), 0);
  const restored = good(await changeDelivery(f.coordinator.id, correct(f.pastId, good(results[0]).recordId, "HELD")));
  const records = await db.deliveryRecord.findMany({ where: { occurrenceId: f.pastId }, orderBy: { createdAt: "asc" } }); assert.equal(records.length, 3); assert.equal(records.filter(r => r.current).length, 1); assert.equal(records.find(r => r.current)!.id, restored.recordId); assert.ok(records.filter(r => !r.current).every(r => r.supersededAt));
  assert.equal((await metrics(f)).delivered, 60); assert.equal((await db.classOccurrence.findUniqueOrThrow({ where: { id: f.pastId } })).schedulingStatus, "CANCELLED");
  const audits = await db.auditEvent.findMany({ where: { entityId: f.pastId, action: "DELIVERY_CORRECTED" } }); assert.equal(audits.length, 2); assert.ok(JSON.stringify(audits).includes(c.reason));
}));
test("competing corrections reject stale record identity, including same desired outcome", () => fixture(async f => {
  const initial = good(await changeDelivery(f.teacher.id, confirm(f.pastId)));
  const results = await Promise.all([changeDelivery(f.coordinator.id, correct(f.pastId, initial.recordId)), changeDelivery(f.coordinator.id, correct(f.pastId, initial.recordId))]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(code(results.find(r => !r.ok)!), "STALE_VERSION");
  assert.equal(code(await changeDelivery(f.coordinator.id, { ...correct(f.pastId, initial.recordId), reason: "  " })), "VALIDATION_ERROR");
}));
test("not-held recovery retains one requirement, source identity and overdue minutes; publication earns nothing", () => fixture(async f => {
  good(await changeDelivery(f.teacher.id, confirm(f.pastId, "NOT_HELD")));
  const before = await db.teachingObligation.findUniqueOrThrow({ where: { id: f.obligationId } }), m = await metrics(f), leaveCount = await db.leaveRequest.count({ where: { departmentId: f.departmentId } });
  good(await (await recover(f)).publish());
  assert.deepEqual(await db.teachingObligation.findUniqueOrThrow({ where: { id: f.obligationId } }), before);
  const plan = await db.resolutionPlan.findFirstOrThrow({ where: { sourceOccurrenceId: f.pastId } }); assert.equal(plan.leaveRequestId, null);
  assert.equal(await db.leaveRequest.count({ where: { departmentId: f.departmentId } }), leaveCount);
  const replacement = await db.classOccurrence.findFirstOrThrow({ where: { replacesId: f.pastId } }); assert.equal(replacement.teachingObligationId, f.obligationId); assert.equal(replacement.deliveryStatus, "PENDING"); assert.equal(replacement.leaveRequestId, null);
  const next = await metrics(f); assert.equal(next.delivered, m.delivered); assert.equal(next.overdue, m.overdue); assert.equal(next.outstanding, m.outstanding); assert.equal(next.planned, m.planned + 60);
  assert.equal(code(await changeDelivery(f.teacher.id, confirm(replacement.id))), "VALIDATION_ERROR");
}));
test("linked makeup delivery credits once and original history cannot double credit or override recovery", async t => fixture(async f => {
  const missed = good(await changeDelivery(f.teacher.id, confirm(f.pastId, "NOT_HELD"))); good(await (await recover(f)).publish());
  const replacement = await db.classOccurrence.findFirstOrThrow({ where: { replacesId: f.pastId } });
  t.mock.timers.enable({ apis: ["Date"], now: replacement.endAt });
  try {
    good(await changeDelivery(f.teacher.id, confirm(replacement.id)));
    assert.equal((await metrics(f)).delivered, 60);
    assert.equal(code(await changeDelivery(f.coordinator.id, correct(f.pastId, missed.recordId, "HELD"))), "CONFLICT");
    good(await changeDelivery(f.teacher.id, confirm(replacement.id)));
    assert.equal(await db.deliveryRecord.count({ where: { obligationId: f.obligationId, current: true, status: "HELD" } }), 1);
  } finally { t.mock.timers.reset(); }
}));
test("failed recovery can be marked not held and offered again as the same obligation", async t => fixture(async f => {
  good(await changeDelivery(f.teacher.id, confirm(f.pastId, "NOT_HELD"))); good(await (await recover(f)).publish());
  const replacement = await db.classOccurrence.findFirstOrThrow({ where: { replacesId: f.pastId } });
  t.mock.timers.enable({ apis: ["Date"], now: replacement.endAt });
  try {
    good(await changeDelivery(f.teacher.id, confirm(replacement.id, "NOT_HELD")));
    const b = (await readResolutionWorkspace(f.coordinator.id, replacement.id)).board!; assert.equal(b.items.length, 1); assert.equal(b.items[0].original.obligationId, f.obligationId); assert.ok(b.items[0].candidates.length);
    good(await (await recover(f, replacement.id)).publish());
    const next = await db.classOccurrence.findFirstOrThrow({ where: { replacesId: replacement.id } }); assert.equal(next.teachingObligationId, f.obligationId);
    assert.equal(await db.teachingObligation.count({ where: { id: f.obligationId } }), 1);
  } finally { t.mock.timers.reset(); }
}));
test("correction and recovery publication race cannot both change one obligation", () => fixture(async f => {
  const missed = good(await changeDelivery(f.teacher.id, confirm(f.pastId, "NOT_HELD"))), recovery = await recover(f);
  const results = await Promise.all([changeDelivery(f.coordinator.id, correct(f.pastId, missed.recordId, "HELD")), recovery.publish()]);
  assert.equal(results.filter(r => r.ok).length, 1, JSON.stringify(results));
  const active = await db.classOccurrence.count({ where: { teachingObligationId: f.obligationId, schedulingStatus: "ACTIVE" } });
  assert.ok(active <= 1); assert.ok((await metrics(f)).delivered <= 60);
}));
test("direct unauthorized operations and ledger scopes reject anonymous, student, wrong teacher, HoD/admin correction and cross department", () => fixture(async f => {
  const other = await deliveryFixture(db);
  try {
    for (const id of [null, f.student.id, f.outsider.id, f.hod.id, f.admin.id, other.teacher.id, other.coordinator.id]) assert.ok(!((await changeDelivery(id, confirm(f.pastId))).ok), String(id));
    const held = good(await changeDelivery(f.teacher.id, confirm(f.pastId)));
    for (const id of [f.teacher.id, f.hod.id, f.admin.id, f.student.id]) assert.equal(code(await changeDelivery(id, correct(f.pastId, held.recordId))), "FORBIDDEN");
    for (const id of [null, f.student.id, f.teacher.id]) await assert.rejects(readLedger(id), AccessError);
    await assert.rejects(readDeliveryWorkspace(other.coordinator.id, f.semester.id), AccessError);
    assert.ok((await readDeliveryWorkspace(f.teacher.id)).classes.every(c => c.faculty === f.teacher.name));
    assert.ok(!JSON.stringify(await readLedger(f.hod.id)).includes("Private browser resolution reason"));
    assert.ok((await readLedger(f.admin.id)).canViewLedger);
    await db.user.update({ where: { id: f.teacher.id }, data: { active: false } });
    assert.equal(code(await changeDelivery(f.teacher.id, confirm(f.pastId))), "UNAUTHORIZED");
  } finally { await cleanupTimetable(db, other.departmentId); }
}));
test("receipt replay rechecks current role and scope and rejects altered payload/actor", () => fixture(async f => {
  const c = confirm(f.pastId); good(await changeDelivery(f.teacher.id, c));
  assert.equal(code(await changeDelivery(f.coordinator.id, c)), "CONFLICT");
  assert.equal(code(await changeDelivery(f.teacher.id, { ...c, occurrenceId: "missing" })), "FORBIDDEN");
  await db.user.update({ where: { id: f.teacher.id }, data: { role: "STUDENT" } });
  assert.equal(code(await changeDelivery(f.teacher.id, c)), "FORBIDDEN");
}));
test("database independently rejects duplicate obligation credit, mismatched chain and partial credit", () => fixture(async f => {
  good(await changeDelivery(f.teacher.id, confirm(f.pastId)));
  const row = await db.deliveryRecord.findFirstOrThrow({ where: { occurrenceId: f.pastId } });
  const data = { departmentId: f.departmentId, obligationId: f.obligationId, occurrenceId: f.pastId, status: "HELD" as const, confirmedMinutes: 60, confirmedById: f.teacher.id };
  await assert.rejects(db.deliveryRecord.create({ data }));
  const original = await db.classOccurrence.findUniqueOrThrow({ where: { id: f.pastId } });
  const { id: _oldId, ...copy } = original;
  const another = await db.classOccurrence.create({ data: { ...copy, id: randomUUID(), schedulingStatus: "CANCELLED", deliveryStatus: "PENDING" } });
  assert.ok(_oldId);
  await assert.rejects(db.deliveryRecord.create({ data: { ...data, occurrenceId: another.id } }), (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "P2002");
  await assert.rejects(db.deliveryRecord.create({ data: { ...data, current: false, supersededAt: new Date(), confirmedMinutes: 30 } }));
  await assert.rejects(db.deliveryRecord.create({ data: { ...data, current: false, supersededAt: new Date(), obligationId: (await db.teachingObligation.findFirstOrThrow({ where: { departmentId: f.departmentId, id: { not: f.obligationId } } })).id } }));
  assert.equal((await db.deliveryRecord.findUniqueOrThrow({ where: { id: row.id } })).confirmedMinutes, 60);
}));
test("late audit/receipt failures roll back record reversal, occurrence, reservations and revisions", () => fixture(async f => {
  const held = good(await changeDelivery(f.teacher.id, confirm(f.pastId)));
  // Isolated, random actor key prevents affecting other concurrently running test files.
  for (const table of ["AuditEvent", "MutationReceipt"]) {
    const constraint = `delivery_fail_${randomUUID().replaceAll("-", "")}`;
    await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK ("actorId" <> '${f.coordinator.id}') NOT VALID`);
    try {
      const before = await state(f); assert.equal(code(await changeDelivery(f.coordinator.id, correct(f.pastId, held.recordId))), "ERROR"); assert.deepEqual(await state(f), before);
    } finally { await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`); }
  }
  good(await changeDelivery(f.coordinator.id, correct(f.pastId, held.recordId)));
}));
test("monthly confirmed-cover ranking uses delivered unique credits and reverses with correction", async t => fixture(async f => {
  good(await changeDelivery(f.teacher.id, confirm(f.pastId, "NOT_HELD"))); good(await (await recover(f)).publish());
  const replacement = await db.classOccurrence.findFirstOrThrow({ where: { replacesId: f.pastId } });
  await db.classOccurrence.update({ where: { id: replacement.id }, data: { resolutionTier: 1 } });
  t.mock.timers.enable({ apis: ["Date"], now: replacement.endAt });
  try {
    const held = good(await changeDelivery(f.teacher.id, confirm(replacement.id)));
    const snapshot = () => db.$transaction(tx => resolutionSnapshot(tx, f.departmentId, []));
    assert.equal((await snapshot()).faculty.find(x => x.id === f.faculty.id)!.confirmedCoversThisMonth, 1);
    good(await changeDelivery(f.coordinator.id, correct(replacement.id, held.recordId)));
    assert.equal((await snapshot()).faculty.find(x => x.id === f.faculty.id)!.confirmedCoversThisMonth, 0);
  } finally { t.mock.timers.reset(); }
}));

test("revocation is reloaded after the actor lock and cannot replay or confirm delivery", () => fixture(async f => {
  let release!: () => void, ready!: () => void;
  const hold = new Promise<void>(r => { release = r; }), locked = new Promise<void>(r => { ready = r; });
  const revoke = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${f.teacher.id} FOR NO KEY UPDATE`;
    await tx.user.update({ where: { id: f.teacher.id }, data: { active: false } }); ready(); await hold;
  });
  await locked;
  const confirmation = changeDelivery(f.teacher.id, confirm(f.pastId));
  release(); await revoke;
  assert.equal(code(await confirmation), "UNAUTHORIZED");
  assert.equal(await db.deliveryRecord.count({ where: { occurrenceId: f.pastId } }), 0);
}));
test("accepted substitute and published future makeup leave actual ledger credit unchanged", async () => {
  const f = await coverFixture(db);
  try {
    const b = (await readResolutionWorkspace(f.coordinator.id, f.leaveId)).board!, item = b.items[0], candidate = item.candidates[0]; assert.equal(candidate.tier, 1);
    const saved = good(await changeResolution(f.coordinator.id, { operation: "save", leaveId: f.leaveId, decisions: { selected: { [item.original.occurrenceId]: candidate.id }, rejected: {} }, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() })).board!;
    const invitation = good(await changeCover(f.coordinator.id, { operation: "invite", leaveId: f.leaveId, occurrenceId: item.original.occurrenceId, candidateId: candidate.id, expectedToken: saved.token, expectedVersion: saved.planVersion, requestId: randomUUID(), expiryHours: 24 }));
    const invite = await db.substitutionRequest.findUniqueOrThrow({ where: { id: invitation.id } });
    good(await changeCover(invite.invitedUserId, { operation: "accept", id: invite.id, requestId: randomUUID() }));
    assert.ok((await readLedger(f.coordinator.id)).ledger.every(r => r.delivered === 0));
    const command = { operation: "preview", leaveId: f.leaveId, occurrenceIds: [item.original.occurrenceId], meetingUrls: {}, expectedToken: saved.token, expectedVersion: saved.planVersion, requestId: randomUUID() };
    const p = good(await changePublication(f.coordinator.id, command)).preview!; assert.deepEqual(p.blockers, []);
    good(await changePublication(f.coordinator.id, { ...command, operation: "publish", previewFingerprint: p.fingerprint, requestId: randomUUID() }));
    assert.ok((await readLedger(f.coordinator.id)).ledger.every(r => r.delivered === 0));
    assert.equal(await db.deliveryRecord.count({ where: { departmentId: f.departmentId } }), 0);
  } finally { await cleanupTimetable(db, f.departmentId); }
});

test("a missed substitute retains original leave provenance for separate HoD Saturday approval", async t => {
  const f = await coverFixture(db);
  try {
    let b = (await readResolutionWorkspace(f.coordinator.id, f.leaveId)).board!, item = b.items[0], candidate = item.candidates[0];
    const save = (sourceId: string) => changeResolution(f.coordinator.id, { operation: "save", leaveId: sourceId, decisions: { selected: { [item.original.occurrenceId]: candidate.id }, rejected: {} }, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() });
    b = good(await save(f.leaveId)).board!;
    const invited = good(await changeCover(f.coordinator.id, { operation: "invite", leaveId: f.leaveId, occurrenceId: item.original.occurrenceId, candidateId: candidate.id, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID(), expiryHours: 24 }));
    const cover = await db.substitutionRequest.findUniqueOrThrow({ where: { id: invited.id } }); good(await changeCover(cover.invitedUserId, { operation: "accept", id: cover.id, requestId: randomUUID() }));
    const command = { operation: "preview", leaveId: f.leaveId, occurrenceIds: [item.original.occurrenceId], meetingUrls: {}, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID() };
    const p = good(await changePublication(f.coordinator.id, command)).preview!;
    good(await changePublication(f.coordinator.id, { ...command, operation: "publish", previewFingerprint: p.fingerprint, requestId: randomUUID() }));
    const replacement = await db.classOccurrence.findFirstOrThrow({ where: { replacesId: item.original.occurrenceId } });
    assert.equal((await readLeaveWorkspace(f.coordinator.id, f.leaveId)).detail!.unresolved, 1);
    await db.user.update({ where: { id: f.teacher.id }, data: { role: "HOD" } });
    t.mock.timers.enable({ apis: ["Date"], now: replacement.endAt });
    good(await changeDelivery(cover.invitedUserId, confirm(replacement.id, "NOT_HELD")));
    assert.equal((await readLeaveWorkspace(f.coordinator.id, f.leaveId)).detail!.unresolved, 2, "A missed replacement must restore its original leave obligation to the unresolved count");
    await db.facultyAvailability.updateMany({ where: { departmentId: f.departmentId }, data: { archived: true } });
    await db.facultyAvailability.create({ data: { departmentId: f.departmentId, facultyId: replacement.facultyId, weekday: 6, startMinute: 540, endMinute: 780 } });
    for (const startMinute of [540, 600, 660]) await db.timeSlot.create({ data: { departmentId: f.departmentId, weekday: 6, startMinute, endMinute: startMinute + 60, label: "Synthetic Saturday recovery" } });
    b = (await readResolutionWorkspace(f.coordinator.id, replacement.id)).board!; item = b.items[0]; candidate = item.candidates[0]; assert.equal(candidate.tier, 5);
    b = good(await save(replacement.id)).board!;
    const request = good(await changeCover(f.coordinator.id, { operation: "request-exception", leaveId: replacement.id, occurrenceId: replacement.id, candidateId: candidate.id, expectedToken: b.token, expectedVersion: b.planVersion, requestId: randomUUID(), reason: "Synthetic all earlier tiers exhausted" }));
    assert.equal((await readCoverWorkspace(f.teacher.id)).exceptions.find(x => x.id === request.id)!.canReview, false);
    assert.equal(code(await changeCover(f.teacher.id, { operation: "approve-exception", id: request.id, reason: "Own original leave", requestId: randomUUID() })), "FORBIDDEN");
    good(await changeCover(f.hod.id, { operation: "approve-exception", id: request.id, reason: "Separate HoD review", requestId: randomUUID() }));
    const missed = await db.deliveryRecord.findFirstOrThrow({ where: { occurrenceId: replacement.id, current: true } });
    good(await changeDelivery(f.coordinator.id, correct(replacement.id, missed.id, "HELD")));
    assert.equal((await readLeaveWorkspace(f.coordinator.id, f.leaveId)).detail!.unresolved, 1, "Confirmed delivery resolves that leave obligation even when its schedule remains cancelled");
  } finally { t.mock.timers.reset(); await cleanupTimetable(db, f.departmentId); }
});

test("coordinator initial confirmation requires and audits an override reason", () => fixture(async f => {
  assert.equal(code(await changeDelivery(f.coordinator.id, { ...confirm(f.pastId), reason: " " })), "VALIDATION_ERROR");
  const c = confirm(f.pastId); good(await changeDelivery(f.coordinator.id, c));
  const record = await db.deliveryRecord.findFirstOrThrow({ where: { occurrenceId: f.pastId } }); assert.equal(record.reason, c.reason);
  const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: f.pastId, action: "DELIVERY_CONFIRMED" } }); assert.ok(JSON.stringify(audit.after).includes(c.reason));
}));
