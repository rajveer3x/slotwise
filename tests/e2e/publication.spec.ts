import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanupTimetable } from "../support/timetable-fixture";
import { resolutionFixture } from "../support/resolution-fixture";
import { coverFixture, saturdayOnly } from "../support/cover-fixture";
const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID(); let passwordHash: string;
let f: Awaited<ReturnType<typeof resolutionFixture>>;
test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => { f = await resolutionFixture(db, passwordHash); });
test.afterEach(async () => { await cleanupTimetable(db, f.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });
async function login(page: Page, email = f.coordinator.email) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
}
async function logout(page: Page) { await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/); await expect(page.getByLabel("Email", { exact: true })).toBeVisible(); }
async function open(page: Page) { await page.goto(`/resolutions?leave=${f.leaveId}`); await expect(page.getByRole("heading", { name: "Resolution board", exact: true })).toBeVisible(); }
async function selectSave(page: Page) {
  await page.getByRole("article", { name: "Candidate 1", exact: true }).getByRole("button", { name: "Select candidate", exact: true }).click();
  await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
}
function review(page: Page) { return page.getByRole("region", { name: "Preview and publish", exact: true }); }
async function preview(page: Page) { await review(page).getByRole("button", { name: "Preview selected changes", exact: true }).click(); await expect(review(page).getByRole("heading", { name: "Before / After · Asia/Kolkata", exact: true })).toBeVisible(); }

test("coordinator previews and publishes with keyboard, student refreshes timetable, and unselected class remains unresolved", async ({ page, browser }) => {
  const context = await browser.newContext(), student = await context.newPage();
  try {
    await login(student, f.student.email); await student.goto(`/timetable?semester=${f.semester.id}&week=2099-01-19`); const studentBefore = await student.locator("article.class-block").count();
    await login(page); await open(page); await selectSave(page);
    const before = await db.classOccurrence.count({ where: { departmentId: f.departmentId } });
    const previewButton = review(page).getByRole("button", { name: "Preview selected changes", exact: true });
    await expect(previewButton).toBeEnabled();
    await previewButton.press("Enter");
    await expect(review(page).getByText(/Revision 2 · 1 selected changes · 1 unresolved/)).toBeVisible();
    await expect(review(page).getByRole("article").getByText("Teacher:", { exact: false })).toHaveCount(2);
    await review(page).getByText(/^Affected recipients/).click(); await expect(review(page)).toContainText(f.student.name);
    await review(page).getByText(/^Unresolved classes/).click(); await expect(review(page)).toContainText("CS102");
    expect(await db.classOccurrence.count({ where: { departmentId: f.departmentId } })).toBe(before);
    const publishButton = review(page).getByRole("button", { name: "Publish 1 changes", exact: true });
    await expect(publishButton).toBeEnabled();
    await publishButton.press("Enter");
    await expect(review(page).getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
    expect(await db.schedulePublication.count({ where: { departmentId: f.departmentId } })).toBe(1);
    const replacement = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, publicationId: { not: null } } });
    expect(replacement.resolutionTier).toBe(3);
    await student.goto(`/timetable?semester=${f.semester.id}&week=${replacement.localDate}`); await expect(student.getByText(/Rescheduled · Original 2099-01-05/).first()).toBeVisible();
    expect(await student.locator("article.class-block").count()).toBeGreaterThan(studentBefore); await expect(student.getByText(/Delivery: Pending/).first()).toBeVisible();
    await page.reload(); await expect(page.getByText(/1 affected classes/)).toBeVisible(); await expect(page.getByText(/This draft is stale/)).toBeVisible();
    expect(await db.teachingObligation.count({ where: { departmentId: f.departmentId } })).toBe(6);
  } finally { await context.close(); }
});
test("mobile inbox rolls back a failed optimistic read and records acknowledgement for the coordinator", async ({ page, browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 950 }, reducedMotion: "reduce" });
  const student = await context.newPage();
  try {
    await login(student, f.student.email);
    await student.getByRole("button", { name: "Menu", exact: true }).press("Enter");
    await student.getByRole("dialog").getByRole("link", { name: "Notifications", exact: true }).press("Enter");
    await expect(student.getByText("You have no in-app notifications yet.")).toBeVisible();

    await login(page); await open(page); await selectSave(page); await preview(page);
    await review(page).getByRole("button", { name: "Publish 1 changes", exact: true }).click();
    await expect(review(page).getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
    await page.goto("/notifications");
    const counts = page.getByRole("region", { name: "Department acknowledgements" });
    await expect(counts).toContainText("0 of 5 acknowledged");

    await student.getByRole("button", { name: "Refresh", exact: true }).press("Enter");
    await expect(student.getByText("1 unread", { exact: true })).toBeVisible();
    await expect(student.getByRole("heading", { name: "Department acknowledgements" })).toHaveCount(0);
    const coordinatorNote = await db.notification.findFirstOrThrow({ where: { recipientId: f.coordinator.id } });
    await student.goto(`/notifications?notice=${coordinatorNote.id}`);
    await expect(student.getByText("This notification is unavailable for your account.")).toBeVisible();
    await student.getByRole("link", { name: "Back to all updates" }).click();
    const failPost = "**/notifications**";
    let reached!: () => void, release!: () => void;
    const started = new Promise<void>(r => { reached = r; });
    const hold = new Promise<void>(r => { release = r; });
    await student.route(failPost, async route => {
      if (route.request().method() !== "POST") return route.continue();
      reached(); await hold; await route.abort();
    });
    await student.getByRole("button", { name: "Mark as read", exact: true }).press("Enter");
    await started;
    try {
      await expect(student.getByText("0 unread", { exact: true })).toBeVisible();
      await expect(student.getByRole("button", { name: "Mark as read", exact: true })).toBeDisabled();
    } finally { release(); }
    await expect(student.getByRole("status").filter({ hasText: "Could not reach the server. Try again." })).toBeVisible();
    await expect(student.getByText("1 unread", { exact: true })).toBeVisible();
    await student.unroute(failPost);
    await student.getByRole("button", { name: "Mark as read", exact: true }).press("Enter");
    await expect(student.getByRole("status").filter({ hasText: "Marked as read." })).toBeVisible();
    await student.reload();
    await expect(student.getByText("0 unread", { exact: true })).toBeVisible();
    await student.getByRole("button", { name: "Acknowledge change" }).press("Enter");
    await expect(student.getByText(/^Acknowledged ·/)).toBeVisible();
    await student.reload();
    await expect(student.getByText(/^Acknowledged ·/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Your updates" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh", exact: true }).press("Enter");
    await expect(counts).toContainText("1 of 5 acknowledged");
    await counts.getByRole("link", { name: "Review published change" }).press("Enter");
    await expect(page.getByRole("link", { name: "Back to all updates" })).toBeVisible();

    for (const width of [320, 390, 768, 1440]) {
      await student.setViewportSize({ width, height: 1024 });
      expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page: student }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      if (width === 390 || width === 1440) await student.screenshot({ path: testInfo.outputPath(`notifications-${width}.png`) });
      await student.evaluate(() => { document.documentElement.style.zoom = "2"; });
      expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await student.evaluate(() => { document.documentElement.style.zoom = ""; });
    }
    await student.setViewportSize({ width: 390, height: 950 });
    await student.getByRole("link", { name: "Open current timetable" }).press("Enter");
    await expect(student.getByRole("heading", { name: "Timetable", exact: true })).toBeVisible();
    await expect(student.getByRole("region", { name: "Published weekly agenda" })).toContainText(/Rescheduled · Original 2099-01-05/);
    await expect(student.getByRole("region", { name: "Published weekly agenda" })).toContainText("Delivery: Pending");
  } finally { await context.close(); }
});

