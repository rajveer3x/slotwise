import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { coverFixture, saturdayOnly } from "../support/cover-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";
const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID(); let passwordHash: string;
let f: Awaited<ReturnType<typeof coverFixture>>;
test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => { f = await coverFixture(db, passwordHash); });
test.afterEach(async () => { await cleanupTimetable(db, f.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });
async function login(page: Page, email = f.coordinator.email) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
}
async function selected(page: Page) {
  await page.goto(`/resolutions?leave=${f.leaveId}`);
  const candidate = page.getByRole("article", { name: "Candidate 1", exact: true });
  await candidate.getByRole("button", { name: "Select candidate", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  return candidate;
}
async function invited(page: Page) {
  await login(page); const candidate = await selected(page);
  await candidate.getByRole("button", { name: "Send cover invitation", exact: true }).click();
  await expect(candidate.getByText(/Exact cover invitation sent in-app/)).toBeVisible();
  const request = await db.substitutionRequest.findFirstOrThrow({ where: { departmentId: f.departmentId } });
  return { request, email: f.substitutes.find(x => x.user.id === request.invitedUserId)!.user.email };
}
async function workspace(page: Page) { await page.goto("/cover-requests"); await expect(page.getByRole("heading", { name: "Cover & exceptions", exact: true })).toBeVisible(); }

test("distinct coordinator and invited faculty complete real acceptance with durable updates and unchanged timetable", async ({ page, browser }) => {
  const r = await invited(page), context = await browser.newContext(), faculty = await context.newPage();
  try {
    await login(faculty, r.email); await workspace(faculty);
    await expect(faculty.getByText(/Response expires/)).toBeVisible(); await expect(faculty.getByText(/Asia\/Kolkata/).first()).toBeVisible();
    await faculty.getByRole("button", { name: "Accept cover", exact: true }).focus(); await faculty.keyboard.press("Enter");
    await expect(faculty.getByRole("heading", { name: "Accepted—pending publication", exact: true })).toBeVisible();
    await expect(faculty.getByRole("status").filter({ hasText: /Nothing is reserved/ })).toBeVisible();
    await faculty.reload(); await expect(faculty.getByRole("button", { name: "Accept cover", exact: true })).toHaveCount(0);
    await workspace(page); await expect(page.getByRole("heading", { name: "Accepted—pending publication", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your recovery updates" })).toBeVisible();
    expect(await db.resourceReservation.count({ where: { departmentId: f.departmentId } })).toBe(12);
    expect(await db.classOccurrence.count({ where: { departmentId: f.departmentId, schedulingStatus: "CANCELLED" } })).toBe(2);
    expect((await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision).toBe(2);
    const html = await faculty.content(); expect(html).not.toContain("Private browser resolution reason"); expect(html).not.toContain("passwordHash");
  } finally { await context.close(); }
});
test("decline history advances coordinator's next candidate; expired reads and stale eligibility prevent response", async ({ page, browser }) => {
  const r = await invited(page), context = await browser.newContext(), faculty = await context.newPage();
  try {
    await login(faculty, r.email); await workspace(faculty); await faculty.getByRole("button", { name: "Decline cover", exact: true }).click();
    await expect(faculty.getByRole("heading", { name: "Declined", exact: true })).toBeVisible();
    await page.goto(`/resolutions?leave=${f.leaveId}`); await expect(page.getByText(/Saved selection is no longer valid/)).toBeVisible();
    await page.getByText("Response and exception history", { exact: true }).click(); await expect(page.getByText("Cover · Declined", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Recompute current resources", exact: true }).click();
    const candidate = page.getByRole("article", { name: "Candidate 1", exact: true });
    await candidate.getByRole("button", { name: "Select candidate", exact: true }).click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await candidate.getByRole("button", { name: "Send cover invitation", exact: true }).click(); await expect(candidate.getByText(/Exact cover invitation sent in-app/)).toBeVisible();
    const next = await db.substitutionRequest.findFirstOrThrow({ where: { departmentId: f.departmentId, status: "PENDING" } }); expect(next.invitedUserId).not.toBe(r.request.invitedUserId);
    const nextUser = f.substitutes.find(x => x.user.id === next.invitedUserId)!;
    await faculty.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(faculty).toHaveURL(/\/login$/); await expect(faculty.getByLabel("Email", { exact: true })).toBeVisible(); await login(faculty, nextUser.user.email); await workspace(faculty);
    await db.facultyQualification.updateMany({ where: { facultyId: nextUser.faculty.id }, data: { archived: true } });
    await faculty.getByRole("button", { name: "Refresh responses", exact: true }).click(); await expect(faculty.getByText(/This saved candidate or its eligibility changed/)).toBeVisible(); await expect(faculty.getByRole("button", { name: "Accept cover", exact: true })).toHaveCount(0);
    await db.facultyQualification.updateMany({ where: { facultyId: nextUser.faculty.id }, data: { archived: false } });
    const now = new Date(); await db.substitutionRequest.update({ where: { id: next.id }, data: { createdAt: new Date(now.getTime() - 1000), expiresAt: now } });
    await faculty.reload(); await expect(faculty.getByRole("heading", { name: "Expired", exact: true })).toBeVisible(); await expect(faculty.getByRole("button", { name: "Accept cover", exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});
test("coordinator requests exact Saturday and distinct HoD inspects earlier failures, validates reason and approves", async ({ page, browser }, testInfo) => {
  await saturdayOnly(db, f); await login(page); const candidate = await selected(page);
  await expect(candidate.getByRole("button", { name: "Request HoD exception", exact: true })).toBeDisabled();
  await candidate.getByLabel("Saturday request reason (required)").fill("Synthetic earlier tiers unavailable. Recover the retained obligation.");
  await candidate.getByRole("button", { name: "Request HoD exception", exact: true }).click(); await expect(candidate.getByText(/Exact Saturday exception requested/)).toBeVisible();
  const context = await browser.newContext(), hod = await context.newPage();
  try {
    await login(hod, f.hod.email); await workspace(hod);
    await hod.getByText(/Why earlier tiers failed/).click(); await expect(hod.getByText(/Teacher unavailable for the full interval/).first()).toBeVisible();
    await expect(hod.getByRole("button", { name: "Approve exact Saturday", exact: true })).toBeDisabled();
    await hod.getByLabel("HoD decision reason (required)").fill("Reviewed earlier tiers and exact room, teacher and time for this synthetic Saturday.");
    await hod.getByText(/Why earlier tiers failed/).click();
    await hod.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1440]) {
      await hod.setViewportSize({ width, height: 1000 });
      expect(await hod.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page: hod }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      if ([390, 1440].includes(width)) await hod.screenshot({ path: testInfo.outputPath(`saturday-hod-${width}.png`), fullPage: true });
    }
    await hod.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await hod.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await hod.getByRole("button", { name: "Approve exact Saturday", exact: true }).focus(); await hod.keyboard.press("Enter");
    await expect(hod.getByRole("heading", { name: "Approved—pending publication", exact: true })).toBeVisible();
    await workspace(page); await expect(page.getByText(/Decision reason: Reviewed earlier tiers/)).toBeVisible();
    const exception = await db.saturdayException.findFirstOrThrow({ where: { departmentId: f.departmentId } }); expect(exception.reviewerId).toBe(f.hod.id); expect(exception.status).toBe("APPROVED");
    expect(await db.resourceReservation.count({ where: { departmentId: f.departmentId } })).toBe(12);
  } finally { await context.close(); }
});
test("response retains retry after network failure, shows pending state, and rejects deadline passed during an open page", async ({ page, browser }) => {
  const r = await invited(page), context = await browser.newContext(), faculty = await context.newPage();
  try {
    await login(faculty, r.email); await workspace(faculty);
    await faculty.route("**/cover-requests**", async route => { if (route.request().method() === "POST") await route.abort(); else await route.continue(); });
    await faculty.getByRole("button", { name: "Accept cover", exact: true }).click(); await expect(faculty.getByText(/Could not reach the server/)).toBeVisible(); await faculty.unroute("**/cover-requests**");
    let release!: () => void, started!: () => void; const hold = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; });
    await faculty.route("**/cover-requests**", async route => { if (route.request().method() === "POST") { started(); await hold; } await route.continue(); });
    await faculty.getByRole("button", { name: "Accept cover", exact: true }).click(); await ready;
    try {
      await expect(faculty.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled(); await expect(faculty.getByRole("button", { name: "Decline cover", exact: true })).toBeDisabled();
      const now = new Date(); await db.substitutionRequest.update({ where: { id: r.request.id }, data: { createdAt: new Date(now.getTime() - 1000), expiresAt: now } });
    } finally { release(); }
    await expect(faculty.getByText(/The response deadline has passed/)).toBeVisible(); await expect(faculty.getByRole("heading", { name: "Expired", exact: true })).toBeVisible();
  } finally { await context.close(); }
});
test("empty staff workspace and direct student denial", async ({ page }) => {
  await login(page, f.teacher.email); await workspace(page); await expect(page.getByText(/No cover invitations in your scope/)).toBeVisible(); await expect(page.getByText(/No Saturday exceptions in your scope/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/); await expect(page.getByLabel("Email", { exact: true })).toBeVisible(); await login(page, f.student.email); await page.goto("/cover-requests"); await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
});
for (const width of [320, 390, 768, 1440]) test(`cover workspace reflows, keyboard controls, reduced motion and axe at ${width}px`, async ({ page, browser }, testInfo) => {
  const r = await invited(page), context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" }), faculty = await context.newPage();
  try {
    await login(faculty, r.email); await workspace(faculty);
    expect(await faculty.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page: faculty }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await faculty.screenshot({ path: testInfo.outputPath(`cover-${width}.png`), fullPage: true });
    await faculty.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await faculty.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await faculty.getByRole("button", { name: "Accept cover", exact: true }).focus(); await faculty.keyboard.press("Enter"); await expect(faculty.getByRole("heading", { name: "Accepted—pending publication", exact: true })).toBeVisible();
  } finally { await context.close(); }
});
