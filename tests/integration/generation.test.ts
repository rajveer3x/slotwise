import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getDb } from "../../src/server/db";
import { importGeneration, runGeneration } from "../../src/server/services/timetable-generation";
import { changeTimetable } from "../../src/server/services/timetable";
import { readAudit } from "../../src/server/services/audit";
import { timetableFixture, cleanupTimetable } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
after(() => db.$disconnect());
type Fixture = Awaited<ReturnType<typeof timetableFixture>>;
async function fixture(run: (f: Fixture) => Promise<void>) {
  const f = await timetableFixture(db);
  try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); }
}
const request = (f: Fixture) => ({ semesterId: f.semester.id, effectiveFrom: f.semester.startDate, seed: 42, expectedRevision: 0 });
async function generated(f: Fixture, revision = 0) {
  const result = await runGeneration(f.coordinator.id, { ...request(f), expectedRevision: revision });
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok(result.token);
  return { summary: result.summary, token: result.token };
}
function command(f: Fixture, draftId: string, revision: number) {
  return { semesterId: f.semester.id, draftId, expectedVersion: 1, expectedRevision: revision };
}

test("generated review is read-only, import retries commit once, and the editor publishes using normal guards", () => fixture(async f => {
  const { summary, token } = await generated(f);
  assert.equal(summary.placed, summary.required);
  assert.equal(await db.timetableVersion.count({ where: { departmentId: f.departmentId } }), 0);
  const repeat = await generated(f);
  assert.deepEqual(summary.entries, repeat.summary.entries);
  const save = { requestId: randomUUID(), token };
  const [result, duplicate] = await Promise.all([
    importGeneration(f.coordinator.id, save), importGeneration(f.coordinator.id, save),
  ]);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(result, duplicate);
  assert.equal(await db.timetableVersion.count({ where: { departmentId: f.departmentId } }), 1);
  for (const count of [
    await db.resourceReservation.count({ where: { departmentId: f.departmentId } }),
    await db.classOccurrence.count({ where: { departmentId: f.departmentId } }),
    await db.notification.count({ where: { departmentId: f.departmentId } }),
    await db.deliveryRecord.count({ where: { departmentId: f.departmentId } }),
  ]) assert.equal(count, 0);
  const events = await db.auditEvent.findMany({ where: { departmentId: f.departmentId } });
  assert.equal(events.length, 1);
  const audit = await readAudit(f.coordinator.id, { event: events[0].id });
  assert.match(JSON.stringify(audit.detail?.after.generation), /weekly-v1/);
  assert.match(JSON.stringify(audit.detail?.after.generation), /"seed":42/);

  const initial = command(f, result.draftId!, 0);
  const reviewed = await changeTimetable(f.coordinator.id, { ...initial, operation: "preview", requestId: randomUUID() });
  assert.ok(reviewed.preview?.count);
  const published = await changeTimetable(f.coordinator.id, {
    ...initial, operation: "publish", requestId: randomUUID(), previewFingerprint: reviewed.preview.fingerprint,
  });
  assert.ok(published.ok, JSON.stringify(published));
  const generatedAgain = await generated(f, 1);
  assert.equal(generatedAgain.summary.fixedCount, 2);
  const next = await importGeneration(f.coordinator.id, { requestId: randomUUID(), token: generatedAgain.token });
  assert.ok(next.ok);
  const ids = async (draftId: string) => (await db.timetableEntry.findMany({
    where: { timetableVersionId: draftId }, orderBy: { seriesId: "asc" },
  })).map(p => p.seriesId);
  assert.deepEqual(await ids(result.draftId!), await ids(next.draftId!));
}));

test("partial and stale generated drafts cannot publish, and stale proposals cannot open", () => fixture(async f => {
  await db.facultyQualification.updateMany({ where: { departmentId: f.departmentId, courseId: f.allocations[1].courseId }, data: { archived: true } });
  const { summary, token } = await generated(f);
  assert.equal(summary.placed, 1);
  assert.equal(summary.coverage.find(row => row.allocationId === f.allocations[1].id)?.placed, 0);
  const saved = await importGeneration(f.coordinator.id, { requestId: randomUUID(), token });
  assert.ok(saved.ok);
  const input = command(f, saved.draftId!, 0);
  const preview = await changeTimetable(f.coordinator.id, { ...input, operation: "preview", requestId: randomUUID() });
  assert.equal(preview.code, "CONFLICT");
  assert.deepEqual(preview.conflicts?.map(c => c.rule), ["INCOMPLETE"]);
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  const stale = await importGeneration(f.coordinator.id, { requestId: randomUUID(), token });
  assert.equal(stale.code, "STALE_VERSION");
  assert.equal((await changeTimetable(f.coordinator.id, {
    ...input, expectedRevision: 1, operation: "publish", requestId: randomUUID(), previewFingerprint: "b".repeat(64),
  })).code, "STALE_VERSION");
  assert.equal(await db.resourceReservation.count({ where: { departmentId: f.departmentId } }), 0);
}));

test("both operations enforce current role, department and proposal ownership", () => fixture(async f => {
  const anonymous = await runGeneration(null, request(f));
  assert.ok(!anonymous.ok);
  assert.equal(anonymous.code, "UNAUTHORIZED");
  for (const user of [f.teacher, f.student, f.hod]) {
    const result = await runGeneration(user.id, request(f));
    assert.ok(!result.ok);
    assert.equal(result.code, "FORBIDDEN");
  }
  await fixture(async foreign => {
    const invalid = await runGeneration(f.coordinator.id, request(foreign));
    assert.ok(!invalid.ok);
    assert.equal(invalid.code, "FORBIDDEN");
  });
  const { token } = await generated(f);
  const save = { requestId: randomUUID(), token };
  assert.equal((await importGeneration(f.student.id, save)).code, "FORBIDDEN");
  assert.equal((await importGeneration(f.admin.id, save)).code, "FORBIDDEN");
  assert.equal((await importGeneration(f.coordinator.id, { ...save, token: token + ".invalid" })).code, "VALIDATION_ERROR");
  await db.user.update({ where: { id: f.coordinator.id }, data: { active: false } });
  assert.equal((await importGeneration(f.coordinator.id, save)).code, "UNAUTHORIZED");
  assert.equal(await db.timetableVersion.count({ where: { departmentId: f.departmentId } }), 0);
}));
