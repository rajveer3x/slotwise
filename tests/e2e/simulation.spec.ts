import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import AxeBuilder from "@axe-core/playwright";
import { PrismaPg } from "@prisma/adapter-pg";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { simulationFixture } from "../support/simulation-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID();
let fixture: Awaited<ReturnType<typeof simulationFixture>>;

test.beforeEach(async () => { fixture = await simulationFixture(db, await hash(password)); });
test.afterEach(async () => { await cleanupTimetable(db, fixture.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("compare a lab closure, inspect workload, check staleness and recompute", async ({ page }, testInfo) => {
  await signIn(page, fixture.coordinator.email);
  await page.getByRole("link", { name: "What-if simulation" }).press("Enter");
  await expect(page.getByRole("heading", { name: "What-if simulation" })).toBeVisible();
  const room = page.getByLabel("Room", { exact: true });
  await room.selectOption(fixture.room2.id);
  await page.getByLabel("End date").fill("2099-01-19");

  let reached!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { reached = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/simulation", async route => {
    if (route.request().method() !== "POST") return route.continue();
    reached();
    await hold;
    await route.abort();
  });
  const run = page.getByRole("button", { name: "Run simulation" });
  await run.press("Enter");
  await started;
  try { await expect(page.getByRole("button", { name: "Simulating…" })).toBeDisabled(); }
  finally { release(); }
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Could not run the simulation. Try again.");
  await expect(room).toHaveValue(fixture.room2.id);
  await expect(page.getByLabel("End date")).toHaveValue("2099-01-19");
  await page.unroute("**/simulation");
  await run.press("Enter");

  const results = page.getByRole("region", { name: "Simulation results" });
  await expect(results.getByText("4 affected", { exact: true })).toBeVisible();
  await expect(results.getByText("3 with a possible recovery", { exact: true })).toBeVisible();
  await expect(results.getByText("1 unresolved", { exact: true })).toBeVisible();
  await expect(results.getByText(/Revision 1$/)).toBeVisible();
  const policy = results.getByText("Baseline policy values");
  await policy.press("Enter");
  await expect(results.getByText(/demo-v1.*14 calendar days/)).toBeVisible();
  const unresolved = results.getByRole("article").filter({ has: page.getByRole("heading", { name: "Unresolved", exact: true }) });
  await unresolved.getByText("Why other options were ruled out").press("Enter");
  await expect(unresolved.getByText("Room closed in this simulation")).toBeVisible();
  await expect(results.getByRole("table")).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  const withinViewport = () => results.evaluate(node => {
    const workload = node.querySelector('[aria-labelledby="simulation-workload"][role="region"]')!;
    return [node, workload, ...node.querySelectorAll("article")].every(element => {
      const { left, right } = element.getBoundingClientRect();
      return left >= 0 && right <= window.innerWidth;
    });
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await withinViewport()).toBe(true);
  }
  const scan = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect((await scan()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("simulation-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  const zoom = await page.addStyleTag({ content: "html { zoom: 2 }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await withinViewport()).toBe(true);
  await zoom.evaluate(style => style.parentNode?.removeChild(style));
  expect((await scan()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("simulation-mobile.png"), fullPage: true });

  const check = page.getByRole("button", { name: "Check baseline" });
  await check.press("Enter");
  await expect(page.getByRole("main").getByRole("status")).toContainText("Baseline matched the current schedule and policy");
  await db.semester.update({ where: { id: fixture.semester.id }, data: { scheduleRevision: { increment: 1 } } });
  await check.press("Enter");
  await expect(page.getByRole("main").getByRole("status")).toContainText("Stale simulation.");
  await expect(results.getByText(/Revision 1$/)).toBeVisible();
  await page.getByRole("button", { name: "Recompute this scenario" }).press("Enter");
  await expect(results.getByText(/Revision 2$/)).toBeVisible();
  await expect(page.getByText("Stale simulation.", { exact: false })).toHaveCount(0);
  await expect(room).toHaveValue(fixture.room2.id);
  expect(await db.resourceReservation.count({ where: { departmentId: fixture.departmentId } })).toBe(18);
});

test("direct navigation denies anonymous and student access", async ({ page }) => {
  await page.goto("/simulation");
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, fixture.student.email);
  await page.goto("/simulation");
  await expect(page.getByRole("heading", { name: "Simulation unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run simulation" })).toHaveCount(0);
});
