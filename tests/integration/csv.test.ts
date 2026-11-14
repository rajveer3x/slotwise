import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { parse } from "csv-parse/sync";
import { getDb } from "../../src/server/db";
import { previewCsv, commitCsv } from "../../src/server/services/csv-import";
import { downloadTemplate, exportTimetableCsv } from "../../src/server/services/csv-export";
import { parseCsv, renderCsv } from "../../src/server/services/csv-format";
import { csvKinds, csvMaxBytes, csvMaxRows } from "../../src/features/csv/config";
import { changeMasterData } from "../../src/server/services/master-data";
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
const bytes = (text: string) => Buffer.from(text);
const courseHeader = "code,name,type,requiredContactMinutes";
const roomHeader = "code,name,type,capacity";
const timetableHeader = "sectionCode,courseCode,roomCode,weekday,startTime,endTime";
const facultyHeader = "accountEmail,designation,targetMinutesPerWeek,maxMinutesPerDay,maxMinutesPerWeek";
const course = { kind: "course" };
const room = { kind: "room" };
const faculty = { kind: "faculty" };
const timetable = (f: Fixture) => ({ kind: "timetable", semesterId: f.semester.id, effectiveFrom: f.semester.startDate });
const schedule = bytes(`${timetableHeader}\nS1,CS101,R1,1,09:00,10:00\nS1,CS102,R1,1,10:00,11:00\n`);
async function review(actor: string, input: unknown, file: Uint8Array) {
  const preview = await previewCsv(actor, input, file);
  assert.ok(preview.ok && preview.token, JSON.stringify(preview));
  return { ...preview, token: preview.token };
}

test("the CSV parser handles templates, BOM, multiline cells, encoding, malformed headers and size boundaries", () => {
  for (const kind of csvKinds) assert.equal(parseCsv(kind, bytes(downloadTemplate(kind))).issues.length, 0);
  const first = `${courseHeader}\r\nNEW,"Design, part ""one""\r\nStudio",THEORY,120\r\n`;
  const parsed = parseCsv("course", bytes("\uFEFF" + first + "\r\nBAD,Incomplete,THEORY\r\n"));
  assert.equal(parsed.rows[0].values[1], 'Design, part "one"\r\nStudio');
  assert.deepEqual(parsed.issues, [{ row: 3, column: "requiredContactMinutes", message: "Missing field." }]);
  assert.throws(() => parseCsv("course", Buffer.from([0xff, 0xfe, 0x61, 0x00])), /UTF-8/);
  assert.throws(() => parseCsv("course", bytes(`${first}\0`)), /UTF-8/);
  assert.throws(() => parseCsv("course", bytes("code,name,name,requiredContactMinutes\n")), /headers/);
  assert.throws(() => parseCsv("course", bytes(courseHeader)), /data row/);
  assert.throws(() => parseCsv("course", bytes(first + 'NEW2,"Bad quote')), error => {
    assert.deepEqual((error as { issues: unknown }).issues, [{
      row: 3, column: "name", message: "Check the quotes in this field. Double any quotes inside a quoted field.",
    }]);
    return true;
  });
  const lf = first.replaceAll("\r\n", "\n");
  assert.equal(parseCsv("course", bytes(lf.padEnd(csvMaxBytes, "\n"))).rows.length, 1);
  assert.throws(() => parseCsv("course", bytes(first.padEnd(csvMaxBytes + 1, "\n"))), /128 KiB/);
  const rows = `${courseHeader}\n${"NEW,Sample,THEORY,120\n".repeat(csvMaxRows)}`;
  assert.equal(parseCsv("course", bytes(rows)).rows.length, csvMaxRows);
  assert.throws(() => parseCsv("course", bytes(rows + "LAST,Sample,THEORY,120")), /300 data rows/);
  const unsafe = ["=1+1", " +2", "-3", "@x", "\t123", "\nText", "  ＝2"];
  assert.deepEqual(parse(renderCsv([[...unsafe, 'Plain, "quoted"\ntext']])), [[...unsafe.map(value => "'" + value), 'Plain, "quoted"\ntext']]);
});

