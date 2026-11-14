import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { timetableFixture, cleanupTimetable } from "../support/timetable-fixture";
const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID(); let passwordHash: string;
let f: Awaited<ReturnType<typeof timetableFixture>>;
test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => { f = await timetableFixture(db, passwordHash); });
test.afterEach(async () => { await cleanupTimetable(db, f.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });
async function login(page: Page, email = f.coordinator.email) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
}
async function create(page: Page) {
  await page.goto("/timetable"); await page.getByRole("button", { name: "Create draft", exact: true }).click(); await expect(page.getByRole("heading", { name: "Weekly draft · Version 1" })).toBeVisible();
}
async function place(page: Page, index: number, start = 540 + index * 60, end = 600 + index * 60) {
  const form = page.getByRole("region", { name: "Move class / Place class", exact: true });
  await form.getByLabel("Allocation", { exact: true }).selectOption(f.allocations[index].id); await form.getByLabel("Start slot").selectOption(String(start)); await form.getByLabel("End slot").selectOption(String(end)); await form.getByLabel("Room", { exact: true }).selectOption(f.room.id); await form.getByRole("button", { name: "Place class", exact: true }).click();
}
async function storedDraft() {
  const draft = await db.timetableVersion.create({ data: { departmentId: f.departmentId, semesterId: f.semester.id, effectiveFrom: "2099-01-05", effectiveTo: "2099-01-30", baseScheduleRevision: 0 } });
  await db.timetableEntry.createMany({ data: f.entries.map(e => ({ ...e, departmentId: f.departmentId, timetableVersionId: draft.id })) });
  return draft;
}
test("manual placement rejects overlap, applies a suggested repair, previews and publishes once, then students see only their section", async ({ page }, testInfo) => {
  await login(page); await create(page);
  await page.getByRole("button", { name: "Preview publication", exact: true }).click(); await expect(page.getByRole("region", { name: "Conflict explanations" })).toContainText("Place classes before publishing");
  await place(page, 0); await expect(page.getByRole("heading", { name: "Weekly draft · Version 2" })).toBeVisible();
  await place(page, 1, 540, 600);
  const conflicts = page.getByRole("region", { name: "Conflict explanations" }); await expect(conflicts).toContainText("Teacher"); await expect(conflicts).toContainText("Section S1"); await expect(conflicts).toContainText("Room R1");
  await expect(page.getByLabel("Start slot")).toHaveValue("540");
  await page.getByRole("button", { name: /^Use Monday 10:00–11:00/ }).first().click(); await expect(page.getByRole("heading", { name: "Weekly draft · Version 3" })).toBeVisible();
  await page.reload(); await expect(page.locator(".timetable-desktop article")).toHaveCount(2);
  await page.getByRole("button", { name: "Preview publication", exact: true }).click();
  const preview = page.getByRole("region", { name: "Publication preview" }); await expect(preview).toContainText("Review 6 dated classes"); await expect(preview).toContainText("5 in-app recipients"); await expect(preview).not.toContainText("2099-01-12 09:00");
  expect(await db.resourceReservation.count({ where: { departmentId: f.departmentId } })).toBe(0);
  await preview.getByRole("button", { name: "Publish 6 classes", exact: true }).click(); await expect(page).toHaveURL(/week=2099-01-05/); await expect(page.getByText(/Published schedule · Revision 1/)).toBeVisible();
  expect(await db.classOccurrence.count({ where: { departmentId: f.departmentId } })).toBe(6);
  await page.setViewportSize({ width: 390, height: 1000 }); await expect(page.getByRole("region", { name: "Published weekly agenda", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("published-agenda-390.png"), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login/); await login(page, f.student.email); await page.goto(`/timetable?week=2099-01-05`); await expect(page.locator(".timetable-desktop")).toContainText("CS101"); await expect(page.getByRole("button", { name: "Create draft", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/login/); await login(page, f.outsider.email); await page.goto(`/timetable?week=2099-01-05`); await expect(page.getByText(/No published classes match/)).toBeVisible(); await expect(page.getByText(/CS101/)).toHaveCount(0);
});
test("drag move persists and conflicting drop leaves the saved class in place", async ({ page }) => {
  const draft = await storedDraft(); await login(page); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(`/timetable?draft=${draft.id}`);
  const block = page.locator(".timetable-desktop article").filter({ hasText: "CS101" });
  await block.dragTo(page.locator('[data-drop="2-540"]'));
  await expect(page.getByRole("heading", { name: "Weekly draft · Version 2" })).toBeVisible();
  expect((await db.timetableEntry.findFirstOrThrow({ where: { timetableVersionId: draft.id, allocationId: f.allocations[0].id } })).weekday).toBe(2);
  const conflictSlot = page.locator('[data-drop="1-600"]');
  // Position the taller card and destination before pressing the mouse;
  // scrolling the page mid native drag can cancel the browser's drag session.
  await conflictSlot.scrollIntoViewIfNeeded();
  await expect(block).toHaveAttribute("draggable", "true"); await block.dragTo(conflictSlot, { sourcePosition: { x: 12, y: 12 }, targetPosition: { x: 8, y: 8 } });
  await expect(page.getByRole("region", { name: "Conflict explanations" })).toContainText("overlaps");
  await expect(page.locator('[data-drop="2-540"]')).toContainText("CS101");
});
test("keyboard move shows pending once, preserves stale input and rejects revoked role on the server", async ({ page }) => {
  const draft = await storedDraft(); await login(page); await page.goto(`/timetable?draft=${draft.id}`);
  const form = page.getByRole("region", { name: "Move class / Place class", exact: true });
  await form.getByLabel("Class to move").focus(); await page.keyboard.press("c"); await expect(form.getByLabel("Class to move")).not.toHaveValue(""); await page.keyboard.press("Tab");
  await expect(form.getByLabel("Day", { exact: true })).toBeFocused(); await page.keyboard.press("t"); await page.keyboard.press("Tab"); await page.keyboard.press("0"); await page.keyboard.press("Tab"); await page.keyboard.press("1"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await expect(form.getByRole("button", { name: "Move class", exact: true })).toBeFocused();
  let release!: () => void, started!: () => void; const hold = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { started = r; }); let requests = 0;
  await page.route("**/timetable**", async route => { if (route.request().method() === "POST") { requests++; started(); await hold; } await route.continue(); });
  await page.keyboard.press("Enter"); await ready;
  try { await expect(form.getByRole("button", { name: "Working…", exact: true })).toBeDisabled(); } finally { release(); }
  await expect(page.getByRole("heading", { name: "Weekly draft · Version 2" })).toBeVisible(); expect(requests).toBe(1); await page.unroute("**/timetable**");
  await form.getByLabel("Day", { exact: true }).selectOption("3"); await form.getByLabel("Start slot").selectOption("540"); await form.getByLabel("End slot").selectOption("600");
  await db.timetableVersion.update({ where: { id: draft.id }, data: { version: { increment: 1 } } });
  await form.getByRole("button", { name: "Move class", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "draft changed" })).toBeVisible(); await expect(form.getByLabel("Day", { exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "Refresh page", exact: true }).click(); await expect(page.getByRole("heading", { name: "Weekly draft · Version 3" })).toBeVisible();
  await db.user.update({ where: { id: f.coordinator.id }, data: { role: "STUDENT" } }); await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "do not have permission" })).toBeVisible();
});
for (const width of [320, 390, 768, 1440]) test(`timetable agenda/grid, keyboard controls and preview reflow at ${width}px`, async ({ page }, testInfo) => {
  // Fill the teacher's configured daily cap with four classes and long labels.
  await db.courseAllocation.updateMany({ where: { departmentId: f.departmentId }, data: { weeklyPeriods: 2 } });
  f.entries.push({ ...f.entries[0], seriesId: randomUUID(), startMinute: 660, endMinute: 720 }, { ...f.entries[1], seriesId: randomUUID(), startMinute: 780, endMinute: 840 });
  const draft = await storedDraft(); await login(page); await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/timetable?draft=${draft.id}`); await expect(page.getByRole("heading", { name: "Weekly draft · Version 1" })).toBeVisible();
  if (width < 768) { await expect(page.getByRole("region", { name: "Weekly draft agenda", exact: true })).toBeVisible(); await expect(page.locator(".timetable-desktop")).toBeHidden(); }
  else await expect(page.locator(".timetable-desktop")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`timetable-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Preview publication", exact: true }).click(); await expect(page.getByRole("region", { name: "Publication preview" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`preview-${width}.png`), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

test("review and open a generated timetable, then use the existing publication preview", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/timetable");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const panel = page.getByRole("region", { name: "Generate a weekly timetable" });
  const seed = panel.getByLabel("Search seed");
  await seed.fill("42");
  await seed.press("Enter");
  await expect(panel.getByRole("heading", { name: "All weekly periods placed" })).toBeVisible();
  const disclosure = panel.getByText("Review 2 proposed weekly placements", { exact: true });
  await disclosure.press("Enter");
  await expect(panel.getByText(/CS101 · S1 ·/)).toBeVisible();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(panel.getByRole("button", { name: "Open as draft" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("html").evaluate(el => { el.style.zoom = "2"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("html").evaluate(el => { el.style.zoom = ""; });
    if (width === 390 || width === 1440) {
      await panel.screenshot({ path: testInfo.outputPath(`generation-${width}.png`) });
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    }
  }
  expect(await db.timetableVersion.count({ where: { departmentId: f.departmentId } })).toBe(0);
  await panel.getByRole("button", { name: "Open as draft" }).press("Enter");
  await expect(page).toHaveURL(/draft=/);
  await expect(page.getByRole("heading", { name: "Weekly draft · Version 1" })).toBeVisible();
  expect(await db.resourceReservation.count({ where: { departmentId: f.departmentId } })).toBe(0);
  await page.getByRole("button", { name: "Preview publication" }).press("Enter");
  await expect(page.getByRole("region", { name: "Publication preview" })).toContainText("dated classes");
});

test("generator handles cancellation, partial coverage, stale review and direct role denial", async ({ page }) => {
  const endpoint = "**/api/timetable/generate";
  await db.facultyQualification.updateMany({
    where: { departmentId: f.departmentId, courseId: f.allocations[1].courseId }, data: { archived: true },
  });
  await login(page);
  await page.goto("/timetable");
  const panel = page.getByRole("region", { name: "Generate a weekly timetable" });
  const generate = panel.getByRole("button", { name: "Generate proposal" });
  let release!: () => void, started!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { started = resolve; });
  await page.route(endpoint, async route => {
    started();
    await hold;
    await route.abort().catch(() => {});
  }, { times: 1 });
  await generate.press("Enter");
  await intercepted;
  try {
    await expect(generate).toBeDisabled();
    await panel.getByRole("button", { name: "Cancel search" }).press("Enter");
    await expect(panel.getByRole("status")).toContainText("Search cancelled");
    await expect(panel.getByRole("button", { name: "Open as draft" })).toHaveCount(0);
  } finally {
    release();
  }

  await generate.press("Enter");
  await expect(panel.getByRole("heading", { name: "Partial proposal" })).toBeVisible();
  await expect(panel.getByText(/CS102 · S1 · 0 of 1 periods placed/)).toBeVisible();
  await db.semester.update({ where: { id: f.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  const open = panel.getByRole("button", { name: "Open as draft" });
  await open.press("Enter");
  await expect(panel.getByRole("status")).toContainText("Refresh the semester and generate again");
  await expect(open).toBeDisabled();
  await panel.getByRole("button", { name: "Refresh semester" }).press("Enter");
  await expect(page.getByText(/Published schedule · Revision 1/)).toBeVisible();
  await generate.press("Enter");
  await expect(panel.getByRole("heading", { name: "Partial proposal" })).toBeVisible();
  await open.press("Enter");
  await expect(page.getByRole("heading", { name: "Weekly draft · Version 1" })).toBeVisible();
  await page.getByRole("button", { name: "Preview publication" }).press("Enter");
  await expect(page.getByRole("region", { name: "Conflict explanations" })).toContainText("0 of 1");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, f.student.email);
  await page.goto("/timetable");
  await expect(panel).toHaveCount(0);
  const response = await page.evaluate(({ semesterId, effectiveFrom }) => fetch("/api/timetable/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ semesterId, effectiveFrom, expectedRevision: 1, seed: 42 }),
  }).then(r => r.status), { semesterId: f.semester.id, effectiveFrom: f.semester.startDate });
  expect(response).toBe(403);
});
