import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanupTimetable } from "../support/timetable-fixture";
import { deliveryFixture } from "../support/delivery-fixture";
const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID(); let passwordHash: string;
let f: Awaited<ReturnType<typeof deliveryFixture>>;
test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => { f = await deliveryFixture(db, passwordHash); });
test.afterEach(async () => { await cleanupTimetable(db, f.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });
async function login(page: Page, email = f.coordinator.email) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
}
async function open(page: Page) { await page.goto(`/delivery?semester=${f.semester.id}`); await expect(page.getByRole("heading", { name: "Class delivery", exact: true }).first()).toBeVisible(); }
function form(page: Page) { return page.getByRole("form", { name: /Delivery for CS101/ }); }
async function confirm(page: Page, status = "HELD") { await form(page).getByLabel("Delivery outcome").selectOption(status); await form(page).getByRole("button", { name: "Confirm delivery", exact: true }).click(); }
async function seedHeld() {
  const record = await db.deliveryRecord.create({ data: { departmentId: f.departmentId, obligationId: f.obligationId, occurrenceId: f.pastId, confirmedById: f.teacher.id, status: "HELD", confirmedMinutes: 60 } });
  await db.classOccurrence.update({ where: { id: f.pastId }, data: { deliveryStatus: "HELD" } }); return record;
}
function ledgerRow(page: Page) { return page.getByRole("row").filter({ hasText: "CS101" }); }
test("assigned faculty confirms held using keyboard; coordinator ledger shows 60 earned and future coverage earns none", async ({ page }) => {
  await login(page, f.teacher.email); await open(page); await expect(form(page)).toBeVisible();
  await form(page).getByRole("button", { name: "Confirm delivery" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Held recorded." }).first()).toBeVisible();
  await expect(page.getByText("Delivery recorded. Ask your coordinator", { exact: false })).toBeVisible();
  await page.getByText("Delivery history (1)").click(); await expect(page.getByText("Held · 60 min · Current")).toBeVisible();
  expect(await db.deliveryRecord.count({ where: { obligationId: f.obligationId, current: true, status: "HELD" } })).toBe(1);
  await page.goto("/classes-owed"); await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page); await page.goto("/classes-owed");
  await expect(ledgerRow(page).getByRole("cell")).toHaveText(["240 min", "60 min", "60 min", "180 min", "0 min"]);
});
test("coordinator can confirm an ended class with an audit reason", async ({ page }) => {
  await login(page); await open(page);
  await form(page).getByLabel("Confirmation reason (required)").fill("Synthetic coordinator verified delivery");
  await confirm(page); await expect(page.getByRole("status").filter({ hasText: "Held recorded." }).first()).toBeVisible();
  const record = await db.deliveryRecord.findFirstOrThrow({ where: { occurrenceId: f.pastId, current: true } }); expect(record.reason).toBe("Synthetic coordinator verified delivery");
});
test("coordinator reasoned correction reverses credit and exposes history and ordinary recovery", async ({ page }) => {
  await seedHeld(); await login(page); await open(page);
  await form(page).getByLabel("Correction reason (required)").fill("Synthetic review: the session was not held");
  await form(page).getByRole("button", { name: "Save correction" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Not held recorded." }).first()).toBeVisible();
  await page.getByText("Delivery history (2)").click(); await expect(page.getByText("Held · 60 min · Replaced by correction")).toBeVisible(); await expect(page.getByText("Not held · 0 min · Current")).toBeVisible();
  await page.getByRole("link", { name: "Arrange recovery for this obligation" }).click();
  await expect(page.getByRole("heading", { name: "Resolution board", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Not-held recovery" })).toContainText("CS101");
  await page.getByRole("article", { name: "Candidate 1", exact: true }).getByRole("button", { name: "Select candidate", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  const review = page.getByRole("region", { name: "Preview and publish", exact: true });
  await review.getByRole("button", { name: "Preview selected changes" }).click(); await expect(review.getByRole("heading", { name: "Before / After · Asia/Kolkata" })).toBeVisible();
  await review.getByRole("button", { name: "Publish 1 changes" }).click(); await expect(review.getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
  const plan = await db.resolutionPlan.findFirstOrThrow({ where: { sourceOccurrenceId: f.pastId } }); expect(plan.leaveRequestId).toBeNull();
  expect(await db.teachingObligation.count({ where: { id: f.obligationId } })).toBe(1);
  await page.goto("/classes-owed"); await expect(ledgerRow(page).getByRole("cell")).toHaveText(["240 min", "0 min", "120 min", "240 min", "60 min"]);
});
test("network error retains outcome, pending disables duplicate input and retry commits once", async ({ page }) => {
  await login(page, f.teacher.email); await open(page);
  await page.route("**/delivery**", async route => { if (route.request().method() === "POST") await route.abort(); else await route.continue(); });
  await confirm(page, "NOT_HELD"); await expect(form(page).getByRole("status")).toContainText("Could not reach the server"); await expect(form(page).getByLabel("Delivery outcome")).toHaveValue("NOT_HELD"); await page.unroute("**/delivery**");
  let release!: () => void, started!: () => void; const hold = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { started = r; });
  await page.route("**/delivery**", async route => { if (route.request().method() === "POST") { started(); await hold; } await route.continue(); });
  await form(page).getByRole("button", { name: "Confirm delivery" }).click(); await ready;
  try { await expect(form(page).getByRole("button", { name: "Saving…" })).toBeDisabled(); await expect(form(page).getByLabel("Delivery outcome")).toBeDisabled(); } finally { release(); }
  await expect(page.getByRole("status").filter({ hasText: "Not held recorded." }).first()).toBeVisible(); await page.unroute("**/delivery**");
  expect(await db.deliveryRecord.count({ where: { occurrenceId: f.pastId } })).toBe(1);
});
test("stale correction requires refreshing and reviewing the latest record while retaining the reason", async ({ page }) => {
  const old = await seedHeld(); await login(page); await open(page); const reason = "Synthetic reason retained across stale refresh";
  await form(page).getByLabel("Correction reason (required)").fill(reason);
  await db.$transaction(async tx => {
    await tx.deliveryRecord.update({ where: { id: old.id }, data: { current: false, supersededAt: new Date() } });
    await tx.deliveryRecord.create({ data: { departmentId: f.departmentId, obligationId: f.obligationId, occurrenceId: f.pastId, confirmedById: f.coordinator.id, status: "NOT_HELD", confirmedMinutes: 0, reason: "Synthetic concurrent correction" } });
    await tx.classOccurrence.update({ where: { id: f.pastId }, data: { deliveryStatus: "NOT_HELD", schedulingStatus: "CANCELLED" } });
    await tx.resourceReservation.deleteMany({ where: { occurrenceId: f.pastId } });
  });
  await form(page).getByRole("button", { name: "Save correction" }).click(); await expect(form(page).getByRole("status")).toContainText("Delivery changed.");
  await page.getByRole("button", { name: "Refresh current status", exact: true }).click();
  await expect(form(page).getByLabel("Correction reason (required)")).toHaveValue(reason);
  await expect(form(page).getByRole("button", { name: "Save correction" })).toBeDisabled();
  await form(page).getByRole("button", { name: "Use refreshed record" }).click();
  await form(page).getByLabel("Corrected outcome").selectOption("HELD"); await form(page).getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Held recorded." }).first()).toBeVisible();
});
test("student routes deny access, HoD/admin read ledger without coordinator delivery authority, and empty semesters explain next step", async ({ page }) => {
  await login(page, f.student.email); await page.goto("/delivery"); await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await page.goto("/classes-owed"); await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  for (const email of [f.hod.email, f.admin.email]) {
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await login(page, email); await page.goto("/classes-owed"); await expect(page.getByRole("heading", { name: "Contact-minutes ledger" })).toBeVisible();
    await open(page); await expect(page.getByText("No assigned classes in this semester.", { exact: false })).toBeVisible();
  }
  const empty = await db.semester.create({ data: { departmentId: f.departmentId, code: "EMPTY", name: "Synthetic empty semester", startDate: "2099-02-01", endDate: "2099-02-28" } });
  await page.goto(`/classes-owed?semester=${empty.id}`); await expect(page.getByText("No course allocations in this semester.", { exact: false })).toBeVisible();
});
for (const width of [320, 390, 768, 1440]) test(`delivery and ledger reflow at ${width}px with keyboard, reduced motion, zoom and axe`, async ({ page }, testInfo) => {
  await seedHeld(); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page); await open(page);
  await page.getByText("Delivery history (1)").focus(); await page.keyboard.press("Enter"); await expect(page.getByText("Held · 60 min · Current")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`delivery-${width}.png`), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/classes-owed"); await expect(page.getByRole("heading", { name: "Contact-minutes ledger" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect((await page.getByRole("columnheader", { name: "Required", exact: true }).boundingBox())!.height).toBeLessThan(60);
  const tableRegion = page.getByRole("region", { name: "Course and section ledger" });
  if (await tableRegion.evaluate(e => e.scrollWidth > e.clientWidth)) {
    await tableRegion.focus(); await page.keyboard.press("ArrowRight");
    await expect.poll(() => tableRegion.evaluate(e => e.scrollLeft)).toBeGreaterThan(0);
  }
  await page.screenshot({ path: testInfo.outputPath(`ledger-${width}.png`), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});
