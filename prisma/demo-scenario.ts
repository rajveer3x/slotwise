import "dotenv/config";
import { randomUUID } from "node:crypto";
import { addDays, clockTime, localDate, weekOf } from "../src/domain/scheduling/timetable";
import { getDb } from "../src/server/db";
import { getDatabaseUrl } from "../src/server/env";
import { changeLeave, readLeaveImpact } from "../src/server/services/leave";
import { changeTimetable } from "../src/server/services/timetable";
import { importGeneration, runGeneration } from "../src/server/services/timetable-generation";

const departmentId = "demo-computing";
const semesterId = `${departmentId}-2026-autumn`;
// Keep the same receipt IDs across runs so an interrupted setup can resume.
const draftRequestId = "51a496e0-4e99-4ae2-869d-7a9b59806315";
const leaveRequestId = "90101327-8f09-4b36-891b-5b64f0f942ca";

if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(getDatabaseUrl()).hostname)) {
  throw new Error("The demo scenario needs a local PostgreSQL database.");
}

const db = getDb();

async function receiptId(id: string, actorId: string, key: "draftId" | "leaveId") {
  const receipt = await db.mutationReceipt.findFirst({ where: { id, actorId, departmentId } });
  const result = receipt?.result;
  if (result && typeof result === "object" && !Array.isArray(result) && typeof result[key] === "string") return result[key];
}

async function seedScenario() {
  const semester = await db.semester.findFirst({ where: { id: semesterId, departmentId, archived: false, active: true } });
  const coordinator = await db.user.findFirst({ where: { email: "coordinator@demo.slotwise.test", departmentId, role: "COORDINATOR", active: true } });
  const faculty = await db.faculty.findFirst({ where: { departmentId, archived: false, user: { email: "faculty@demo.slotwise.test", role: "FACULTY", active: true } } });
  if (!semester || !coordinator || !faculty) throw new Error("The active Computing demo semester and demo accounts are required. Run npm run db:seed first.");

  const today = localDate();
  const tomorrow = addDays(today, 1);
  const effectiveFrom = semester.startDate > tomorrow ? semester.startDate : tomorrow;
  if (effectiveFrom > semester.endDate) throw new Error("The seeded Computing semester has no future dates for this scenario.");

  const published = await db.timetableVersion.findFirst({ where: { departmentId, semesterId, status: "PUBLISHED" } });
  if (!published) {
    let draftId = await receiptId(draftRequestId, coordinator.id, "draftId");
    if (!draftId) {
      const proposal = await runGeneration(coordinator.id, { semesterId, expectedRevision: semester.scheduleRevision, effectiveFrom, seed: 42 });
      if (!proposal.ok) throw new Error(proposal.message);
      if (!proposal.token || proposal.summary.placed !== proposal.summary.required) {
        throw new Error("The generator could not place every demo period. Review the semester’s master data.");
      }
      const imported = await importGeneration(coordinator.id, { requestId: draftRequestId, token: proposal.token });
      if (!imported.ok || !imported.draftId) throw new Error(imported.message);
      draftId = imported.draftId;
    }
    const draft = await db.timetableVersion.findFirstOrThrow({ where: { id: draftId, departmentId, semesterId } });
    if (draft.status !== "DRAFT" || draft.version !== 1 || draft.baseScheduleRevision !== semester.scheduleRevision) {
      throw new Error("The demo draft or timetable changed during setup. Review it in Timetable before publishing.");
    }
    const target = { semesterId, draftId, expectedRevision: semester.scheduleRevision, expectedVersion: draft.version };
    const preview = await changeTimetable(coordinator.id, { ...target, requestId: randomUUID(), operation: "preview" });
    if (!preview.ok || !preview.preview) throw new Error(preview.message);
    if (preview.preview.count === 0) throw new Error("There are no dated classes to publish within the remaining term.");
    const result = await changeTimetable(coordinator.id, { ...target, requestId: randomUUID(), operation: "publish", previewFingerprint: preview.preview.fingerprint });
    if (!result.ok) throw new Error(result.message);
    console.log(result.message);
  } else {
    console.log("Reused the existing published timetable.");
  }

  const existingLeaveId = await receiptId(leaveRequestId, faculty.userId, "leaveId");
  if (existingLeaveId) {
    const leave = await db.leaveRequest.findFirstOrThrow({ where: { id: existingLeaveId, departmentId, facultyId: faculty.id } });
    console.log(`Existing scenario leave (${leave.startDate}, ${leave.status}): /leave?request=${leave.id}`);
    console.log(`Timetable: /timetable?week=${weekOf(leave.startDate)}`);
    return;
  }

  const [classes, blockedDates] = await Promise.all([db.classOccurrence.findMany({
    where: {
      departmentId, facultyId: faculty.id, localDate: { gte: tomorrow }, schedulingStatus: "ACTIVE", deliveryStatus: "PENDING",
      entry: { timetableVersion: { semesterId } },
    },
    select: { localDate: true },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
  }), db.leaveRequest.findMany({
    where: { departmentId, facultyId: faculty.id, status: { in: ["SUBMITTED", "APPROVED"] }, endDate: { gte: tomorrow } },
    select: { startDate: true, endDate: true },
  })]);
  const occurrence = classes.find(({ localDate }) => !blockedDates.some(({ startDate, endDate }) => startDate <= localDate && localDate <= endDate));
  if (!occurrence) throw new Error("No future classes are free of conflicting leave for the demo faculty member.");

  const dates = { semesterId, startDate: occurrence.localDate, endDate: occurrence.localDate };
  const preview = await readLeaveImpact(faculty.userId, dates);
  if (!preview.ok || !preview.impact?.classes.length) throw new Error("No classes are available for the demo leave preview.");
  const request = await changeLeave(faculty.userId, {
    ...dates, operation: "submit", requestId: leaveRequestId, privateReason: "Synthetic demo: attending a faculty development workshop.",
  });
  if (!request.ok || !request.leaveId) throw new Error(request.message);
  console.log(`Pending leave for ${dates.startDate}: /leave?request=${request.leaveId}`);
  for (const entry of preview.impact.classes) console.log(`  ${entry.course} · ${entry.section} · ${clockTime(entry.startMinute)}–${clockTime(entry.endMinute)} · ${entry.room}`);
  console.log(`Timetable: /timetable?week=${weekOf(dates.startDate)}`);
}

try {
  await seedScenario();
} finally {
  await db.$disconnect();
}
