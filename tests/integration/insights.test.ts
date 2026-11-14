import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { addDays } from "../../src/domain/scheduling/timetable";
import { AccessError } from "../../src/server/auth/session";
import { getDb } from "../../src/server/db";
import { changeDelivery } from "../../src/server/services/delivery";
import { readLeaveRecovery, readWorkload } from "../../src/server/services/insights";
import { insightsFixture } from "../support/insights-fixture";
import { cleanupTimetable, timetableFixture } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
after(() => db.$disconnect());

async function fixture(run: (f: Awaited<ReturnType<typeof insightsFixture>>) => Promise<void>) {
  const f = await insightsFixture(db);
  try { await run(f); }
  finally { await cleanupTimetable(db, f.departmentId); }
}

test("weekly planned and delivered load use actual assignees and separate targets across local week boundaries", () => fixture(async f => {
  const report = await readWorkload(f.hod.id, { week: f.saturday });
  assert.equal(report.error, undefined);
  assert.equal(report.start, f.monday);
  assert.equal(report.end, addDays(f.monday, 6));
  assert.equal(report.data?.plannedClasses, 3);
  assert.equal(report.data?.deliveredClasses, 1);
  const cover = report.data?.rows?.find(row => row.id === f.cover.id);
  const teacher = report.data?.rows?.find(row => row.id === f.faculty.id);
  assert.deepEqual([cover?.plannedMinutes, cover?.deliveredMinutes, cover?.confirmedCovers, cover?.utilization], [60, 60, 1, 0.5]);
  assert.deepEqual([teacher?.plannedMinutes, teacher?.deliveredMinutes, teacher?.confirmedCovers, teacher?.utilization], [120, 0, 0, 120 / 720]);
  const next = await readWorkload(f.coordinator.id, { week: f.followingMonday });
  assert.equal(next.data?.plannedClasses, 1);
  assert.equal(next.data?.deliveredClasses, 0);
  const empty = await readWorkload(f.coordinator.id, { week: addDays(f.monday, -1) });
  assert.equal(empty.data?.plannedClasses, 0);
  assert.equal(empty.data?.deliveredClasses, 0);
}));

test("inclusive leave cohort yields 2/5 and one delivered; a replacement across weeks stays in the cohort", () => fixture(async f => {
  const range = { from: f.monday, to: f.friday };
  const report = await readLeaveRecovery(f.coordinator.id, range);
  assert.equal(report.error, undefined);
  assert.equal(report.data?.affected, 5);
  assert.equal(report.data?.weekdayRate, 0.4);
  assert.equal(report.data?.delivered, 1);
  assert.deepEqual(report.data?.categories?.map(row => [row.planned, row.delivered]), [[2, 1], [1, 0], [2, 0]]);
  assert.equal((await readLeaveRecovery(f.hod.id, { from: f.friday, to: f.friday })).data?.affected, 3);
  const empty = await readLeaveRecovery(f.hod.id, { from: f.followingMonday, to: f.followingMonday });
  assert.equal(empty.data?.affected, 0);
  assert.equal(empty.data?.weekdayRate, null);
  const confirmed = await changeDelivery(f.teacher.id, {
    operation: "confirm", occurrenceId: f.makeup.id, status: "HELD", expectedRecordId: null, requestId: randomUUID(),
  });
  assert.ok(confirmed.ok);
  const delivered = await readLeaveRecovery(f.coordinator.id, range);
  assert.equal(delivered.data?.weekdayRate, 0.4);
  assert.equal(delivered.data?.delivered, 2);

  await f.replace(f.missed, addDays(f.followingMonday, 1), 540, 3);
  const rescheduled = await readLeaveRecovery(f.hod.id, range);
  assert.equal(rescheduled.data?.affected, 5);
  assert.deepEqual(rescheduled.data?.categories?.map(row => [row.planned, row.delivered]), [[3, 2], [1, 0], [1, 0]]);

  // A real coordinator correction removes earned credit and an inactive missed slot
  // stops contributing planned load. A later correction restores delivery only.
  const current = await db.deliveryRecord.findFirstOrThrow({ where: { occurrenceId: f.substitute.id, current: true } });
  const corrected = await changeDelivery(f.coordinator.id, {
    operation: "correct", occurrenceId: f.substitute.id, status: "NOT_HELD", expectedRecordId: current.id,
    reason: "Synthetic missed cover", requestId: randomUUID(),
  });
  assert.ok(corrected.ok);
  assert.equal((await readLeaveRecovery(f.hod.id, range)).data?.delivered, 1);
  const after = (await readWorkload(f.hod.id, { week: f.monday })).data?.rows?.find(row => row.id === f.cover.id);
  assert.deepEqual([after?.plannedMinutes, after?.deliveredMinutes, after?.confirmedCovers], [0, 0, 0]);
  const restored = await changeDelivery(f.coordinator.id, {
    operation: "correct", occurrenceId: f.substitute.id, status: "HELD", expectedRecordId: corrected.recordId,
    reason: "Synthetic verified held cover", requestId: randomUUID(),
  });
  assert.ok(restored.ok);
  const final = (await readWorkload(f.hod.id, { week: f.monday })).data?.rows?.find(row => row.id === f.cover.id);
  assert.deepEqual([final?.plannedMinutes, final?.deliveredMinutes, final?.confirmedCovers], [0, 60, 1]);
  assert.equal((await readLeaveRecovery(f.hod.id, range)).data?.delivered, 2);
}));

