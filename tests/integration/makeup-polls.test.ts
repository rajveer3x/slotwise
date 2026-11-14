import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { instant } from "../../src/domain/scheduling/timetable";
import { getDb } from "../../src/server/db";
import { changeMasterData } from "../../src/server/services/master-data";
import { changeMakeupPoll, readMakeupPolls, readPollPreference } from "../../src/server/services/makeup-polls";
import { changePublication } from "../../src/server/services/publications";
import { changeResolution, readResolutionWorkspace } from "../../src/server/services/resolutions";
import { resolutionFixture } from "../support/resolution-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
after(() => db.$disconnect());

type Fixture = Awaited<ReturnType<typeof resolutionFixture>>;
const code = (result: { ok: boolean; code?: string }) => result.ok ? "OK" : result.code;
async function withFixture(run: (f: Fixture) => Promise<void>) {
  const f = await resolutionFixture(db, "synthetic-no-login");
  try {
    await db.sectionMembership.updateMany({ where: { userId: { in: [f.student.id, f.outsider.id] } }, data: { isRepresentative: true } });
    await run(f);
  } finally {
    await cleanupTimetable(db, f.departmentId);
  }
}
async function offer(f: Fixture) {
  const { board } = await readResolutionWorkspace(f.coordinator.id, f.leaveId);
  assert.ok(board);
  const item = board.items[0];
  assert.equal(item.tier, 3);
  const command = {
    operation: "open", requestId: randomUUID(), sourceId: f.leaveId, occurrenceId: item.original.occurrenceId,
    expectedToken: board.token, expectedVersion: board.planVersion, expectedPollId: null as string | null,
    deadline: instant("2099-01-05", 1020).toISOString(), candidateIds: item.candidates.slice(0, 2).map(c => c.id),
  };
  return { item, command, board };
}
async function opened(f: Fixture) {
  const input = await offer(f);
  const result = await changeMakeupPoll(f.coordinator.id, input.command);
  assert.ok(result.ok, JSON.stringify(result));
  return { ...input, pollId: result.pollId };
}
function vote(pollId: string, position: number) {
  return { operation: "vote", pollId, position, requestId: randomUUID() };
}

test("only the currently designated representative may read or vote, with one replacement preference after reload", () => withFixture(async f => {
  const { pollId } = await opened(f);
  const foreign = await resolutionFixture(db, "synthetic-no-login");
  try {
    const member = await db.user.create({ data: { departmentId: f.departmentId, role: "STUDENT", name: "Synthetic nonrepresentative", email: `${randomUUID()}@test.invalid`, passwordHash: "synthetic" } });
    await db.sectionMembership.create({ data: { departmentId: f.departmentId, sectionId: f.section.id, userId: member.id } });
    assert.equal(code(await changeMasterData(f.coordinator.id, { kind: "sectionMembership", operation: "save", requestId: randomUUID(),
      id: (await db.sectionMembership.findFirstOrThrow({ where: { userId: member.id } })).id, expectedVersion: 1,
      data: { sectionId: f.section.id, userId: member.id, isRepresentative: true } })), "VALIDATION_ERROR");
    for (const id of [member.id, f.outsider.id, f.teacher.id, f.coordinator.id, foreign.coordinator.id]) {
      assert.equal(code(await changeMakeupPoll(id, vote(pollId, 1))), "FORBIDDEN");
    }
    for (const id of [member.id, f.outsider.id, foreign.coordinator.id]) {
      await assert.rejects(readMakeupPolls(id, pollId), { code: "FORBIDDEN" });
      assert.equal((await readMakeupPolls(id)).polls.length, 0);
    }
    assert.equal(code(await changeMakeupPoll(null, vote(pollId, 1))), "UNAUTHORIZED");
    assert.equal(code(await changeMakeupPoll(f.student.id, vote(pollId, 3))), "VALIDATION_ERROR");
    const first = vote(pollId, 1);
    const saved = await changeMakeupPoll(f.student.id, first);
    assert.ok(saved.ok);
    assert.deepEqual(await changeMakeupPoll(f.student.id, first), saved);
    assert.equal((await readMakeupPolls(f.student.id, pollId)).polls[0].preference, 1);
    assert.ok((await changeMakeupPoll(f.student.id, vote(pollId, 2))).ok);
    assert.equal((await readMakeupPolls(f.student.id, pollId)).polls[0].preference, 2);
    assert.equal(await db.pollVote.count({ where: { pollId } }), 1);
    await db.sectionMembership.updateMany({ where: { userId: f.student.id }, data: { isRepresentative: false } });
    assert.equal(code(await changeMakeupPoll(f.student.id, first)), "FORBIDDEN");
    await db.sectionMembership.updateMany({ where: { userId: member.id }, data: { isRepresentative: true } });
    assert.equal((await readMakeupPolls(member.id, pollId)).polls[0].preference, null);
    assert.ok((await changeMakeupPoll(member.id, vote(pollId, 1))).ok);
    assert.equal((await db.pollVote.findUniqueOrThrow({ where: { pollId } })).voterId, member.id);
  } finally {
    await cleanupTimetable(db, foreign.departmentId);
  }
}));

