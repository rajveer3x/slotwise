import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanupTimetable } from "../support/timetable-fixture";
import { resolutionFixture } from "../support/resolution-fixture";
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
async function board(page: Page) { await page.goto(`/resolutions?leave=${f.leaveId}`); await expect(page.getByRole("heading", { name: "Candidates for selected class", exact: true })).toBeVisible(); }
test("coordinator explains, selects, saves and reloads a draft without publication or reservations", async ({ page }) => {
  await login(page); await board(page);
  await expect(page.getByRole("list", { name: "Resolution tiers" })).toContainText("3. Weekday · First viable tier");
  const candidate = page.getByRole("article", { name: "Candidate 1", exact: true });
  await candidate.getByText("Score and eligibility details", { exact: true }).click(); await expect(candidate).toContainText("Integer score"); await expect(candidate).toContainText("calendar days of delay");
  await candidate.getByRole("button", { name: "Select candidate", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  expect(await db.resourceReservation.count({ where: { departmentId: f.departmentId } })).toBe(12);
  expect(await db.classOccurrence.count({ where: { departmentId: f.departmentId, schedulingStatus: "CANCELLED" } })).toBe(2);
  expect((await db.semester.findUniqueOrThrow({ where: { id: f.semester.id } })).scheduleRevision).toBe(2);
  expect(await db.notification.count({ where: { departmentId: f.departmentId } })).toBe(0);
  await page.reload(); await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible(); await expect(page.getByText(/Draft version 1/)).toBeVisible();
  const html = await page.content(); expect(html).not.toContain("Private browser resolution reason"); expect(html).not.toContain("passwordHash");
  await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
});
test("rejection reasons, failure, pending and stale recomputation preserve choices", async ({ page }) => {
  await login(page); await board(page);
  const candidate = page.getByRole("article", { name: "Candidate 1", exact: true });
  await candidate.getByText("Reject this candidate with a reason", { exact: true }).click();
  await expect(candidate.getByRole("button", { name: "Reject and recompute" })).toBeDisabled();
  await candidate.getByLabel("Rejection reason (required)").fill("Synthetic timing preference"); await candidate.getByRole("button", { name: "Reject and recompute" }).click();
  await expect(page.getByText("1 explicit rejections retained.")).toBeVisible();
  await page.getByRole("article", { name: "Candidate 1", exact: true }).getByRole("button", { name: "Select candidate", exact: true }).click(); await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible();
  await page.route("**/resolutions**", async route => { if (route.request().method() === "POST") await route.abort(); else await route.continue(); });
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByText(/Could not reach the server/)).toBeVisible(); await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible(); await page.unroute("**/resolutions**");
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByText("This draft is stale. Recompute and review retained choices before saving.")).toBeVisible();
  let release!: () => void, started!: () => void; const hold = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { started = r; });
  await page.route("**/resolutions**", async route => { if (route.request().method() === "POST") { started(); await hold; } await route.continue(); });
  await page.getByRole("button", { name: "Recompute current resources", exact: true }).click(); await ready;
  try { await expect(page.getByRole("button", { name: "Working…", exact: true })).toBeDisabled(); await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled(); } finally { release(); }
  await expect(page.getByText(/Schedule revision 3/)).toBeVisible(); await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible(); await expect(page.getByText("1 explicit rejections retained.")).toBeVisible();
  await page.unroute("**/resolutions**"); await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
});
test("unresolved and empty boards, direct unauthorized route and provisional faculty estimates", async ({ page }) => {
  await db.facultyAvailability.updateMany({ where: { departmentId: f.departmentId }, data: { archived: true } });
  await login(page); await board(page); await expect(page.getByText(/Unresolved · NO_VALID_CANDIDATE/)).toBeVisible(); await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByText(/Rejected alternatives \(/).click(); await expect(page.getByText(/Teacher unavailable for the full interval:/)).toBeVisible();
  await db.classOccurrence.updateMany({ where: { departmentId: f.departmentId, leaveRequestId: f.leaveId }, data: { resolved: true } });
  await page.reload(); await expect(page.getByText(/No unresolved teaching obligations for this leave/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await login(page, f.teacher.email);
  await page.goto(`/resolutions?leave=${f.leaveId}`); await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
  await page.goto("/leave"); await page.getByLabel("Start date (inclusive)").fill("2099-01-19"); await page.getByLabel("End date (inclusive)").fill("2099-01-19"); await page.getByRole("button", { name: "Preview impact", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Provisional coverage estimate" })).toBeVisible(); await expect(page.getByText("Estimates only; no class is covered or reserved.")).toBeVisible();
});
for (const width of [320, 390, 768, 1440]) test(`resolution board reflows with keyboard, disclosures, reduced motion and axe at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await db.user.update({ where: { id: f.teacher.id }, data: { name: "Synthetic lecturer with a deliberately long name for responsive resolution verification" } });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page); await board(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const candidate = page.getByRole("article", { name: "Candidate 1", exact: true });
  await candidate.getByText("Score and eligibility details", { exact: true }).focus(); await page.keyboard.press("Enter"); await expect(candidate).toContainText("Integer score");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`resolution-${width}.png`), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await candidate.getByRole("button", { name: "Select candidate", exact: true }).focus(); await page.keyboard.press("Enter"); await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible(); expect(errors).toEqual([]);
});
