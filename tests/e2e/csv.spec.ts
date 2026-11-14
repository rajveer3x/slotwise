import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { timetableFixture, cleanupTimetable } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID();
let passwordHash: string;
let fixture: Awaited<ReturnType<typeof timetableFixture>>;
test.beforeAll(async () => { passwordHash = await hash(password); });
test.beforeEach(async () => { fixture = await timetableFixture(db, passwordHash); });
test.afterEach(async () => { await cleanupTimetable(db, fixture.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page, email = fixture.coordinator.email) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const header = "sectionCode,courseCode,roomCode,weekday,startTime,endTime";
const rows = `${header}\nS1,CS101,R1,1,09:00,10:00\nS1,CS102,R1,1,10:00,11:00\n`;
async function upload(page: Page, csv: string) {
  await page.getByLabel("CSV file").setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
}

test("manager downloads a template, fixes row errors, refreshes stale review, commits a draft and exports published classes", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/timetable");
  await page.getByRole("link", { name: "CSV import and export" }).click();
  await expect(page.getByLabel("Import type")).toHaveValue("timetable");
  const template = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download weekly timetable draft template" }).click();
  expect((await template).suggestedFilename()).toBe("slotwise-timetable-template.csv");

  await upload(page, rows.replace("CS102", "UNKNOWN"));
  const preview = page.getByRole("button", { name: "Preview CSV" });
  const commit = page.getByRole("button", { name: "Commit import" });
  await preview.focus();
  await page.keyboard.press("Enter");
  const errors = page.getByRole("list", { name: "CSV row errors" });
  await expect(errors).toContainText("Row 3");
  await expect(errors).toContainText("courseCode");
  await expect(commit).toBeDisabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 930 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(errors).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1440) {
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`csv-row-errors-${width}.png`), fullPage: true });
    }
  }
  await page.addStyleTag({ content: "body { zoom: 2; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addStyleTag({ content: "body { zoom: 1; }" });

  await upload(page, rows);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/csv?semester=**", async route => {
    if (route.request().method() === "POST") await hold;
    await route.continue();
  });
  await preview.focus();
  await page.keyboard.press("Enter");
  try {
    await expect(page.getByRole("button", { name: "Checking CSV…" })).toBeDisabled();
    await expect(page.getByLabel("CSV file")).toBeDisabled();
  } finally { release(); }
  await expect(commit).toBeEnabled();
  await page.unroute("**/csv?semester=**");
  expect(await db.timetableVersion.count({ where: { departmentId: fixture.departmentId } })).toBe(0);

  await db.semester.update({ where: { id: fixture.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  await page.keyboard.press("Tab");
  await expect(commit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "department records changed" })).toBeVisible();
  await expect(commit).toBeDisabled();
  await expect(page.getByLabel("CSV file")).toHaveValue(/synthetic\.csv$/);

  await preview.click();
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 2 rows" })).toBeVisible();
  expect(await db.classOccurrence.count({ where: { departmentId: fixture.departmentId } })).toBe(0);
  await page.getByRole("link", { name: "Open draft in Timetable" }).click();
  await expect(page.getByRole("heading", { name: "Weekly draft · Version 1" })).toBeVisible();
  await page.getByRole("button", { name: "Preview publication" }).click();
  const publish = page.getByRole("button", { name: "Publish 6 classes" });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText(/Published schedule · Revision 2/)).toBeVisible();
  await page.getByRole("link", { name: "CSV import and export" }).click();
  const exported = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download timetable CSV" }).click();
  const download = await exported;
  expect(download.suggestedFilename()).toBe("slotwise-published-timetable.csv");
  const content = await readFile((await download.path())!, "utf8");
  expect(content).toContain('"2099-01-05","09:00","10:00","S1","CS101"');
  expect(content).not.toContain(fixture.teacher.email);
});

test("student and anonymous requests cannot access the CSV tools or download timetable data", async ({ page }) => {
  expect((await page.request.get(`/api/csv?semester=${fixture.semester.id}`)).status()).toBe(401);
  await login(page, fixture.student.email);
  await page.goto("/csv");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  expect((await page.request.get("/api/csv?template=room")).status()).toBe(403);
  expect((await page.request.get(`/api/csv?semester=${fixture.semester.id}`)).status()).toBe(403);
});
