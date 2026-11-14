import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getDb } from "../../src/server/db";
import { readAudit } from "../../src/server/services/audit";
import { changeTimetable } from "../../src/server/services/timetable";
import { instant } from "../../src/domain/scheduling/timetable";
import { cleanupTimetable, timetableFixture } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;
const db = getDb();
after(() => db.$disconnect());

test("audit details and actor options are scoped, and only approved historical fields are returned", async () => {
  const f = await timetableFixture(db);
  const other = await timetableFixture(db);
  try {
    const hidden = "synthetic-private-audit-sentinel";
    const nested = { occurrenceId: "original", obligationId: "obligation", allocationId: "allocation", roomId: null,
      date: "2099-01-05", startMinute: 540, endMinute: 600, meetingUrl: hidden };
    const first = await db.auditEvent.create({ data: {
      departmentId: f.departmentId, actorId: f.coordinator.id, action: "RESOLUTION_PUBLISHED", entityId: "publication",
      before: { revision: 1, changes: [nested] }, after: { revision: 2, changes: [nested], token: hidden },
    } });
    const second = await db.auditEvent.create({ data: {
      departmentId: f.departmentId, actorId: f.hod.id, action: "LEAVE_REJECTED", entityId: "leave",
      before: { status: "SUBMITTED", privateReason: hidden }, after: { status: "REJECTED", reason: hidden, rejectionReason: hidden },
    } });
    const third = await db.auditEvent.create({ data: {
      departmentId: f.departmentId, actorId: f.coordinator.id, action: "DELIVERY_CORRECTED", entityId: "occurrence",
      before: { status: "NOT_HELD", minutes: 0 }, after: { status: "HELD", minutes: 60, reason: "Verified class record" },
    } });
    for (const id of [f.admin.id, f.coordinator.id, f.hod.id]) {
      assert.equal((await readAudit(id, { event: third.id })).detail?.after.reason, "Verified class record");
      assert.equal((await readAudit(id, {})).total, 3);
    }
    for (const id of [f.student.id, f.teacher.id, other.admin.id]) {
      await assert.rejects(readAudit(id, { event: first.id }), { code: "FORBIDDEN" });
    }
    await assert.rejects(readAudit(other.admin.id, { department: f.departmentId }), { code: "FORBIDDEN" });
    assert.equal((await readAudit(other.admin.id, {})).total, 0);
    await assert.rejects(readAudit(null, {}), { code: "UNAUTHORIZED" });
    const resolution = await readAudit(f.admin.id, { event: first.id });
    assert.equal(resolution.detail?.before.revision, 1);
    assert.equal(resolution.detail?.after.revision, 2);
    const leave = await readAudit(f.admin.id, { event: second.id });
    assert.deepEqual(leave.detail?.after, { status: "REJECTED" });
    assert.ok(!JSON.stringify([resolution, leave]).includes(hidden));
    assert.ok(!JSON.stringify(resolution).includes(f.coordinator.email));
    await db.user.update({ where: { id: f.hod.id }, data: { active: false } });
    await assert.rejects(readAudit(f.hod.id, {}), { code: "UNAUTHORIZED" });
    assert.equal((await readAudit(f.admin.id, { actor: f.hod.id })).total, 1);
  } finally {
    await cleanupTimetable(db, other.departmentId);
    await cleanupTimetable(db, f.departmentId);
  }
});

test("audit pagination is stable at tied timestamps and filters use inclusive Kolkata dates", async () => {
  const f = await timetableFixture(db);
  try {
    const base = { departmentId: f.departmentId, actorId: f.coordinator.id, action: "TIMETABLE_DRAFT_CREATED",
      entityId: "draft", before: {}, after: { status: "DRAFT" } };
    const from = instant("2026-11-14", 0);
    const until = instant("2026-11-15", 0);
    await db.auditEvent.createMany({ data: [
      ...Array.from({ length: 26 }, (_, index) => ({ ...base, id: `${f.departmentId}-${index.toString().padStart(2, "0")}`, createdAt: from })),
      { ...base, createdAt: new Date(+from - 1) }, { ...base, createdAt: until },
      { ...base, actorId: f.hod.id, createdAt: from },
      { ...base, action: "TIMETABLE_PUBLISHED", createdAt: from },
      { ...base, entityId: "another-draft", createdAt: from },
    ] });
    const filters = { actor: f.coordinator.id, action: base.action, entity: base.entityId, from: "2026-11-14", to: "2026-11-14" };
    const first = await readAudit(f.hod.id, filters);
    const second = await readAudit(f.hod.id, { ...filters, page: "999" });
    assert.equal(first.total, 26);
    assert.equal(first.rows.length, 25);
    assert.equal(first.rows[0].id, `${f.departmentId}-25`);
    assert.equal(second.page, 2);
    assert.deepEqual(second.rows.map(row => row.id), [`${f.departmentId}-00`]);
    for (const invalid of [{ page: "-1" }, { actor: ["one", "two"] }, { from: "2026-11-15", to: "2026-11-14" }]) {
      const result = await readAudit(f.hod.id, invalid);
      assert.ok(result.error);
      assert.equal(result.rows.length, 0);
    }
  } finally { await cleanupTimetable(db, f.departmentId); }
});

test("timetable drafts audit only committed transitions, once per concurrent retry", async () => {
  const f = await timetableFixture(db);
  try {
    const create = { operation: "create", requestId: randomUUID(), semesterId: f.semester.id,
      expectedRevision: 0, effectiveFrom: f.semester.startDate };
    assert.equal((await changeTimetable(f.student.id, create)).code, "FORBIDDEN");
    const [created, retry] = await Promise.all([changeTimetable(f.coordinator.id, create), changeTimetable(f.coordinator.id, create)]);
    assert.ok(created.ok && created.draftId);
    assert.deepEqual(created, retry);
    const save = { ...create, operation: "save", requestId: randomUUID(), expectedVersion: 1, draftId: created.draftId, entries: f.entries };
    assert.ok((await changeTimetable(f.coordinator.id, save)).ok);
    assert.ok((await changeTimetable(f.coordinator.id, save)).ok);
    assert.equal((await changeTimetable(f.coordinator.id, { ...save, requestId: randomUUID() })).code, "STALE_VERSION");
    assert.ok((await changeTimetable(f.coordinator.id, { ...save, operation: "preview", expectedVersion: 2, requestId: randomUUID() })).ok);
    const results = await readAudit(f.hod.id, { entity: created.draftId });
    assert.equal(results.total, 2);
    const row = results.rows.find(row => row.action === "Timetable draft saved")!;
    const { detail } = await readAudit(f.hod.id, { event: row.id });
    assert.equal(detail?.actorId, f.coordinator.id);
    assert.equal(detail?.before.version, 1);
    assert.equal(detail?.after.version, 2);
    assert.deepEqual(detail?.after.entries, f.entries);
  } finally { await cleanupTimetable(db, f.departmentId); }
});
