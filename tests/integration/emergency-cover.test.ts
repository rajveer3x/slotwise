import "dotenv/config";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { test } from "node:test";
import { instant } from "../../src/domain/scheduling/timetable";
import type { Candidate } from "../../src/domain/resolution/engine";
import { getDb } from "../../src/server/db";
import { changeCover } from "../../src/server/services/covers";
import { changeEmergencyCover, processEmergencyExpiry, readEmergencyCards, readEmergencyChoice } from "../../src/server/services/emergency-cover";
import { changePublication } from "../../src/server/services/publications";
import { changeResolution, readResolutionWorkspace } from "../../src/server/services/resolutions";
import { emergencyFixture } from "../support/emergency-fixture";
import { cleanupTimetable, timetableFixture } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
const date = "2099-01-05", morning = instant(date, 510);
const clock = () => morning;
type Fixture = Awaited<ReturnType<typeof emergencyFixture>>;
async function fixture(run: (f: Fixture) => Promise<void>, day = date) {
  const f = await emergencyFixture(db, day);
  try { await run(f); } finally { await cleanupTimetable(db, f.departmentId); }
}
const command = (operation: "accept" | "cancel", roundId: string) => ({ operation, roundId, requestId: randomUUID() });
const launchCommand = (f: Fixture, index = 0) => ({ operation: "launch", occurrenceId: f.occurrences[index].id, requestId: randomUUID() });
async function open(f: Fixture, now = clock, index = 0) {
  const result = await changeEmergencyCover(f.coordinator.id, launchCommand(f, index), now);
  assert.ok(result.ok, JSON.stringify(result));
  return db.emergencyRound.findUniqueOrThrow({ where: { id: result.id }, include: { offers: true } });
}
async function schedulingCounts(f: Fixture) {
  const where = { departmentId: f.departmentId };
  return {
    occurrences: await db.classOccurrence.count({ where }),
    reservations: await db.resourceReservation.count({ where }),
    publications: await db.schedulePublication.count({ where }),
    deliveries: await db.deliveryRecord.count({ where }),
    revision: (await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision,
  };
}
async function draft(f: Fixture, actorId: string, candidate: Candidate | string) {
  const itemId = f.occurrences[0].id;
  const { board } = await readResolutionWorkspace(actorId, f.leave.id);
  assert.ok(board);
  const result = await changeResolution(actorId, {
    operation: "save", leaveId: f.leave.id, requestId: randomUUID(), expectedToken: board.token, expectedVersion: board.planVersion,
    decisions: { ...board.decisions, selected: { [itemId]: typeof candidate === "string" ? candidate : candidate.id } },
  });
  assert.ok(result.ok && result.board, JSON.stringify(result));
  return {
    leaveId: f.leave.id, occurrenceIds: [itemId], meetingUrls: {}, expectedToken: result.board.token, expectedVersion: result.board.planVersion,
    requestId: randomUUID(),
  };
}

test("all eligible faculty receive offers, two valid accepts race, and the normal coordinator preview is required", () => fixture(async f => {
  const before = await schedulingCounts(f);
  const launch = launchCommand(f);
  const launches = await Promise.all([changeEmergencyCover(f.coordinator.id, launch, clock), changeEmergencyCover(f.coordinator.id, launch, clock)]);
  assert.deepEqual(launches[0], launches[1]);
  assert.ok(launches[0].ok, JSON.stringify(launches));
  const round = await db.emergencyRound.findUniqueOrThrow({ where: { id: launches[0].id }, include: { offers: true } });
  assert.equal(round.deadline.getTime() - round.createdAt.getTime(), 300000);
  assert.equal(round.offers.length, 4);
  assert.equal(await db.notification.count({ where: { changeId: `${round.id}:EMERGENCY_OPENED` } }), 4);
  assert.equal((await changeEmergencyCover(f.coordinator.id, launchCommand(f), clock)).ok, false);
  const pendingDraft = await draft(f, f.coordinator.id, round.offers[0].candidate as unknown as Candidate);
  const pendingPreview = await changePublication(f.coordinator.id, { ...pendingDraft, operation: "preview" });
  assert.ok(pendingPreview.ok, JSON.stringify(pendingPreview));
  assert.match(pendingPreview.preview?.blockers.join(" ") ?? "", /round is pending/);
  const coreInvite = await changeCover(f.coordinator.id, { operation: "invite", leaveId: f.leave.id, occurrenceId: f.occurrences[0].id,
    candidateId: (round.offers[0].candidate as unknown as Candidate).id, expectedToken: pendingDraft.expectedToken, expectedVersion: pendingDraft.expectedVersion, requestId: randomUUID() });
  assert.equal(coreInvite.code, "CONFLICT");

  const contenders = f.substitutes.slice(0, 2);
  const responses = contenders.map(() => command("accept", round.id));
  const results = await Promise.all(contenders.map((f, i) => changeEmergencyCover(f.user.id, responses[i], clock)));
  const index = results.findIndex(r => r.ok);
  assert.equal(results.filter(r => r.ok).length, 1, JSON.stringify(results));
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.code), ["ALREADY_FILLED"]);
  const winner = contenders[index];
  assert.deepEqual(await changeEmergencyCover(winner.user.id, responses[index], clock), results[index]);
  const stored = await db.emergencyRound.findUniqueOrThrow({ where: { id: round.id }, include: { winner: true } });
  assert.equal(stored.winnerUserId, winner.user.id);
  assert.equal(stored.status, "WON");
  assert.equal(await db.auditEvent.count({ where: { entityId: round.id, action: "EMERGENCY_WON" } }), 1);
  assert.equal(await db.notification.count({ where: { changeId: `${round.id}:EMERGENCY_WON` } }), 5);
  assert.deepEqual(await schedulingCounts(f), before);

  const consent = stored.winner!.candidate as unknown as Candidate;
  const adminDraft = await draft(f, f.admin.id, consent);
  const adminPreview = await changePublication(f.admin.id, { ...adminDraft, operation: "preview" });
  assert.ok(adminPreview.ok, JSON.stringify(adminPreview));
  assert.match(adminPreview.preview?.blockers.join(" ") ?? "", /requires publication by a departmental coordinator/);
  const winnerDraft = await draft(f, f.coordinator.id, consent);
  const preview = await changePublication(f.coordinator.id, { ...winnerDraft, operation: "preview" });
  assert.ok(preview.ok && preview.preview, JSON.stringify(preview));
  assert.deepEqual(preview.preview.blockers, []);
  assert.deepEqual(await schedulingCounts(f), before);
  const publish = await changePublication(f.coordinator.id, { ...winnerDraft, operation: "publish", previewFingerprint: preview.preview.fingerprint });
  assert.ok(publish.ok, JSON.stringify(publish));
  const replacement = await db.classOccurrence.findUniqueOrThrow({ where: { replacesId: f.occurrences[0].id } });
  assert.equal(replacement.facultyId, winner.faculty.id);
  assert.equal(replacement.deliveryStatus, "PENDING");
  assert.equal((await changeEmergencyCover(f.coordinator.id, command("cancel", round.id), clock)).ok, false);
}));