test("exact deadline and mid-write expiry roll back, and two concurrent replacements retain one preference", () => withFixture(async f => {
  const { pollId, command } = await opened(f);
  const deadline = new Date(command.deadline);
  const before = new Date(deadline.getTime() - 1);
  const first = vote(pollId, 1), second = vote(pollId, 2);
  const results = await Promise.all([
    changeMakeupPoll(f.student.id, first, () => before),
    changeMakeupPoll(f.student.id, second, () => before),
  ]);
  assert.ok(results.every(r => r.ok));
  const saved = await db.pollVote.findUniqueOrThrow({ where: { pollId } });
  assert.equal(await db.pollVote.count({ where: { pollId } }), 1);
  assert.equal(code(await changeMakeupPoll(f.student.id, vote(pollId, 1), () => deadline)), "STALE_VERSION");
  const racing = vote(pollId, saved.position === 1 ? 2 : 1);
  let calls = 0;
  assert.equal(code(await changeMakeupPoll(f.student.id, racing, () => ++calls === 1 ? before : deadline)), "STALE_VERSION");
  assert.deepEqual(await db.pollVote.findUniqueOrThrow({ where: { pollId } }), saved);
  assert.equal(await db.mutationReceipt.count({ where: { id: racing.requestId } }), 0);
  await db.makeupPoll.update({ where: { id: pollId }, data: { createdAt: new Date(0), deadline: new Date(1) } });
  assert.equal((await readMakeupPolls(f.coordinator.id, pollId)).polls[0].status, "CLOSED");
}));

test("concurrent creation, replacement, cancellation and closure retain exact historical options", () => withFixture(async f => {
  const { command, item } = await offer(f);
  assert.equal(code(await changeMakeupPoll(f.student.id, command)), "FORBIDDEN");
  assert.equal(code(await changeMakeupPoll(f.coordinator.id, { ...command, candidateIds: [command.candidateIds[0], "forged"] })), "STALE_VERSION");
  const [a, b] = await Promise.all([
    changeMakeupPoll(f.coordinator.id, command),
    changeMakeupPoll(f.coordinator.id, { ...command, requestId: randomUUID() }),
  ]);
  assert.deepEqual([code(a), code(b)].sort(), ["OK", "STALE_VERSION"]);
  const winner = a.ok ? a : b;
  assert.ok(winner.ok);
  const originalId = winner.pollId;
  const initial = await db.makeupPollOption.findMany({ where: { pollId: originalId }, orderBy: { position: "asc" } });
  assert.ok((await changeMakeupPoll(f.student.id, vote(originalId, 1))).ok);
  const next = await changeMakeupPoll(f.coordinator.id, { ...command, expectedPollId: originalId,
    candidateIds: item.candidates.slice(1, 3).map(c => c.id), requestId: randomUUID() });
  assert.ok(next.ok, JSON.stringify(next));
  assert.deepEqual(await db.makeupPollOption.findMany({ where: { pollId: originalId }, orderBy: { position: "asc" } }), initial);
  assert.equal((await readMakeupPolls(f.coordinator.id, originalId)).polls[0].status, "SUPERSEDED");
  assert.equal(code(await changeMakeupPoll(f.student.id, vote(originalId, 2))), "STALE_VERSION");
  assert.ok((await changeMakeupPoll(f.coordinator.id, { operation: "close", pollId: next.pollId, requestId: randomUUID() })).ok);
  assert.equal(code(await changeMakeupPoll(f.student.id, vote(next.pollId, 1))), "STALE_VERSION");
  assert.equal((await readMakeupPolls(f.coordinator.id, next.pollId)).polls[0].preference, null);
  const last = await changeMakeupPoll(f.coordinator.id, { ...command, expectedPollId: next.pollId, requestId: randomUUID() });
  assert.ok(last.ok, JSON.stringify(last));
  assert.ok((await changeMakeupPoll(f.coordinator.id, { operation: "cancel", pollId: last.pollId, requestId: randomUUID() })).ok);
  assert.equal((await readMakeupPolls(f.coordinator.id, last.pollId)).polls[0].status, "CANCELLED");
}));

