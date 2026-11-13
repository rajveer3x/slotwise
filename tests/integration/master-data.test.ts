import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../src/server/db";
import { changeMasterData, readMasterData, readMasterRecord } from "../../src/server/services/master-data";
import { seedDemoData } from "../../prisma/demo-fixtures";
import { config, kinds, type Kind } from "../../src/features/master-data/config";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated slotwise_auth_test required.");
process.env.DATABASE_URL = url;
const db = getDb(), ns = `master-${randomUUID().slice(0, 8)}`, departmentId = `${ns}-computing`, otherId = `${ns}-design`;
let actorId: string, studentId: string;
const roomData = { code: "NEW", name: "Synthetic room", type: "THEORY", capacity: 40 };
function input(kind: Kind, data: Record<string, unknown>, rest: Record<string, unknown> = {}) { return { kind, data, operation: "save", requestId: randomUUID(), ...rest }; }
async function save(kind: Kind, data: Record<string, unknown>, rest: Record<string, unknown> = {}) {
  const result = await changeMasterData(actorId, input(kind, data, rest)); assert.equal(result.ok, true, JSON.stringify(result)); return result.recordId!;
}
before(async () => {
  await seedDemoData(db, "synthetic-non-login-hash", ns);
  const users = await db.user.findMany({ where: { departmentId } });
  actorId = users.find(u => u.role === "COORDINATOR")!.id;
  studentId = users.find(u => u.role === "STUDENT")!.id;
});
after(async () => {
  const where = { departmentId: { in: [departmentId, otherId] } };
  await db.masterMutationReceipt.deleteMany({ where });
  await db.courseAllocation.deleteMany({ where }); await db.facultyQualification.deleteMany({ where }); await db.facultyAvailability.deleteMany({ where }); await db.sectionMembership.deleteMany({ where }); await db.holiday.deleteMany({ where }); await db.section.deleteMany({ where }); await db.faculty.deleteMany({ where }); await db.course.deleteMany({ where }); await db.room.deleteMany({ where }); await db.timeSlot.deleteMany({ where }); await db.semester.deleteMany({ where }); await db.user.deleteMany({ where }); await db.department.deleteMany({ where: { id: { in: [departmentId, otherId] } } }); await db.$disconnect();
});
test("seed is deterministic, non-destructive and includes isolation fixtures", async () => {
  const before = await readMasterData(actorId);
  assert.equal(before.records.section.length, 2); assert.equal(before.records.faculty.length, 6); assert.equal(before.records.course.length, 4); assert.equal(before.records.room.length, 3); assert.equal(before.records.sectionMembership.length, 2);
  assert.ok(before.records.room.some(r => r.type === "LAB"));
  await db.room.update({ where: { id: `${departmentId}-room-1` }, data: { capacity: 77 } });
  await seedDemoData(db, "replacement-must-not-overwrite", ns);
  const after = await readMasterData(actorId);
  for (const kind of kinds) assert.equal(after.records[kind].length, before.records[kind].length);
  assert.equal(after.users.length, before.users.length);
  assert.equal(after.records.room.find(r => r.id === `${departmentId}-room-1`)!.capacity, 77);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: actorId } })).passwordHash, "synthetic-non-login-hash");
});
test("coordinator creates, reads, edits and archives persistent rooms with stale protection", async () => {
  const id = await save("room", roomData);
  const row = await readMasterRecord(actorId, "room", id); assert.equal(row.capacity, 40);
  await save("room", { ...roomData, capacity: 55 }, { id, expectedVersion: 1 });
  assert.equal((await readMasterData(actorId)).records.room.find(r => r.id === id)!.capacity, 55);
  const stale = await changeMasterData(actorId, input("room", roomData, { id, expectedVersion: 1 })); assert.equal(stale.code, "STALE_VERSION");
  const archive = await changeMasterData(actorId, input("room", {}, { id, expectedVersion: 2, operation: "archive" })); assert.equal(archive.ok, true);
  assert.equal((await readMasterRecord(actorId, "room", id)).archived, true);
  assert.equal((await changeMasterData(actorId, input("room", {}, { id, expectedVersion: 3, operation: "restore" }))).ok, true);
});
test("invalid intervals, duplicate codes and unrelated foreign keys have field feedback", async () => {
  for (const [kind, data, field] of [
    ["room", { ...roomData, capacity: 0 }, "capacity"], ["room", { ...roomData, code: "r1" }, "code"],
    ["timeSlot", { label: "Invalid", weekday: 1, startMinute: 700, endMinute: 600 }, "endMinute"],
    ["holiday", { semesterId: `${departmentId}-2026-autumn`, date: "2027-01-01", name: "Invalid" }, "date"],
    ["holiday", { semesterId: `${otherId}-2026-autumn`, date: "2026-11-01", name: "Foreign" }, "semesterId"],
    ["faculty", { userId: studentId, designation: "Invalid", targetMinutesPerWeek: 720, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080 }, "userId"],
  ] as const) {
    const result = await changeMasterData(actorId, input(kind, data)); assert.equal(result.ok, false); assert.ok(result.fieldErrors?.[field], JSON.stringify(result));
  }
  const first = await save("timeSlot", { label: "Late", weekday: 1, startMinute: 1080, endMinute: 1140 }); assert.ok(first);
  assert.equal((await changeMasterData(actorId, input("timeSlot", { label: "Overlap", weekday: 1, startMinute: 1100, endMinute: 1160 }))).code, "VALIDATION_ERROR");
  await save("timeSlot", { label: "Consecutive", weekday: 1, startMinute: 1140, endMinute: 1200 });
});
test("missing time values are rejected by the service without persisting a midnight interval", async () => {
  const count = await db.timeSlot.count({ where: { departmentId } });
  for (const startMinute of [null, undefined, "", "   ", false, true]) {
    const result = await changeMasterData(actorId, input("timeSlot", { label: "Invalid missing time", weekday: 6, startMinute, endMinute: 60 }));
    assert.equal(result.code, "VALIDATION_ERROR"); assert.ok(result.fieldErrors?.startMinute);
  }
  assert.equal(await db.timeSlot.count({ where: { departmentId } }), count);
  await save("timeSlot", { label: "Explicit midnight", weekday: 6, startMinute: 0, endMinute: 60 });
});
test("all non-manager roles, anonymous, revoked and foreign record access are denied directly", async () => {
  for (const role of ["HOD", "FACULTY", "STUDENT"] as const) {
    const id = (await db.user.findFirstOrThrow({ where: { departmentId, role } })).id;
    assert.equal((await changeMasterData(id, input("room", roomData))).code, "FORBIDDEN");
    await assert.rejects(readMasterData(id), /FORBIDDEN/);
  }
  assert.equal((await changeMasterData(null, input("room", roomData))).code, "UNAUTHORIZED");
  await assert.rejects(readMasterData(null), /UNAUTHORIZED/);
  const foreign = `${otherId}-room-1`;
  await assert.rejects(readMasterRecord(actorId, "room", foreign), /FORBIDDEN/);
  assert.equal((await changeMasterData(actorId, input("room", roomData, { id: foreign, expectedVersion: 1 }))).code, "FORBIDDEN");
  assert.ok((await readMasterData(actorId)).records.room.every(r => r.departmentId === departmentId));
  await db.user.update({ where: { id: actorId }, data: { active: false } });
  assert.equal((await changeMasterData(actorId, input("room", roomData))).code, "UNAUTHORIZED");
  await db.user.update({ where: { id: actorId }, data: { active: true } });
});
test("allocation checks qualification, active parents and matching semester", async () => {
  const snapshot = await readMasterData(actorId), allocation = snapshot.records.courseAllocation[0];
  const base = { semesterId: allocation.semesterId, sectionId: allocation.sectionId, courseId: allocation.courseId, facultyId: allocation.facultyId, weeklyPeriods: 4, requiredContactMinutes: 2400 };
  await save("courseAllocation", base, { id: allocation.id, expectedVersion: 1 });
  const courseId = await save("course", { code: "UNQUALIFIED", name: "No qualification", type: "THEORY", requiredContactMinutes: 1200 });
  assert.ok((await changeMasterData(actorId, input("courseAllocation", { ...base, courseId }))).fieldErrors?.facultyId);
  const semesterId = await save("semester", { code: "OTHER", name: "Other semester", startDate: "2027-01-01", endDate: "2027-05-01", active: false });
  assert.ok((await changeMasterData(actorId, input("courseAllocation", { ...base, semesterId }))).fieldErrors?.sectionId);
  assert.equal((await changeMasterData(actorId, input("courseAllocation", { ...base, courseId: `${otherId}-DES101` }))).code, "VALIDATION_ERROR");
});
test("every entity supports validated edits, archival and restoration without deleting references", async () => {
  const snapshot = await readMasterData(actorId);
  for (const kind of kinds) {
    const row = snapshot.records[kind].find(r => !r.archived)!;
    const data = Object.fromEntries(config[kind].fields.map(f => [f.key, row[f.key]]));
    // Change actual editable values; relationship-only records intentionally
    // retain their links and support representative status / archive changes.
    if ("name" in data) data.name = `${data.name} updated`;
    if (kind === "faculty") data.designation = "Updated lecturer";
    if (kind === "timeSlot") data.label = "Updated period";
    if (kind === "sectionMembership") data.isRepresentative = !data.isRepresentative;
    if (kind === "courseAllocation") { data.weeklyPeriods = 5; data.facultyId = snapshot.records.faculty.find(f => f.id !== row.facultyId && !f.archived)!.id; }
    await save(kind, data, { id: row.id, expectedVersion: row.version });
    let current = await readMasterRecord(actorId, kind, row.id);
    assert.equal(current.version, row.version + 1);
    assert.equal((await changeMasterData(actorId, input(kind, {}, { id: row.id, expectedVersion: current.version, operation: "archive" }))).ok, true);
    current = await readMasterRecord(actorId, kind, row.id); assert.equal(current.archived, true);
    assert.equal((await changeMasterData(actorId, input(kind, {}, { id: row.id, expectedVersion: current.version, operation: "restore" }))).ok, true);
    current = await readMasterRecord(actorId, kind, row.id); assert.equal(current.archived, false);
    if (kind === "semester" && row.active) await save(kind, data, { id: row.id, expectedVersion: current.version });
  }
});
test("semester changes preserve holiday boundaries and active-semester uniqueness; membership scope is enforced", async () => {
  const snapshot = await readMasterData(actorId), semester = snapshot.records.semester.find(r => r.active)!;
  assert.ok((await changeMasterData(actorId, input("semester", { code: semester.code, name: semester.name, startDate: semester.startDate, endDate: "2026-08-04", active: true }, { id: semester.id, expectedVersion: semester.version }))).fieldErrors?.endDate);
  assert.ok((await changeMasterData(actorId, input("semester", { code: "ACTIVE-TWO", name: "Another", startDate: "2027-01-01", endDate: "2027-05-01", active: true }))).fieldErrors?.active);
  const membership = snapshot.records.sectionMembership[0], otherSection = snapshot.records.section.find(r => r.id !== membership.sectionId)!;
  assert.ok((await changeMasterData(actorId, input("sectionMembership", { userId: membership.userId, sectionId: otherSection.id, isRepresentative: false }))).fieldErrors?.userId);
  const holiday = snapshot.records.holiday[0];
  assert.ok((await changeMasterData(actorId, input("holiday", { name: holiday.name, date: holiday.date, semesterId: snapshot.records.semester.find(r => r.id !== holiday.semesterId)!.id }, { id: holiday.id, expectedVersion: holiday.version }))).fieldErrors?.semesterId);
});
test("production demo seeding is refused before any writes", async () => {
  const previous = process.env.NODE_ENV;
  try { Reflect.set(process.env, "NODE_ENV", "production"); await assert.rejects(seedDemoData(db, "ignored", ns), /disabled in production/); }
  finally { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Reflect.set(process.env, "NODE_ENV", previous); }
});
test("referenced faculty archival preserves allocations and user; archived parents reject new relationships", async () => {
  const allocation = await db.courseAllocation.findFirstOrThrow({ where: { departmentId } });
  const faculty = await db.faculty.findUniqueOrThrow({ where: { id: allocation.facultyId } });
  const count = await db.courseAllocation.count({ where: { facultyId: faculty.id } }); assert.ok(count > 0);
  assert.equal((await changeMasterData(actorId, input("faculty", {}, { id: faculty.id, expectedVersion: faculty.version, operation: "archive" }))).ok, true);
  assert.equal(await db.courseAllocation.count({ where: { facultyId: faculty.id } }), count);
  assert.ok(await db.user.findUnique({ where: { id: faculty.userId } }));
  assert.ok((await changeMasterData(actorId, input("facultyAvailability", { facultyId: faculty.id, weekday: 6, startMinute: 540, endMinute: 600 }))).fieldErrors?.facultyId);
});
test("concurrent edits serialize and same-request retries return the committed receipt", async () => {
  const id = await save("room", { ...roomData, code: "RACE" });
  const adminId = (await db.user.findFirstOrThrow({ where: { departmentId, role: "ADMIN" } })).id;
  const results = await Promise.all([55, 65].map((capacity, index) => changeMasterData(index ? adminId : actorId, input("room", { ...roomData, code: "RACE", capacity }, { id, expectedVersion: 1 }))));
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.code === "STALE_VERSION").length, 1);
  const request = input("room", { ...roomData, code: "RETRY" });
  const retries = await Promise.all([changeMasterData(actorId, request), changeMasterData(actorId, request)]);
  assert.ok(retries.every(r => r.ok)); assert.equal(retries[0].recordId, retries[1].recordId);
  assert.equal((await changeMasterData(actorId, { ...request, data: { ...roomData, code: "CHANGED" } })).code, "CONFLICT");
  const duplicate = await Promise.all([actorId, adminId].map(actor => changeMasterData(actor, input("room", { ...roomData, code: "DUP-RACE" }))));
  assert.equal(duplicate.filter(r => r.ok).length, 1); assert.equal(duplicate.filter(r => r.code === "CONFLICT").length, 1);
});
test("concurrent account revocation is checked after waiting for actor lock", async () => {
  let locked!: () => void, release!: () => void;
  const ready = new Promise<void>(r => { locked = r; }), hold = new Promise<void>(r => { release = r; });
  const revocation = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR UPDATE`; await tx.user.update({ where: { id: actorId }, data: { active: false } }); locked(); await hold; });
  await ready;
  const mutation = changeMasterData(actorId, input("room", { ...roomData, code: "REVOKED" }));
  release(); await revocation; assert.equal((await mutation).code, "UNAUTHORIZED");
  assert.equal(await db.room.count({ where: { departmentId, code: "REVOKED" } }), 0);
  await db.user.update({ where: { id: actorId }, data: { active: true } });
});
test("database independently enforces positive counts, composite department FKs and semester uniqueness", async () => {
  await assert.rejects(db.room.create({ data: { departmentId, ...roomData, code: "DB-BAD", type: "THEORY", capacity: -1 } }));
  await assert.rejects(db.holiday.create({ data: { departmentId, semesterId: `${otherId}-2026-autumn`, date: "2026-11-01", name: "Foreign" } }));
  await assert.rejects(db.semester.create({ data: { departmentId, code: "DB-ACTIVE", name: "Duplicate active", startDate: "2027-01-01", endDate: "2027-05-01", active: true } }));
});
