import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { timetableFixture, cleanupTimetable } from "../support/timetable-fixture";
import { materialize, weekOf } from "../../src/domain/scheduling/timetable";
const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID(); let passwordHash: string;
let f: Awaited<ReturnType<typeof timetableFixture>>;
test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => {
  f = await timetableFixture(db, passwordHash);
  // Project-authored browser fixture: real dated classes, never a production seed.
  const version = await db.timetableVersion.create({ data: { departmentId: f.departmentId, semesterId: f.semester.id, status: "PUBLISHED", publishedAt: new Date(), baseScheduleRevision: 0, effectiveFrom: f.semester.startDate, effectiveTo: f.semester.endDate } });
  for (const p of f.entries) {
    const entry = await db.timetableEntry.create({ data: { ...p, departmentId: f.departmentId, timetableVersionId: version.id } });
    for (const o of materialize([p], f.semester.startDate, f.semester.endDate, ["2099-01-12"])) {
      const obligation = await db.teachingObligation.create({ data: { departmentId: f.departmentId, allocationId: p.allocationId, seriesId: p.seriesId, weekDate: weekOf(o.localDate), originalDate: o.localDate, requiredMinutes: 60 } });
      const occurrence = await db.classOccurrence.create({ data: { departmentId: f.departmentId, entryId: entry.id, teachingObligationId: obligation.id, facultyId: f.faculty.id, sectionId: f.section.id, roomId: f.room.id, localDate: o.localDate, startAt: o.startAt, endAt: o.endAt } });
      await db.resourceReservation.createMany({ data: ([['FACULTY', f.faculty.id], ['SECTION', f.section.id], ['ROOM', f.room.id]] as const).map(([resourceType, resourceId]) => ({ departmentId: f.departmentId, occurrenceId: occurrence.id, resourceType, resourceId, startAt: o.startAt, endAt: o.endAt })) });
    }
  }
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: 1 } });
});
test.afterEach(async () => { await cleanupTimetable(db, f.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });
async function login(page: Page, email = f.teacher.email) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
}
async function logout(page: Page) { await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login/); }
async function request(page: Page) {
  await page.goto("/leave"); await page.getByLabel("Start date (inclusive)").fill("2099-01-05"); await page.getByLabel("End date (inclusive)").fill("2099-01-05"); await page.getByLabel("Private reason (optional)").fill("Private browser test reason");
}
async function submit(page: Page) { await page.getByRole("button", { name: "Submit leave", exact: true }).click(); await expect(page).toHaveURL(/\/leave\?request=/); await expect(page.getByRole("heading", { name: "Request details · Pending approval", exact: true })).toBeVisible(); }
test("faculty previews read-only, submits once, separate HoD approves and student sees cancellation without private reasons", async ({ page }) => {
  await login(page); await request(page); await page.getByRole("button", { name: "Preview impact", exact: true }).click();
  await expect(page.getByRole("region", { name: "Read-only impact preview", exact: true })).toContainText("2 affected classes · 120 minutes");
  expect(await db.leaveRequest.count({ where: { departmentId: f.departmentId } })).toBe(0); expect(await db.resourceReservation.count({ where: { departmentId: f.departmentId } })).toBe(18);
  let release!: () => void, started!: () => void; const hold = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { started = r; }); let posts = 0;
  await page.route("**/leave**", async route => { if (route.request().method() === "POST") { posts++; started(); await hold; } await route.continue(); });
  await page.getByRole("button", { name: "Submit leave", exact: true }).click(); await ready;
  try { await expect(page.getByRole("button", { name: "Working…", exact: true })).toBeDisabled(); await expect(page.getByLabel("Start date (inclusive)")).toBeDisabled(); } finally { release(); }
  await expect(page).toHaveURL(/\/leave\?request=/); await expect(page.getByRole("heading", { name: "Request details · Pending approval", exact: true })).toBeVisible(); expect(posts).toBe(1); await page.unroute("**/leave**");
  const requestUrl = page.url(); await logout(page); await login(page, f.hod.email); await page.goto(requestUrl);
  await expect(page.getByRole("region", { name: "Request details · Pending approval", exact: true })).toContainText("Private browser test reason");
  await page.getByRole("button", { name: "Approve leave", exact: true }).click(); await expect(page.getByRole("heading", { name: "Request details · Approved leave", exact: true })).toBeVisible();
  await expect(page.getByText(/2 classes were cancelled by this approval/)).toBeVisible(); expect(await db.resourceReservation.count({ where: { departmentId: f.departmentId } })).toBe(12); expect(await db.teachingObligation.count({ where: { departmentId: f.departmentId } })).toBe(6);
  await logout(page); await login(page, f.student.email); await page.goto("/timetable?week=2099-01-05&cancelled=on");
  await expect(page.locator(".timetable-desktop")).toContainText("Cancelled · Delivery: Pending"); await expect(page.locator("body")).not.toContainText("Private browser test reason"); await page.goto(requestUrl); await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
});
test("validation, rejection reason, owner withdrawal and coordinator privacy", async ({ page }) => {
  await login(page); await request(page);
  await page.getByLabel("End date (inclusive)").fill("2099-01-04"); await page.getByRole("button", { name: "Preview impact", exact: true }).click(); await expect(page.getByRole("form", { name: "Leave request", exact: true }).getByRole("status")).toHaveText("End date must be on or after start date.");
  await page.getByLabel("End date (inclusive)").fill("2099-01-05"); await submit(page); const requestUrl = page.url();
  await logout(page); await login(page, f.coordinator.email); const html = await (await page.goto(requestUrl))!.text(); expect(html).not.toContain("Private browser test reason"); await expect(page.getByRole("button", { name: "Approve leave", exact: true })).toHaveCount(0);
  await logout(page); await login(page, f.hod.email); await page.goto(requestUrl); await page.getByRole("button", { name: "Reject leave", exact: true }).click(); await expect(page.getByText("Give a rejection reason for the requesting faculty.", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Rejection reason (required to reject)").fill("Synthetic rejection for demo"); await page.getByRole("button", { name: "Reject leave", exact: true }).click(); await expect(page.getByRole("heading", { name: "Request details · Rejected", exact: true })).toBeVisible();
  await logout(page); await login(page); await page.goto(requestUrl); await expect(page.getByText("Synthetic rejection for demo", { exact: true })).toBeVisible(); await request(page); await submit(page);
  await page.getByRole("button", { name: "Withdraw pending leave", exact: true }).click(); await expect(page.getByRole("heading", { name: "Request details · Withdrawn", exact: true })).toBeVisible();
});
test("network failure retains input, stale decision is explained and explicit refresh loads the final status", async ({ page }) => {
  await login(page); await request(page);
  await page.route("**/leave**", async route => { if (route.request().method() === "POST") await route.abort(); else await route.continue(); });
  await page.getByRole("button", { name: "Preview impact", exact: true }).click(); await expect(page.getByText(/Could not reach the server/)).toBeVisible(); await expect(page.getByLabel("Private reason (optional)")).toHaveValue("Private browser test reason"); await page.unroute("**/leave**");
  await submit(page); const requestUrl = page.url(), id = new URL(requestUrl).searchParams.get("request")!;
  await logout(page); await login(page, f.hod.email); await page.goto(requestUrl);
  await db.leaveRequest.update({ where: { id }, data: { status: "WITHDRAWN", decidedAt: new Date(), version: { increment: 1 } } });
  await page.getByRole("button", { name: "Approve leave", exact: true }).click(); await expect(page.getByText(/This request changed or was already decided/).first()).toBeVisible();
  await page.getByRole("button", { name: "Refresh current status", exact: true }).click(); await expect(page.getByRole("heading", { name: "Request details · Withdrawn", exact: true })).toBeVisible();
});
for (const width of [320, 390, 768, 1440]) test(`leave form and dense dated preview reflow, accessibility, keyboard and reduced motion at ${width}px`, async ({ page }, testInfo) => {
  await db.user.update({ where: { id: f.teacher.id }, data: { name: "Synthetic lecturer with a deliberately long name for responsive verification" } });
  await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" }); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await login(page); await request(page); await page.getByLabel("End date (inclusive)").fill("2099-01-30");
  await page.getByLabel("Private reason (optional)").focus(); await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Preview impact", exact: true })).toBeFocused(); await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Read-only impact preview", exact: true })).toContainText("6 affected classes · 360 minutes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`leave-preview-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Submit leave", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("heading", { name: "Request details · Pending approval", exact: true })).toBeVisible(); const requestUrl = page.url();
  await logout(page); await login(page, f.hod.email); await page.goto(requestUrl);
  await expect(page.getByRole("heading", { name: "Request details · Pending approval", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]); await page.screenshot({ path: testInfo.outputPath(`leave-review-${width}.png`), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Approve leave", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("heading", { name: "Request details · Approved leave", exact: true })).toBeVisible(); expect(errors).toEqual([]);
});

test("schedule refresh marks an old impact stale, preserves input and recomputes the current preview", async ({ page }) => {
  await login(page); await request(page); await page.getByRole("button", { name: "Preview impact", exact: true }).click();
  await expect(page.getByRole("region", { name: "Read-only impact preview", exact: true })).toContainText("Schedule revision 1");
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  await page.getByRole("button", { name: "Refresh current status", exact: true }).click(); await expect(page.getByText(/This preview is stale because the schedule changed/)).toBeVisible();
  await expect(page.getByLabel("Private reason (optional)")).toHaveValue("Private browser test reason"); await expect(page.getByLabel("Start date (inclusive)")).toHaveValue("2099-01-05");
  await page.getByRole("button", { name: "Preview impact", exact: true }).click(); await expect(page.getByRole("region", { name: "Read-only impact preview", exact: true })).toContainText("Schedule revision 2"); await expect(page.getByText(/This preview is stale because the schedule changed/)).toHaveCount(0);
});

test("a recomputed impact newer than the open page is not falsely labelled stale", async ({ page }) => {
  await login(page); await request(page);
  await page.getByRole("button", { name: "Preview impact", exact: true }).click();
  const preview = page.getByRole("region", { name: "Read-only impact preview", exact: true });
  await expect(preview).toContainText("Schedule revision 1");
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  // Recompute directly while the page still has revision-one props.
  await page.getByRole("button", { name: "Preview impact", exact: true }).click();
  await expect(preview).toContainText("Schedule revision 2");
  await expect(preview.getByText(/This preview is stale/)).toHaveCount(0);
});