test("stale preview is rejected and recompute/save/preview recovers retained selection", async ({ page }) => {
  await login(page); await open(page); await selectSave(page); await preview(page);
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  await review(page).getByRole("button", { name: "Publish 1 changes", exact: true }).click();
  await expect(review(page).getByText(/Stale preview\./)).toBeVisible(); await expect(review(page).getByRole("button", { name: "Publish 1 changes", exact: true })).toBeDisabled();
  expect(await db.schedulePublication.count({ where: { departmentId: f.departmentId } })).toBe(0);
  await page.getByRole("button", { name: "Recompute current resources", exact: true }).click(); await expect(page.getByText(/Schedule revision 3/)).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await preview(page); await expect(review(page).getByRole("button", { name: "Publish 1 changes", exact: true })).toBeEnabled();
  await review(page).getByRole("button", { name: "Publish 1 changes", exact: true }).click(); await expect(review(page).getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
});
test("network failure retains preview and selections, pending disables actions, and duplicate clicks commit only once", async ({ page }) => {
  await login(page); await open(page); await selectSave(page); await preview(page);
  await page.route("**/resolutions**", async route => { if (route.request().method() === "POST") await route.abort(); else await route.continue(); });
  await review(page).getByRole("button", { name: "Publish 1 changes", exact: true }).click(); await expect(review(page).getByText(/Could not reach the server/)).toBeVisible(); await expect(review(page).getByRole("checkbox")).toBeChecked(); await page.unroute("**/resolutions**");
  let release!: () => void, started!: () => void; const hold = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { started = r; });
  await page.route("**/resolutions**", async route => { if (route.request().method() === "POST") { started(); await hold; } await route.continue(); });
  await review(page).getByRole("button", { name: "Publish 1 changes", exact: true }).click(); await ready;
  try { await expect(review(page).getByRole("button", { name: "Publishing…", exact: true })).toBeDisabled(); await expect(review(page).getByRole("checkbox")).toBeDisabled(); } finally { release(); }
  await expect(review(page).getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible(); await page.unroute("**/resolutions**");
  expect(await db.schedulePublication.count({ where: { departmentId: f.departmentId } })).toBe(1);
});
test("an exact cover acceptance enables publication with the invited teacher and students see that assignment", async ({ page }) => {
  await cleanupTimetable(db, f.departmentId); const c = await coverFixture(db, passwordHash); f = c;
  await login(page); await open(page); await selectSave(page); await preview(page); await expect(review(page).getByText(/needs an accepted cover response/)).toBeVisible(); await expect(review(page).getByRole("button", { name: "Publish 1 changes" })).toBeDisabled();
  await page.getByRole("button", { name: "Send cover invitation", exact: true }).click(); await expect(page.getByText(/Exact cover invitation sent in-app/)).toBeVisible();
  const invite = await db.substitutionRequest.findFirstOrThrow({ where: { departmentId: f.departmentId } }), invited = c.substitutes.find(s => s.user.id === invite.invitedUserId)!;
  await logout(page); await login(page, invited.user.email); await page.goto("/cover-requests"); await page.getByRole("button", { name: "Accept cover", exact: true }).click(); await expect(page.getByText(/Accepted—pending publication\. Nothing is reserved/)).toBeVisible();
  await logout(page); await login(page); await open(page); await preview(page); await expect(review(page).getByRole("button", { name: "Publish 1 changes" })).toBeEnabled(); await review(page).getByRole("button", { name: "Publish 1 changes" }).click(); await expect(review(page).getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
  await logout(page); await login(page, f.student.email); await page.goto(`/timetable?semester=${f.semester.id}&week=2099-01-05`); await expect(page.locator("article").filter({ hasText: "Substitute assigned" }).first()).toContainText(invited.user.name);
  await page.goto(`/resolutions?leave=${f.leaveId}`); await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
});
test("online link validation and published online timetable content remain visible", async ({ page }) => {
  await db.department.update({ where: { id: f.departmentId }, data: { onlineTeachingEnabled: true } }); await db.room.updateMany({ where: { departmentId: f.departmentId }, data: { archived: true } });
  await login(page); await open(page); await selectSave(page); await preview(page); await expect(review(page).getByText(/^Each selected online class needs/)).toBeVisible();
  const url = "https://meet.example.test/synthetic-class"; await review(page).getByRole("textbox", { name: /HTTPS meeting URL/ }).fill(url); await preview(page); await expect(review(page).getByRole("link", { name: `Meeting link: ${url}` })).toBeVisible();
  await review(page).getByRole("button", { name: "Publish 1 changes" }).click(); await expect(review(page).getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
  const row = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, publicationId: { not: null } } });
  await logout(page); await login(page, f.student.email); await page.goto(`/timetable?semester=${f.semester.id}&week=${row.localDate}`); await expect(page.getByRole("link", { name: "Open meeting", exact: true }).first()).toHaveAttribute("href", url);
});
for (const width of [320, 390, 768, 1440]) test(`publication comparison reflows at ${width}px with keyboard, reduced motion, 200% zoom and axe`, async ({ page }, testInfo) => {
  await db.user.update({ where: { id: f.teacher.id }, data: { name: "Synthetic lecturer with a deliberately long faculty name for preview reflow verification" } });
  await page.setViewportSize({ width, height: 1100 }); await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await login(page); await open(page); await selectSave(page); await preview(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await review(page).getByText(/^Affected recipients/).focus(); await page.keyboard.press("Enter"); await expect(review(page)).toContainText(f.student.name);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await review(page).screenshot({ path: testInfo.outputPath(`publication-${width}.png`) });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await review(page).getByRole("button", { name: "Publish 1 changes", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(review(page).getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible(); expect(errors).toEqual([]);
});
test("approved Saturday recovery appears in the student's sixth timetable day", async ({ page }) => {
  await saturdayOnly(db, f); await login(page); await open(page); await selectSave(page);
  await page.getByLabel("Saturday request reason (required)").fill("Synthetic: all earlier tiers exhausted"); await page.getByRole("button", { name: "Request HoD exception" }).click(); await expect(page.getByText(/Exact Saturday exception requested/)).toBeVisible();
  await logout(page); await login(page, f.hod.email); await page.goto("/cover-requests"); await page.getByLabel("HoD decision reason (required)").fill("Synthetic exact Saturday approved"); await page.getByRole("button", { name: "Approve exact Saturday" }).click(); await expect(page.getByText(/Exact Saturday candidate approved/)).toBeVisible();
  await logout(page); await login(page); await open(page); await preview(page); await review(page).getByRole("button", { name: "Publish 1 changes" }).click(); await expect(review(page).getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
  const row = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: f.departmentId, resolutionTier: 5 } });
  await logout(page); await login(page, f.student.email); await page.goto(`/timetable?semester=${f.semester.id}&week=${row.localDate}`); await expect(page.getByRole("columnheader", { name: /Saturday/ })).toBeVisible(); await expect(page.locator(".timetable-desktop article").filter({ hasText: "Rescheduled" })).toHaveCount(1);
});