test("exclusive deadline, class-start cap, stale availability, and account/role/department scope", () => fixture(async f => {
  const nearStart = new Date(f.occurrences[0].startAt.getTime() - 60000);
  const started = await changeEmergencyCover(f.coordinator.id, launchCommand(f), () => f.occurrences[0].startAt);
  assert.ok(!started.ok && started.code === "CONFLICT");
  const tomorrow = await changeEmergencyCover(f.coordinator.id, launchCommand(f), () => new Date(morning.getTime() - 86400000));
  assert.ok(!tomorrow.ok && tomorrow.code === "CONFLICT");
  for (const actor of [null, f.admin.id, f.teacher.id, f.student.id]) {
    const denied = await changeEmergencyCover(actor, launchCommand(f), clock);
    assert.ok(!denied.ok && ["UNAUTHORIZED", "FORBIDDEN"].includes(denied.code));
  }
  const round = await open(f, () => nearStart);
  assert.deepEqual(round.deadline, f.occurrences[0].startAt);
  await assert.rejects(readEmergencyCards(f.student.id), /FORBIDDEN/);
  assert.deepEqual(await readEmergencyCards(f.teacher.id), []);
  const outsider = await timetableFixture(db);
  try {
    for (const deniedId of [f.teacher.id, f.student.id, outsider.teacher.id]) {
      const denied = await changeEmergencyCover(deniedId, command("accept", round.id), () => nearStart);
      assert.ok(!denied.ok && denied.code === "FORBIDDEN");
    }
    assert.deepEqual(await readEmergencyCards(outsider.coordinator.id), []);
    const denied = await changeEmergencyCover(outsider.coordinator.id, command("cancel", round.id), () => nearStart);
    assert.ok(!denied.ok && denied.code === "FORBIDDEN");
  } finally { await cleanupTimetable(db, outsider.departmentId); }
  assert.doesNotMatch(JSON.stringify(await readEmergencyCards(f.substitutes[0].user.id)), /Private synthetic reason|passwordHash|Synthetic substitute 2/);

  const [unavailable, valid, revoked] = f.substitutes;
  await db.facultyAvailability.updateMany({ where: { facultyId: unavailable.faculty.id }, data: { archived: true } });
  const stale = await changeEmergencyCover(unavailable.user.id, command("accept", round.id), () => nearStart);
  assert.ok(!stale.ok && stale.code === "STALE_VERSION");
  await db.user.update({ where: { id: revoked.user.id }, data: { active: false } });
  const inactive = await changeEmergencyCover(revoked.user.id, command("accept", round.id), () => nearStart);
  assert.ok(!inactive.ok && inactive.code === "UNAUTHORIZED");
  const exact = await changeEmergencyCover(valid.user.id, command("accept", round.id), () => round.deadline);
  assert.ok(!exact.ok && exact.code === "EXPIRED");

  const times = [nearStart, round.deadline];
  const crossed = await changeEmergencyCover(valid.user.id, command("accept", round.id), () => times.shift() ?? round.deadline);
  assert.ok(!crossed.ok && crossed.code === "EXPIRED");
  assert.equal((await db.emergencyRound.findUniqueOrThrow({ where: { id: round.id } })).status, "OPEN");
}));

