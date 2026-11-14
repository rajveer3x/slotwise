import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "../../src/generated/prisma/client";
import { cleanupTimetable, timetableFixture } from "../support/timetable-fixture";
import { addSubstitutes } from "../support/cover-fixture";

const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID();
let f: Awaited<ReturnType<typeof timetableFixture>>;
let passwordHash: string;
const privateReason = "Synthetic confidential leave reason";
const axeTags = ["wcag2a", "wcag2aa", "wcag21aa"];

test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => { f = await timetableFixture(db, passwordHash); });
test.afterEach(async () => { await cleanupTimetable(db, f.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("full synthetic MVP walkthrough across five roles keeps timetable, inbox, ledger and audit consistent", async ({ browser, page }, info) => {
  test.setTimeout(90_000);
  const where = { departmentId: f.departmentId };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const [{ user: substitute, faculty: substituteFaculty }] = await addSubstitutes(db, f, passwordHash, 1);
  const sessions = [f.teacher, f.hod, substitute, f.student];
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ reducedMotion: "reduce" })));
  try {
    const [faculty, hod, invited, student] = await Promise.all(contexts.map(context => context.newPage()));
    for (const sessionPage of [faculty, hod, invited, student]) sessionPage.on("pageerror", error => errors.push(error.message));
    await login(page, f.coordinator.email);
    await page.goto("/timetable");
    await page.getByRole("button", { name: "Create draft" }).press("Enter");
    const placement = page.getByRole("region", { name: "Move class / Place class" });
    for (const [index, allocation] of f.allocations.entries()) {
      await placement.getByLabel("Allocation", { exact: true }).selectOption(allocation.id);
      await placement.getByLabel("Start slot").selectOption(String(540 + index * 60));
      await placement.getByLabel("End slot").selectOption(String(600 + index * 60));
      await placement.getByLabel("Room", { exact: true }).selectOption(f.room.id);
      await placement.getByRole("button", { name: "Place class" }).press("Enter");
      await expect(page.getByRole("heading", { name: `Weekly draft · Version ${index + 2}` })).toBeVisible();
    }
    const previewTemplate = page.getByRole("button", { name: "Preview publication" });
    await expect(previewTemplate).toBeEnabled();
    await previewTemplate.press("Enter");
    const publishTemplate = page.getByRole("button", { name: "Publish 6 classes" });
    await expect(publishTemplate).toBeEnabled();
    await publishTemplate.press("Enter");
    await expect(page.getByText(/Published schedule · Revision 1/)).toBeVisible();

    await login(faculty, f.teacher.email);
    await faculty.goto("/leave");
    for (const label of ["Start date (inclusive)", "End date (inclusive)"]) {
      await faculty.getByLabel(label).fill(f.semester.startDate);
    }
    await faculty.getByLabel("Private reason (optional)").fill(privateReason);
    await faculty.getByRole("button", { name: "Preview impact" }).press("Enter");
    await expect(faculty.getByRole("region", { name: "Read-only impact preview" })).toContainText("2 affected classes · 120 minutes");
    await faculty.getByRole("button", { name: "Submit leave" }).press("Enter");
    await expect(faculty).toHaveURL(/\/leave\?request=/);
    const leave = await db.leaveRequest.findFirstOrThrow({ where });

    await login(hod, f.hod.email);
    await hod.goto(faculty.url());
    await hod.getByRole("button", { name: "Approve leave" }).press("Enter");
    await expect(hod.getByRole("heading", { name: "Request details · Approved leave" })).toBeVisible();

    const boardUrl = `/resolutions?leave=${leave.id}`;
    await page.goto(boardUrl);
    const candidate = page.getByRole("article", { name: "Candidate 1", exact: true });
    await expect(candidate).toContainText(substitute.name);
    await candidate.getByRole("button", { name: "Select candidate" }).press("Enter");
    const saveResolution = page.getByRole("button", { name: "Save draft", exact: true });
    await expect(saveResolution).toBeEnabled();
    await saveResolution.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await page.getByRole("button", { name: "Send cover invitation" }).press("Enter");
    await expect(page.getByText(/Exact cover invitation sent in-app/)).toBeVisible();

    await login(invited, substitute.email);
    await invited.goto("/cover-requests");
    await invited.getByRole("button", { name: "Accept cover" }).press("Enter");
    await expect(invited.getByText(/Accepted—pending publication\. Nothing is reserved/)).toBeVisible();
    expect(await db.resourceReservation.count({ where })).toBe(12);

    await page.goto(boardUrl);
    const review = page.getByRole("region", { name: "Preview and publish" });
    await review.getByRole("button", { name: "Preview selected changes" }).press("Enter");
    await expect(review.getByRole("heading", { name: "Before / After · Asia/Kolkata" })).toBeVisible();
    const publishRecovery = review.getByRole("button", { name: "Publish 1 changes" });
    await expect(publishRecovery).toBeEnabled();
    await publishRecovery.press("Enter");
    await expect(review.getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
    const replacement = await db.classOccurrence.findFirstOrThrow({ where: { ...where, publicationId: { not: null } } });
    expect(replacement).toMatchObject({ facultyId: substituteFaculty.id, resolutionTier: 1, deliveryStatus: "PENDING" });

    await login(student, f.student.email);
    await student.goto("/notifications");
    const recoveryNote = student.getByRole("article").filter({ hasText: "Schedule recovery published." });
    await recoveryNote.getByRole("button", { name: "Acknowledge change" }).press("Enter");
    await expect(recoveryNote.getByText(/^Acknowledged ·/)).toBeVisible();
    await student.reload();
    await expect(recoveryNote.getByText(/^Acknowledged ·/)).toBeVisible();
    await recoveryNote.getByRole("link", { name: "Open current timetable" }).press("Enter");
    await expect(student).toHaveURL(/\/timetable\?/);
    const timetableResponse = await student.reload();
    const assignment = student.locator(".timetable-desktop article").filter({ hasText: "Substitute assigned" });
    await expect(assignment).toContainText(substitute.name);
    await expect(assignment).toContainText("Delivery: Pending");
    expect(await timetableResponse!.text()).not.toContain(privateReason);

    await student.goto("/notifications");
    const inboxResponse = await student.reload();
    const payload = await inboxResponse!.text();
    for (const secret of [privateReason, passwordHash, f.outsider.email, f.coordinator.email]) {
      expect(payload).not.toContain(secret);
    }
    await expect(recoveryNote.getByText(/^Acknowledged ·/)).toBeVisible();
    await student.goto("/audit");
    await expect(student.getByRole("heading", { name: "Access denied" })).toBeVisible();

    await page.goto("/notifications");
    await expect(page.getByRole("region", { name: "Department acknowledgements" })).toContainText("1 of 6 acknowledged");
    await page.goto("/classes-owed");
    await page.reload();
    const ledger = page.getByRole("row").filter({ hasText: "CS101" });
    await expect(ledger.getByRole("cell")).toHaveText(["240 min", "0 min", "180 min", "240 min", "0 min"]);
    expect(await db.deliveryRecord.count({ where })).toBe(0);
    expect(await db.teachingObligation.count({ where })).toBe(6);
    const reservations = await db.resourceReservation.findMany({ where, orderBy: { startAt: "asc" } });
    expect(reservations).toHaveLength(15);
    const ends = new Map<string, Date>();
    for (const reservation of reservations) {
      const key = `${reservation.resourceType}:${reservation.resourceId}`;
      const previousEnd = ends.get(key);
      if (previousEnd) expect(+previousEnd).toBeLessThanOrEqual(+reservation.startAt);
      ends.set(key, reservation.endAt);
    }

    const audit = await db.auditEvent.findFirstOrThrow({ where: { ...where, action: "RESOLUTION_PUBLISHED" } });
    expect(audit.after).toMatchObject({ changes: [{ occurrenceId: replacement.id, schedulingStatus: "ACTIVE" }] });
    const auditResponse = await page.goto(`/audit?event=${audit.id}`);
    const auditHtml = await auditResponse!.text();
    expect(auditHtml).not.toContain(privateReason);
    await expect(page.getByRole("heading", { name: "Recovery published", exact: true })).toBeVisible();
    await expect(page.getByText(replacement.id, { exact: true })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Leave submitted" })).toContainText(f.teacher.name);
    await expect(page.getByRole("row").filter({ hasText: "Leave approved" })).toContainText(f.hod.name);
    await expect(page.getByRole("row").filter({ hasText: "Cover accepted" })).toContainText(substitute.name);
    await expect(page.getByRole("row").filter({ hasText: "Timetable published" })).toContainText(f.coordinator.name);
    await page.screenshot({ path: info.outputPath("audit-desktop.png"), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test("audit filters, details and read-only controls reflow with keyboard, zoom and reduced motion", async ({ page }, info) => {
  test.setTimeout(60_000);
  await login(page, f.hod.email);
  await page.goto("/audit");
  await expect(page.getByText(/No audit events have been recorded/)).toBeVisible();
  const audit = await db.auditEvent.create({ data: {
    departmentId: f.departmentId, actorId: f.coordinator.id, action: "SATURDAY_APPROVED",
    entityId: "synthetic-exception", before: { status: "PENDING" },
    after: { status: "APPROVED", reason: "Synthetic reason for Saturday recovery" },
  } });
  await page.goto("/dashboard");
  await page.setViewportSize({ width: 390, height: 950 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Menu", exact: true }).press("Enter");
  await page.getByRole("dialog").getByRole("link", { name: "Audit", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Audit history" })).toBeVisible();
  await page.getByLabel("Actor", { exact: true }).selectOption(f.coordinator.id);
  await page.getByLabel("Action", { exact: true }).selectOption("SATURDAY_APPROVED");
  await page.getByLabel("Entity ID", { exact: true }).fill(audit.entityId);
  await page.getByRole("button", { name: "Apply filters" }).press("Enter");
  await expect(page.getByText("1 event · Page 1 of 1")).toBeVisible();
  await page.getByRole("link", { name: "Saturday approved" }).press("Enter");
  await expect(page.getByRole("region", { name: "Saturday approved" })).toContainText("Synthetic reason for Saturday recovery");
  await expect(page.getByRole("button", { name: /Edit|Delete|Save/ })).toHaveCount(0);
  expect(await page.locator("form").evaluateAll(forms => forms.every(form => (form as HTMLFormElement).method === "get"))).toBe(true);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1024 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Close event details" })).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
    if (width === 390) await page.screenshot({ path: info.outputPath("audit-mobile.png"), fullPage: true });
  }

  await page.goto("/audit?from=2026-11-15&to=2026-11-14");
  await expect(page.getByRole("alert").filter({ hasText: "End date must be on or after start date." })).toBeVisible();
  await page.goto("/audit?entity=unknown");
  await expect(page.getByText("No audit events match these filters.")).toBeVisible();
  await page.goto("/audit?event=unknown");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  for (const method of ["PATCH", "DELETE"]) {
    expect((await page.request.fetch(`/api/audit/${audit.id}`, { method })).status()).toBe(404);
  }
  expect(await db.auditEvent.findUnique({ where: { id: audit.id } })).toEqual(audit);
});