test("preview writes nothing, rejects invalid and duplicate rows, and commits the reviewed course file once", () => fixture(async f => {
  const good = bytes(`${courseHeader}\nCSV1,"Computing, Systems\nDesign",THEORY,240\nCSV2,Lab,LAB,120\n`);
  const bad = bytes(`${courseHeader}\nCSV1,Ready,THEORY,120\n csv1 ,Duplicate,THEORY,120\nCSV2,Invalid,THEORY,0\nCS101,Existing,THEORY,120\n`);
  const invalid = await previewCsv(f.coordinator.id, course, bad);
  assert.ok(invalid.ok && invalid.token === null);
  assert.deepEqual(invalid.issues.map(({ row, column }) => [row, column]), [[3, "code"], [4, "requiredContactMinutes"], [5, "code"]]);
  const { token, rows } = await review(f.coordinator.id, course, good);
  assert.equal(rows[0].values[1], "Computing, Systems\nDesign");
  assert.equal(await db.course.count({ where: { departmentId: f.departmentId, code: { startsWith: "CSV" } } }), 0);
  assert.equal(await db.mutationReceipt.count({ where: { departmentId: f.departmentId } }), 0);
  assert.equal((await commitCsv(f.coordinator.id, course, bad, token)).ok, false);
  assert.equal((await commitCsv(f.coordinator.id, course, good, { ...token, signature: "0".repeat(64) })).ok, false);
  assert.equal((await commitCsv(f.admin.id, course, good, token)).ok, false);

  const [saved, retry] = await Promise.all([
    commitCsv(f.coordinator.id, course, good, token), commitCsv(f.coordinator.id, course, good, token),
  ]);
  assert.deepEqual(saved, { ok: true, count: 2 });
  assert.deepEqual(retry, saved);
  assert.equal(await db.course.count({ where: { departmentId: f.departmentId, code: { startsWith: "CSV" } } }), 2);
  assert.equal((await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision, 1);
  const event = await db.auditEvent.findFirstOrThrow({ where: { departmentId: f.departmentId, action: "CSV_MASTER_IMPORTED" } });
  assert.equal((await readAudit(f.coordinator.id, { event: event.id })).detail?.after.count, 2);
}));

test("independent master-data previews race safely and invalidated files leave all remaining rows unwritten", () => fixture(async f => {
  const first = bytes(`${roomHeader}\nCSV1,First,THEORY,40\nCSV2,Second,LAB,40\n`);
  const second = bytes(`${roomHeader}\nCSV3,Third,THEORY,40\nCSV2,Duplicate candidate,LAB,40\n`);
  const a = await review(f.coordinator.id, room, first);
  const b = await review(f.admin.id, room, second);
  const results = await Promise.all([
    commitCsv(f.coordinator.id, room, first, a.token),
    commitCsv(f.admin.id, room, second, b.token),
  ]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.deepEqual(results.flatMap(result => result.ok ? [] : result.issues?.map(({ row, column }) => [row, column]) ?? []), [[3, "code"]]);
  assert.equal(await db.room.count({ where: { departmentId: f.departmentId, code: { startsWith: "CSV" } } }), 2);

  const unrelated = bytes(`${roomHeader}\nCSV4,New,THEORY,40\n`);
  const { token } = await review(f.coordinator.id, room, unrelated);
  const updated = await changeMasterData(f.admin.id, {
    requestId: randomUUID(), kind: "room", operation: "save",
    data: { code: "MANUAL", name: "Manual", capacity: 40, type: "THEORY" },
  });
  assert.ok(updated.ok);
  const stale = await commitCsv(f.coordinator.id, room, unrelated, token);
  assert.ok(!stale.ok && stale.code === "STALE_VERSION");
  assert.equal(await db.room.count({ where: { departmentId: f.departmentId, code: "CSV4" } }), 0);
}));

test("faculty import links existing scoped accounts and rechecks eligibility on commit", () => fixture(async f => {
  const available = (email: string) => `${email},Senior Lecturer,720,240,1080`;
  const eligible = bytes(`${facultyHeader}\n${available(f.hod.email)}\n`);
  const invalidFile = bytes(`${facultyHeader}\n${available(f.student.email)}\n${available(f.teacher.email)}\n${available("foreign@example.test")}\n`);
  const invalid = await previewCsv(f.admin.id, faculty, invalidFile);
  assert.ok(invalid.ok && !invalid.token);
  assert.deepEqual(invalid.issues.map(issue => issue.column), ["accountEmail", "accountEmail", "accountEmail"]);
  const { token } = await review(f.coordinator.id, faculty, eligible);
  await db.user.update({ where: { id: f.hod.id }, data: { active: false } });
  const revoked = await commitCsv(f.coordinator.id, faculty, eligible, token);
  assert.ok(!revoked.ok && revoked.issues?.[0].column === "accountEmail");
  await db.user.update({ where: { id: f.hod.id }, data: { active: true } });
  const fresh = await review(f.admin.id, faculty, eligible);
  assert.ok((await commitCsv(f.admin.id, faculty, eligible, fresh.token)).ok);
  assert.equal((await db.faculty.findUniqueOrThrow({ where: { userId: f.hod.id } })).designation, "Senior Lecturer");
}));

test("timetable rows explain scoped references and clashes, and import creates only a draft with stable teaching units", () => fixture(async f => {
  const input = timetable(f);
  const bad = await previewCsv(f.coordinator.id, input, bytes(`${timetableHeader}\nS1,CS101,R1,1,09:00,10:00\nS1,CS102,R1,1,09:00,10:00\nS1,CS102,${f.room.id},1,10:00,11:00\n`));
  assert.ok(bad.ok && !bad.token);
  assert.ok(bad.issues.some(issue => issue.row === 2 && issue.column === "startTime" && issue.message.includes("overlap")));
  assert.ok(bad.issues.some(issue => issue.row === 4 && issue.column === "roomCode"));
  const reviewed = await review(f.coordinator.id, input, schedule);
  const concurrent = await review(f.admin.id, input, schedule);
  assert.equal(await db.timetableVersion.count({ where: { departmentId: f.departmentId } }), 0);
  const saved = await commitCsv(f.coordinator.id, input, schedule, reviewed.token);
  assert.ok(saved.ok && saved.draftId);
  assert.equal((await commitCsv(f.admin.id, input, schedule, concurrent.token)).ok, false);
  for (const count of [
    await db.classOccurrence.count({ where: { departmentId: f.departmentId } }),
    await db.deliveryRecord.count({ where: { departmentId: f.departmentId } }),
    await db.resourceReservation.count({ where: { departmentId: f.departmentId } }),
  ]) assert.equal(count, 0);
  assert.deepEqual(parse(await exportTimetableCsv(f.admin.id, f.semester.id)).length, 1);

  const command = { semesterId: f.semester.id, draftId: saved.draftId, expectedVersion: 1, expectedRevision: 0 };
  const publication = await changeTimetable(f.coordinator.id, { ...command, operation: "preview", requestId: randomUUID() });
  assert.ok(publication.preview, JSON.stringify(publication));
  assert.ok((await changeTimetable(f.coordinator.id, {
    ...command, operation: "publish", requestId: randomUUID(), previewFingerprint: publication.preview.fingerprint,
  })).ok);
  const moved = bytes(`${timetableHeader}\nS1,CS101,R2,2,09:00,10:00\nS1,CS102,R1,1,10:00,11:00\n`);
  const revision = await review(f.coordinator.id, input, moved);
  const next = await commitCsv(f.coordinator.id, input, moved, revision.token);
  assert.ok(next.ok && next.draftId);
  const entries = async (draftId: string) => (await db.timetableEntry.findMany({
    where: { timetableVersionId: draftId }, orderBy: { allocationId: "asc" },
  })).map(entry => entry.seriesId);
  assert.deepEqual(await entries(next.draftId), await entries(saved.draftId));
  assert.equal(await db.classOccurrence.count({ where: { departmentId: f.departmentId } }), publication.preview.count);
  await db.user.update({ where: { id: f.teacher.id }, data: { name: "  =FORMULA()" } });
  await db.course.update({ where: { id: f.allocations[0].courseId }, data: { name: '@Risk, "quoted"\nline' } });
  const exported = parse(await exportTimetableCsv(f.admin.id, f.semester.id));
  assert.deepEqual(exported[0], ["date", "startTime", "endTime", "sectionCode", "courseCode", "courseName", "facultyName", "roomCode", "deliveryStatus"]);
  assert.deepEqual(exported[1], ["2099-01-05", "09:00", "10:00", "S1", "CS101", `'@Risk, "quoted"\nline`, "'  =FORMULA()", "R1", "PENDING"]);
}));

test("direct operations reject anonymous, revoked, wrong-role and foreign-semester requests", () => fixture(async f => fixture(async foreign => {
  const input = timetable(f);
  const { token } = await review(f.coordinator.id, input, schedule);
  await db.user.update({ where: { id: f.admin.id }, data: { active: false } });
  for (const actor of [null, f.admin.id, f.student.id, f.teacher.id, f.hod.id, foreign.coordinator.id]) {
    const preview = await previewCsv(actor, input, schedule);
    assert.ok(!preview.ok && ["UNAUTHORIZED", "FORBIDDEN"].includes(preview.code));
    const commit = await commitCsv(actor, input, schedule, token);
    assert.ok(!commit.ok && ["UNAUTHORIZED", "FORBIDDEN"].includes(commit.code));
    await assert.rejects(exportTimetableCsv(actor, f.semester.id), { name: "Error" });
  }
  assert.equal(await db.timetableVersion.count({ where: { departmentId: f.departmentId } }), 0);
})));

test("a database failure after inserting the batch rolls back every row and allows retry", () => fixture(async f => {
  const file = bytes(`${roomHeader}\nCSV1,First,THEORY,40\nCSV2,Second,LAB,40\n`);
  const { token } = await review(f.coordinator.id, room, file);
  // Force only this fixture's audit insert to fail, after rows and the revision write.
  const constraint = `csv_rollback_${randomUUID().replaceAll("-", "")}`;
  assert.match(f.departmentId, /^schedule-[0-9a-f-]+$/);
  await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ADD CONSTRAINT "${constraint}" CHECK ("departmentId" <> '${f.departmentId}' OR "action" <> 'CSV_MASTER_IMPORTED') NOT VALID`);
  try {
    assert.equal((await commitCsv(f.coordinator.id, room, file, token)).ok, false);
    assert.equal(await db.room.count({ where: { departmentId: f.departmentId, code: { startsWith: "CSV" } } }), 0);
    assert.equal((await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision, 0);
    assert.equal(await db.mutationReceipt.count({ where: { id: token.id } }), 0);
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DROP CONSTRAINT "${constraint}"`);
  }
  assert.ok((await commitCsv(f.coordinator.id, room, file, token)).ok);
}));
