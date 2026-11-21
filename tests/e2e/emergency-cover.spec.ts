import "dotenv/config";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "../../src/generated/prisma/client";
import { localDate } from "../../src/domain/scheduling/timetable";
import { emergencyFixture } from "../support/emergency-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const fixedTime = process.env.SLOTWISE_TEST_NOW;
test.skip(!fixedTime, "Run separately with SLOTWISE_TEST_NOW=2030-01-07T03:00:00.000Z for a synthetic local Monday at 08:30.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID();
let passwordHash: string;
let f: Awaited<ReturnType<typeof emergencyFixture>>;
test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => { f = await emergencyFixture(db, localDate(new Date(fixedTime!)), passwordHash); });
test.afterEach(async () => { await cleanupTimetable(db, f.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function launch(page: Page) {
  await login(page, f.coordinator.email);
  await page.goto(`/resolutions?leave=${f.leave.id}`);
  await page.getByRole("button", { name: "Launch emergency round" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Emergency offers sent in-app to 4 eligible substitutes." })).toBeVisible();
  return db.emergencyRound.findFirstOrThrow({ where: { departmentId: f.departmentId } });
}
const panel = (page: Page) => page.getByRole("region", { name: "Emergency cover" });
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test("two faculty tabs race and the coordinator reviews and publishes the exact winner", async ({ page, browser }, testInfo) => {
  const round = await launch(page);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const responders = await Promise.all(contexts.map(context => context.newPage()));
    await Promise.all(responders.map(async (tab, i) => {
      await login(tab, f.substitutes[i].user.email);
      await tab.goto("/notifications");
      await expect(tab.getByText(/Emergency cover offers/)).toBeVisible();
      await tab.getByRole("link", { name: "Open cover & exceptions" }).click();
      const accept = panel(tab).getByRole("button", { name: "Accept emergency offer" });
      await expect(accept).toBeVisible();
      await accept.focus();
    }));
    await Promise.all(responders.map(tab => tab.keyboard.press("Enter")));
    await expect.poll(async () => (await db.emergencyRound.findUniqueOrThrow({ where: { id: round.id } })).status).toBe("WON");
    const winnerId = (await db.emergencyRound.findUniqueOrThrow({ where: { id: round.id } })).winnerUserId;
    const winnerIndex = f.substitutes.findIndex(s => s.user.id === winnerId);
    const winner = responders[winnerIndex], loser = responders[1 - winnerIndex];
    await expect(panel(winner).getByText("Filled · Pending publication", { exact: true })).toBeVisible();
    await expect(panel(loser).getByText("Already filled", { exact: true })).toBeVisible();
    await expect(panel(loser).getByRole("status")).toHaveText("This emergency round is already filled.");
    await expect(panel(loser).getByRole("button", { name: "Accept emergency offer" })).toHaveCount(0);

    await winner.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1440]) {
      await winner.setViewportSize({ width, height: 900 });
      expect(await winner.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await winner.setViewportSize({ width: 390, height: 900 });
    const zoom = await winner.addStyleTag({ content: "html { zoom: 2 }" });
    expect(await winner.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await zoom.evaluate(style => style.parentNode?.removeChild(style));
    expect((await axe(winner)).violations).toEqual([]);
    await panel(winner).screenshot({ path: testInfo.outputPath("emergency-offer-mobile.png") });

    expect(await db.schedulePublication.count({ where: { departmentId: f.departmentId } })).toBe(0);
    await page.getByRole("link", { name: "Review rounds and offers" }).click();
    await expect(panel(page).getByText(/Accepted by Synthetic substitute/)).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    expect((await axe(page)).violations).toEqual([]);
    await panel(page).screenshot({ path: testInfo.outputPath("emergency-winner-desktop.png") });
    await panel(page).getByRole("link", { name: "Review in Class recovery" }).click();
    await page.getByRole("button", { name: "Check emergency winner" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    await page.getByRole("button", { name: "Preview selected changes" }).click();
    await expect(page.getByRole("heading", { name: "Before / After · Asia/Kolkata" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Publication blocked" })).toHaveCount(0);
    expect(await db.schedulePublication.count({ where: { departmentId: f.departmentId } })).toBe(0);
    await page.getByRole("button", { name: "Publish 1 changes", exact: true }).click();
    await expect(page.getByRole("link", { name: "View published timetable" })).toBeVisible();
    const replacement = await db.classOccurrence.findUniqueOrThrow({ where: { replacesId: round.occurrenceId } });
    expect(replacement.facultyId).toBe(f.substitutes[winnerIndex].faculty.id);
    expect(replacement.deliveryStatus).toBe("PENDING");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test("worker expiry surfaces a later-tier proposal and anonymous and student access is denied", async ({ page, browser }) => {
  await page.goto("/cover-requests");
  await expect(page).toHaveURL(/\/login$/);
  const context = await browser.newContext();
  try {
    const student = await context.newPage();
    await login(student, f.student.email);
    await student.goto("/cover-requests");
    await expect(student.getByRole("heading", { name: "Access denied" })).toBeVisible();
  } finally { await context.close(); }
  const round = await launch(page);
  await page.getByRole("link", { name: "Review rounds and offers" }).click();
  await expect(panel(page).getByText("Waiting for acceptance")).toBeVisible();
  const worker = await promisify(execFile)(process.execPath, ["--import", "./tests/support/emergency-clock.mjs", "--conditions=react-server", "--import", "tsx", "scripts/emergency-worker.ts", "--once"], {
    env: { ...process.env, DATABASE_URL: url, SLOTWISE_TEST_NOW: round.deadline.toISOString() },
  });
  expect(worker.stdout).toContain("Emergency rounds expired: 1");
  await panel(page).getByRole("button", { name: "Refresh emergency cover" }).click();
  await expect(panel(page).getByText("Proposed next tier · Weekday")).toBeVisible();
  expect(await db.schedulePublication.count({ where: { departmentId: f.departmentId } })).toBe(0);
  await panel(page).getByRole("link", { name: "Review in Class recovery" }).click();
  await page.getByRole("button", { name: "Check emergency fallback" }).click();
  await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText(/Emergency cover expired. Review the proposed tier 3/)).toBeVisible();
});
