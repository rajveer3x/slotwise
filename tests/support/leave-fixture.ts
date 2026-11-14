import { randomUUID } from "node:crypto";
import { getDb } from "../../src/server/db";
import { changeTimetable } from "../../src/server/services/timetable";
import { timetableFixture } from "./timetable-fixture";
export type LeaveFixture = Awaited<ReturnType<typeof timetableFixture>>;
export async function publishFixture(f: LeaveFixture, revision = 0, weekday = 1) {
  const command = { semesterId: f.semester.id, expectedRevision: revision, effectiveFrom: "2099-01-05" };
  const created = await changeTimetable(f.coordinator.id, { ...command, operation: "create", requestId: randomUUID() });
  if (!created.ok) throw new Error(JSON.stringify(created));
  const draft = { ...command, draftId: created.draftId!, expectedVersion: 1 };
  const saved = await changeTimetable(f.coordinator.id, { ...draft, operation: "save", requestId: randomUUID(), entries: f.entries.map(e => ({ ...e, weekday })) });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  draft.expectedVersion = 2;
  const preview = await changeTimetable(f.coordinator.id, { ...draft, operation: "preview", requestId: randomUUID() });
  if (!preview.ok) throw new Error(JSON.stringify(preview));
  const publish = { ...draft, operation: "publish", requestId: randomUUID(), previewFingerprint: preview.preview!.fingerprint };
  const result = await changeTimetable(f.coordinator.id, publish);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return { draft, publish };
}
export async function addFaculty(f: LeaveFixture, role: "FACULTY" | "HOD" = "FACULTY") {
  const db = getDb();
  const user = await db.user.create({ data: { departmentId: f.departmentId, role, name: `Synthetic second ${role}`, email: `${randomUUID()}@leave.slotwise.test`, passwordHash: "synthetic-non-login-hash" } });
  const faculty = await db.faculty.create({ data: { departmentId: f.departmentId, userId: user.id, designation: "Lecturer", targetMinutesPerWeek: 720, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080 } });
  return { user, faculty };
}
