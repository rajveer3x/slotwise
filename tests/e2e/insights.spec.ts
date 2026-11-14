import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { insightsFixture } from "../support/insights-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";
import { addDays } from "../../src/domain/scheduling/timetable";

const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID();
let passwordHash: string;
let f: Awaited<ReturnType<typeof insightsFixture>>;
test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => { f = await insightsFixture(db, passwordHash); });
test.afterEach(async () => { await cleanupTimetable(db, f.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page, email = f.hod.email) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("keyboard period filters, validation, calculation help and empty states", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Leave Recovery Report" })).toBeVisible();
  await expect(page.getByText("2 of 5 affected")).toBeVisible();
  await page.getByLabel("Start date").fill(f.friday);
  await page.getByLabel("End date").fill(f.monday);
  await page.getByRole("button", { name: "Apply dates" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").getByText("Choose valid dates", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Start date")).toHaveValue(f.friday);
  await page.getByLabel("End date").fill(f.friday);
  await page.getByRole("button", { name: "Apply dates" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("1 of 3 affected")).toBeVisible();
  await page.getByText("How recovery is calculated").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Both dates are inclusive", { exact: false })).toBeVisible();
  await page.getByLabel("Start date").fill(f.followingMonday);
  await page.getByLabel("End date").fill(f.followingMonday);
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page.getByText("No obligations were affected", { exact: false })).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await page.goto(`/workload?week=${addDays(f.monday, -1)}`);
  await expect(page.getByText("No planned or delivered classes", { exact: false })).toBeVisible();
});

test("personal insights omit other faculty and deny direct department and report URLs", async ({ page }) => {
  await login(page, f.coverTeacher.email);
  await page.goto(`/workload?week=${f.monday}`);
  await expect(page.getByRole("heading", { name: "My teaching workload" })).toBeVisible();
  await expect(page.getByRole("rowheader")).toHaveText([f.coverTeacher.name]);
  await expect(page.getByRole("row").filter({ hasText: f.coverTeacher.name }).getByRole("cell")).toHaveText(["60", "60", "120", "50% · Under target", "1"]);
  await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
  for (const url of ["/reports", "/workload?department=another-department"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, f.student.email);
  for (const url of ["/workload", "/reports"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  }
});

for (const width of [320, 390, 768, 1440]) test(`insights chart and tables agree and reflow at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await login(page);

  await page.goto(`/workload?week=${f.monday}`);
  await expect(page.getByText("Synthetic demo data", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: f.coverTeacher.name }).getByRole("cell")).toHaveText(["60", "60", "120", "50% · Under target", "1"]);
  const coverChart = page.locator(".insight-chart-card").filter({ hasText: f.coverTeacher.name });
  await expect(coverChart.locator(".insight-bar-row")).toHaveText(["Planned60 min", "Delivered60 min", "Target120 min"]);
  await expect(coverChart.locator(".insight-bar-planned")).toHaveAttribute("style", "width:8.333333333333332%");
  const tableRegion = page.getByRole("region", { name: "Faculty workload table" });
  if (await tableRegion.evaluate(element => element.scrollWidth > element.clientWidth)) {
    await tableRegion.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => tableRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await tableRegion.evaluate(element => { element.scrollLeft = 0; });
  }
  await checkLayout(page);
  await page.screenshot({ path: testInfo.outputPath(`workload-${width}.png`), fullPage: true });

  await page.goto(`/reports?from=${f.monday}&to=${f.friday}`);
  await expect(page.getByText("40%", { exact: true })).toBeVisible();
  await expect(page.getByText("2 of 5 affected")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Published weekday" }).getByRole("cell")).toHaveText(["2", "1"]);
  await expect(page.getByRole("row").filter({ hasText: "Published Saturday" }).getByRole("cell")).toHaveText(["1", "0"]);
  await expect(page.getByRole("row").filter({ hasText: "Unresolved" }).getByRole("cell")).toHaveText(["2", "0"]);
  const weekdayChart = page.locator(".insight-chart-card").filter({ hasText: "Weekday" });
  await expect(weekdayChart.locator(".insight-bar-row")).toHaveText(["Published2", "Delivered1"]);
  await expect(weekdayChart.locator(".insight-bar-planned")).toHaveAttribute("style", "width:40%");
  await checkLayout(page);
  await page.screenshot({ path: testInfo.outputPath(`reports-${width}.png`), fullPage: true });
  expect(pageErrors).toEqual([]);
});

async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });
}