test("reads reject forged department filters and return only the authenticated faculty member's workload", () => fixture(async f => {
  const other = await timetableFixture(db);
  try {
    for (const id of [null, f.student.id]) {
      await assert.rejects(readWorkload(id), AccessError);
      await assert.rejects(readLeaveRecovery(id), AccessError);
    }
    await assert.rejects(readLeaveRecovery(f.teacher.id), AccessError);
    await assert.rejects(readWorkload(f.admin.id, { department: other.departmentId }), AccessError);
    await assert.rejects(readLeaveRecovery(other.hod.id, { department: f.departmentId }), AccessError);
    const personal = await readWorkload(f.teacher.id, { week: f.monday });
    assert.deepEqual(personal.data?.rows?.map(row => row.id), [f.faculty.id]);
    assert.equal(personal.data?.plannedClasses, 2);
    assert.equal(personal.data?.deliveredClasses, 0);
    const report = await readLeaveRecovery(f.admin.id, { department: f.departmentId });
    assert.equal(report.data?.affected, 5);
    assert.doesNotMatch(JSON.stringify(report), /Private synthetic reason/);
    assert.ok((await readWorkload(f.teacher.id, { week: "2099-02-29" })).error);
    assert.ok((await readLeaveRecovery(f.hod.id, { from: f.friday, to: f.monday })).error);
    await db.user.update({ where: { id: f.hod.id }, data: { active: false } });
    await assert.rejects(readLeaveRecovery(f.hod.id), AccessError);
  } finally { await cleanupTimetable(db, other.departmentId); }
}));

test("reports see committed recovery changes together while another transaction is still writing", () => fixture(async f => {
  const range = { from: f.monday, to: f.friday };
  let markPending!: () => void;
  let allowCommit!: () => void;
  const pending = new Promise<void>(resolve => { markPending = resolve; });
  const commit = new Promise<void>(resolve => { allowCommit = resolve; });
  const write = db.$transaction(async tx => {
    await tx.classOccurrence.update({
      where: { id: f.saturdayRecovery.id }, data: { schedulingStatus: "CANCELLED", deliveryStatus: "NOT_HELD" },
    });
    markPending();
    await commit;
  });
  try {
    await Promise.race([pending, write]);
    const before = (await readLeaveRecovery(f.hod.id, range)).data;
    assert.deepEqual(before?.categories.map(row => row.planned), [2, 1, 2]);
  } finally {
    allowCommit();
    await write;
  }
  const after = (await readLeaveRecovery(f.hod.id, range)).data;
  assert.deepEqual(after?.categories.map(row => row.planned), [2, 0, 3]);
}));
