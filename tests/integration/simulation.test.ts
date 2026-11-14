import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getDb } from "../../src/server/db";
import { checkSimulation, readSimulationWorkspace, runSimulation } from "../../src/server/services/simulation";
import { changeMasterData } from "../../src/server/services/master-data";
import { simulationFixture } from "../support/simulation-fixture";
import { cleanupTimetable, timetableFixture } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
after(() => db.$disconnect());

type Fixture = Awaited<ReturnType<typeof simulationFixture>>;
async function withFixture(run: (f: Fixture) => Promise<void>) {
  const f = await simulationFixture(db);
  try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); }
}

const closure = (f: Fixture) => ({
  departmentId: f.departmentId, kind: "room", resourceId: f.room2.id,
  startDate: "2099-01-05", endDate: "2099-01-19",
});
async function compute(f: Fixture, input = closure(f)) {
  const response = await runSimulation(f.coordinator.id, input);
  assert.ok(response.ok, JSON.stringify(response));
  return response.result;
}
async function productionState(departmentId: string) {
  const where = { departmentId }, orderBy = { id: "asc" as const };
  return {
    semesters: await db.semester.findMany({ where, orderBy }),
    rooms: await db.room.findMany({ where, orderBy }),
    availability: await db.facultyAvailability.findMany({ where, orderBy }),
    classes: await db.classOccurrence.findMany({ where, orderBy }),
    obligations: await db.teachingObligation.findMany({ where, orderBy }),
    reservations: await db.resourceReservation.findMany({ where, orderBy }),
    delivery: await db.deliveryRecord.findMany({ where, orderBy }),
    notifications: await db.notification.findMany({ where, orderBy }),
    leave: await db.leaveRequest.findMany({ where, orderBy }),
    plans: await db.resolutionPlan.findMany({ where, orderBy }),
    audit: await db.auditEvent.findMany({ where, orderBy }),
    receipts: await db.mutationReceipt.findMany({ where, orderBy }),
  };
}

test("concurrent room simulation replays the same projection without writing to production", () => withFixture(async f => {
  const before = await productionState(f.departmentId);
  assert.ok(before.reservations.length && before.notifications.length);
  const [first, second] = await Promise.all([compute(f), compute(f)]);
  assert.deepEqual(first.items, second.items);
  assert.deepEqual(first.workload, second.workload);
  assert.equal(first.baseline.token, second.baseline.token);
  assert.equal(first.baseline.revisions[0].revision, 1);
  assert.equal(first.items.length, 4);
  assert.ok(first.items.every(item => item.original.room === "R2" && item.searchComplete));
  const labs = first.items.filter(item => item.original.course.startsWith("CS102"));
  assert.equal(labs[0].candidates.length, 0);
  assert.ok(labs[0].blockers.includes("Room closed in this simulation"));
  assert.ok(labs[0].blockers.some(reason => reason.includes("lab requires in-person")));
  assert.ok(labs[1].candidates[0].assignments.every(a => a.date > "2099-01-19" && a.room === "R2"));
  const theory = first.items.find(item => item.original.course.startsWith("CS101"))!;
  assert.equal(theory.candidates[0].tier, "Weekday");
  assert.equal(theory.candidates[0].assignments[0].room, "R1");
  assert.ok(first.workload.some(row => row.week === "2099-01-05" && row.baseline === 180 && row.projected === 60));
  assert.deepEqual(await checkSimulation(f.coordinator.id, { departmentId: f.departmentId, token: first.baseline.token }), { ok: true, stale: false });
  assert.deepEqual(await productionState(f.departmentId), before);
}));