test("a closed poll confers no schedule changes, and its preferred slot still fails stale publication validation", () => withFixture(async f => {
  const where = { departmentId: f.departmentId };
  // This fixture's existing Monday classes would independently block a holiday edit.
  await db.resourceReservation.deleteMany({ where });
  await db.classOccurrence.deleteMany({ where: { ...where, schedulingStatus: "ACTIVE" } });
  const reservations = await db.resourceReservation.count({ where });
  const { item, board, pollId } = await opened(f);
  assert.ok((await changeMakeupPoll(f.student.id, vote(pollId, 1))).ok);
  assert.ok((await changeMakeupPoll(f.coordinator.id, { operation: "close", pollId, requestId: randomUUID() })).ok);
  const preferred = await readPollPreference(f.coordinator.id, f.leaveId, pollId);
  assert.equal(preferred.candidateId, item.candidates[0].id);
  assert.equal(await db.resourceReservation.count({ where }), reservations);
  assert.equal(await db.schedulePublication.count({ where }), 0);
  assert.equal(await db.deliveryRecord.count({ where }), 0);
  assert.equal(await db.notification.count({ where }), 0);
  assert.equal((await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision, board.revision);
  const decisions = { selected: { [preferred.occurrenceId]: preferred.candidateId! }, rejected: {} };
  const save = await changeResolution(f.coordinator.id, { operation: "save", leaveId: f.leaveId,
    decisions, expectedToken: board.token, expectedVersion: board.planVersion, requestId: randomUUID() });
  assert.ok(save.ok, JSON.stringify(save));
  const previewInput = { operation: "preview", leaveId: f.leaveId, occurrenceIds: [preferred.occurrenceId],
    expectedToken: save.board!.token, expectedVersion: save.board!.planVersion, requestId: randomUUID(), meetingUrls: {} };
  const preview = await changePublication(f.coordinator.id, previewInput);
  assert.ok(preview.ok, JSON.stringify(preview));
  const holiday = await changeMasterData(f.coordinator.id, { operation: "save", kind: "holiday", requestId: randomUUID(),
    data: { semesterId: f.semester.id, date: item.candidates[0].assignments[0].date, name: "Synthetic makeup conflict" } });
  assert.ok(holiday.ok, JSON.stringify(holiday));
  const published = await changePublication(f.coordinator.id, { ...previewInput, operation: "publish", requestId: randomUUID(),
    previewFingerprint: preview.preview!.fingerprint });
  assert.equal(code(published), "STALE_VERSION");
  assert.match(published.message, /recompute/i);
  const recomputed = await changeResolution(f.coordinator.id, { operation: "compute", leaveId: f.leaveId, decisions, expectedToken: save.board!.token, expectedVersion: save.board!.planVersion, requestId: randomUUID() });
  assert.ok(recomputed.ok, JSON.stringify(recomputed));
  assert.ok(recomputed.board!.items[0].selectionError);
  assert.equal(await db.schedulePublication.count({ where }), 0);
  assert.equal(await db.resourceReservation.count({ where }), reservations);
}));