test("expiry is durable through failed transactions, retries and worker process restart, with one later-tier proposal", () => {
  // Separate worker processes use a frozen Monday teaching window and share the real queue.
  return fixture(async f => {
    const before = await schedulingCounts(f), round = await open(f);
    assert.equal((await processEmergencyExpiry(() => new Date(round.deadline.getTime() - 1))).expired, 0);
    // PostgreSQL fails after the EXPIRED update, proving queue, audit and notice roll back together.
    await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ADD CONSTRAINT "test_emergency_expiry_failure" CHECK ("entityId" <> '${round.id}' OR "action" <> 'EMERGENCY_EXPIRED')`);
    try {
      assert.equal((await processEmergencyExpiry(() => round.deadline)).failed, 1);
      assert.equal((await db.emergencyRound.findUniqueOrThrow({ where: { id: round.id } })).status, "OPEN");
      assert.equal(await db.notification.count({ where: { changeId: `${round.id}:EMERGENCY_EXPIRED` } }), 0);
    } finally {
      await db.$executeRaw`ALTER TABLE "AuditEvent" DROP CONSTRAINT "test_emergency_expiry_failure"`;
    }
    const exec = promisify(execFile);
    const runWorker = () => exec(process.execPath, ["--import", "./tests/support/emergency-clock.mjs", "--conditions=react-server", "--import", "tsx", "scripts/emergency-worker.ts", "--once"], {
      env: { ...process.env, SLOTWISE_TEST_NOW: round.deadline.toISOString() },
    });
    const workers = await Promise.all([runWorker(), runWorker()]);
    assert.deepEqual(workers.map(r => r.stdout.trim()).sort(), ["Emergency rounds expired: 0", "Emergency rounds expired: 1"]);
    assert.match((await runWorker()).stdout, /expired: 0/);
    const expired = await db.emergencyRound.findUniqueOrThrow({ where: { id: round.id } });
    assert.equal(expired.status, "EXPIRED");
    const fallback = expired.fallback as unknown as { candidate: Candidate };
    assert.equal(fallback.candidate.tier, 3);
    assert.equal(await db.auditEvent.count({ where: { entityId: round.id, action: "EMERGENCY_EXPIRED" } }), 1);
    const notice = await db.notification.findMany({ where: { changeId: `${round.id}:EMERGENCY_EXPIRED` } });
    assert.deepEqual(notice.map(n => n.recipientId), [f.coordinator.id]);
    assert.equal(await db.emergencyRound.count({ where: { departmentId: f.departmentId } }), 1);
    assert.deepEqual(await schedulingCounts(f), before);
    const choice = await readEmergencyChoice(f.coordinator.id, f.leave.id, round.id);
    assert.equal(choice?.candidateId, fallback.candidate.id);
    const reviewed = await draft(f, f.coordinator.id, fallback.candidate);
    const preview = await changePublication(f.coordinator.id, { ...reviewed, operation: "preview" });
    assert.ok(preview.ok, JSON.stringify(preview));
    assert.deepEqual(preview.preview?.blockers, []);
    assert.deepEqual(await schedulingCounts(f), before);
  });
});

test("an invalid winner cannot publish, and explicit cancellation allows a new round", () => fixture(async f => {
  const round = await open(f), [winner] = f.substitutes;
  assert.ok((await changeEmergencyCover(winner.user.id, command("accept", round.id), clock)).ok);
  const selected = await readEmergencyChoice(f.coordinator.id, f.leave.id, round.id);
  assert.ok(selected?.candidateId);
  const winnerDraft = await draft(f, f.coordinator.id, selected.candidateId);
  const preview = await changePublication(f.coordinator.id, { ...winnerDraft, operation: "preview" });
  assert.ok(preview.ok && preview.preview);
  await db.facultyAvailability.updateMany({ where: { facultyId: winner.faculty.id }, data: { archived: true } });
  const publication = await changePublication(f.coordinator.id, { ...winnerDraft, operation: "publish", previewFingerprint: preview.preview.fingerprint });
  assert.equal(publication.ok, false);
  assert.ok((await changeEmergencyCover(f.coordinator.id, command("cancel", round.id), clock)).ok);
  const next = await open(f);
  assert.notEqual(next.id, round.id);
  assert.equal(next.offers.length, 3);
  assert.equal(await db.schedulePublication.count({ where: { departmentId: f.departmentId } }), 0);
}));