test("faculty absence projects a qualified substitute and a committed master edit stales the retained result", () => withFixture(async f => {
  const support = await db.faculty.create({ data: {
    departmentId: f.departmentId, userId: f.hod.id, designation: "Synthetic substitute",
    targetMinutesPerWeek: 600, maxMinutesPerDay: 240, maxMinutesPerWeek: 960,
  } });
  await db.facultyQualification.create({ data: { departmentId: f.departmentId, facultyId: support.id, courseId: f.allocations[0].courseId } });
  await db.facultyAvailability.create({ data: { departmentId: f.departmentId, facultyId: support.id, weekday: 1, startMinute: 540, endMinute: 600 } });
  const input = { ...closure(f), kind: "faculty", resourceId: f.faculty.id, endDate: "2099-01-05" };
  const first = await compute(f, input);
  assert.equal(first.items.length, 2);
  assert.equal(first.items[0].candidates[0].tier, "Substitute");
  assert.equal(first.items[0].candidates[0].assignments[0].faculty, f.hod.name);
  assert.match(first.items[0].candidates[0].requires ?? "", /Faculty acceptance/);
  assert.ok(first.workload.some(row => row.faculty === f.hod.name && row.baseline === 0 && row.projected === 60));
  assert.ok(first.items.some(item => item.blockers.includes("Teacher absent in this simulation")));
  assert.ok(first.items.flatMap(i => i.candidates).flatMap(c => c.assignments)
    .every(a => a.date !== input.startDate || a.faculty !== f.teacher.name));

  const edit = await changeMasterData(f.coordinator.id, {
    kind: "room", operation: "save", requestId: randomUUID(), id: f.room.id, expectedVersion: 1,
    data: { code: f.room.code, name: f.room.name, type: f.room.type, capacity: 45 },
  });
  assert.ok(edit.ok, JSON.stringify(edit));
  const key = { departmentId: f.departmentId, token: first.baseline.token };
  assert.deepEqual(await checkSimulation(f.coordinator.id, key), { ok: true, stale: true });
  const refreshed = await compute(f, input);
  assert.equal(refreshed.baseline.revisions[0].revision, 2);
  assert.notEqual(refreshed.baseline.token, key.token);
  await db.user.update({ where: { id: f.hod.id }, data: { active: false } });
  assert.deepEqual(await checkSimulation(f.coordinator.id, { ...key, token: refreshed.baseline.token }), { ok: true, stale: true });
}));

test("scope is checked for both operations and invalid or empty ranges have clear outcomes", () => withFixture(async f => {
  const foreign = await timetableFixture(db);
  try {
    const input = closure(f);
    const { baseline } = await compute(f);
    const key = { departmentId: f.departmentId, token: baseline.token };
    for (const [id, code] of [[null, "UNAUTHORIZED"], [f.teacher.id, "FORBIDDEN"], [f.student.id, "FORBIDDEN"],
      [f.hod.id, "FORBIDDEN"], [foreign.coordinator.id, "FORBIDDEN"]] as const) {
      const [run, check] = await Promise.all([runSimulation(id, input), checkSimulation(id, key)]);
      assert.ok(!run.ok && !check.ok);
      assert.equal(run.code, code);
      assert.equal(check.code, code);
      await assert.rejects(readSimulationWorkspace(id, f.departmentId), { code });
    }
    const mixed = await runSimulation(f.coordinator.id, { ...input, resourceId: foreign.room2.id });
    assert.ok(!mixed.ok && mixed.code === "FORBIDDEN");
    assert.ok((await runSimulation(f.admin.id, input)).ok);
    for (const dates of [
      { startDate: "2099-01-06", endDate: "2099-01-05" },
      { startDate: "2099-01-05", endDate: "2099-02-05" },
      { startDate: "2099-01-00", endDate: "2099-01-09" },
      { startDate: "2098-12-31", endDate: "2099-01-05" },
    ]) {
      const outcome = await runSimulation(f.coordinator.id, { ...input, ...dates });
      assert.ok(!outcome.ok && outcome.code === "VALIDATION_ERROR");
    }
    const holiday = await compute(f, { ...input, startDate: "2099-01-12", endDate: "2099-01-12" });
    assert.deepEqual(holiday.items, []);
    assert.deepEqual(holiday.workload, []);
  } finally { await cleanupTimetable(db, foreign.departmentId); }
}));
