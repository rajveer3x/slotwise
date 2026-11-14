import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import AxeBuilder from "@axe-core/playwright";
import { PrismaPg } from "@prisma/adapter-pg";
import { test, expect, type Page } from "@playwright/test";
import ICAL from "ical.js";
import { PrismaClient } from "../../src/generated/prisma/client";
import { resolutionFixture } from "../support/resolution-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID();
let fixture: Awaited<ReturnType<typeof resolutionFixture>>;

test.use({ trace: "off" });

test.beforeEach(async () => { fixture = await resolutionFixture(db, await hash(password)); });
test.afterEach(async () => { await cleanupTimetable(db, fixture.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const scan = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const eventsIn = (body: string) => new ICAL.Component(ICAL.parse(body)).getAllSubcomponents("vevent").map(e => new ICAL.Event(e));

test("create and copy a private link, publish an update, then rotate and revoke", async ({ page, browser, request }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"] });
  try {
    const student = await context.newPage();
    await signIn(student, fixture.student.email);
    const menu = student.getByRole("button", { name: "Menu", exact: true });
    await expect(async () => {
      if ((await menu.getAttribute("aria-expanded")) === "false") await menu.press("Enter");
      await expect(menu).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
    }).toPass({ timeout: 5000 });
    await student.getByRole("dialog").getByRole("link", { name: "Calendar feeds" }).press("Enter");
    await expect(student.getByRole("heading", { name: "Calendar feeds" })).toBeVisible();
    await expect(student.getByText("No active subscription", { exact: true })).toBeVisible();
    const create = student.getByRole("button", { name: "Create subscription" });
    await expect(create).toBeEnabled();
    await create.press("Enter");
    await expect(student.getByText("Subscription created.", { exact: true })).toBeVisible();
    const urlField = student.getByLabel("Private subscription URL");
    const originalLink = await urlField.inputValue();
    await student.getByRole("button", { name: "Copy subscription URL" }).press("Enter");
    await expect(student.getByText("Subscription URL copied.", { exact: true })).toBeVisible();
    expect(await student.evaluate(async link => (await navigator.clipboard.readText()) === link, originalLink)).toBe(true);

    const before = await request.get(originalLink);
    expect(before.status()).toBe(200);
    expect(before.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(before.headers()["cache-control"]).toBe("private, no-store");
    expect(before.headers()["referrer-policy"]).toBe("no-referrer");
    const beforeEvents = eventsIn(await before.text());
    const cancelled = beforeEvents.filter(e => e.component.getFirstPropertyValue("status") === "CANCELLED");
    expect(cancelled).toHaveLength(2);

    for (const width of [320, 390, 768, 1440]) {
      await student.setViewportSize({ width, height: 900 });
      expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await student.setViewportSize({ width: 390, height: 900 });
    const zoom = await student.addStyleTag({ content: "html { zoom: 2 }" });
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await zoom.evaluate(node => node.parentNode?.removeChild(node));
    expect((await scan(student)).violations).toEqual([]);
    await student.screenshot({ path: testInfo.outputPath("calendar-mobile.png"), mask: [urlField], fullPage: true });

    await student.reload();
    await expect(student.getByText("Subscription active", { exact: true })).toBeVisible();
    await expect(urlField).toHaveCount(0);
    await student.setViewportSize({ width: 1440, height: 900 });
    expect((await scan(student)).violations).toEqual([]);
    await student.screenshot({ path: testInfo.outputPath("calendar-desktop.png"), fullPage: true });

    await signIn(page, fixture.coordinator.email);
    await page.goto("/calendar-feeds");
    await expect(page.getByText("Your account has no teaching profile or student section eligible for a feed.")).toBeVisible();
    await page.goto(`/resolutions?leave=${fixture.leaveId}`);
    await page.getByRole("article", { name: "Candidate 1", exact: true }).getByRole("button", { name: "Select candidate" }).press("Enter");
    await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible();
    const save = page.getByRole("button", { name: "Save draft", exact: true });
    await expect(save).toBeEnabled();
    await save.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    const review = page.getByRole("region", { name: "Preview and publish" });
    const preview = review.getByRole("button", { name: "Preview selected changes" });
    await expect(preview).toBeEnabled();
    await preview.press("Enter");
    const publish = review.getByRole("button", { name: "Publish 1 changes" });
    await expect(publish).toBeEnabled();
    await publish.press("Enter");
    await expect(review.getByText("Published 1 changes.", { exact: false })).toBeVisible();

    const updated = eventsIn(await (await request.get(originalLink)).text());
    expect(updated.map(e => e.uid).sort()).toEqual(beforeEvents.map(e => e.uid).sort());
    const moved = updated.find(e => cancelled.some(old => old.uid === e.uid) && e.component.getFirstPropertyValue("status") === "CONFIRMED")!;
    expect(moved).toBeDefined();
    const old = cancelled.find(e => e.uid === moved.uid)!;
    expect(moved.startDate.toString()).not.toBe(old.startDate.toString());
    expect(moved.sequence).toBeGreaterThan(old.sequence);

    await student.getByRole("button", { name: "Rotate link" }).press("Enter");
    const confirmRotation = student.getByRole("button", { name: "Confirm rotation" });
    await expect(confirmRotation).toBeFocused();
    await student.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
    await expect(student.getByRole("button", { name: "Rotate link" })).toBeFocused();
    await student.keyboard.press("Enter");
    await expect(confirmRotation).toBeFocused();
    await student.keyboard.press("Enter");
    await expect(student.getByText("Link rotated. The previous link was revoked.")).toBeVisible();
    const rotatedLink = await urlField.inputValue();
    expect(rotatedLink === originalLink).toBe(false);
    expect((await request.get(originalLink)).status()).toBe(404);
    expect((await request.get(rotatedLink)).status()).toBe(200);
    await student.getByRole("button", { name: "Revoke link" }).press("Enter");
    await student.getByRole("button", { name: "Confirm revocation" }).press("Enter");
    await expect(student.getByText("Subscription revoked.", { exact: true })).toBeVisible();
    await expect(urlField).toHaveCount(0);
    expect((await request.get(rotatedLink)).status()).toBe(404);
  } finally { await context.close(); }
});

test("pending and stale changes recover after refresh, and membership loss disables the URL", async ({ page, request }) => {
  await signIn(page, fixture.student.email);
  await page.goto("/calendar-feeds");
  const create = page.getByRole("button", { name: "Create subscription" });
  let reached!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { reached = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/calendar-feeds", async route => {
    if (route.request().method() !== "POST") return route.continue();
    reached();
    await hold;
    await route.abort();
  });
  await create.press("Enter");
  await started;
  try { await expect(page.getByRole("button", { name: "Creating…" })).toBeDisabled(); }
  finally { release(); }
  await expect(page.getByRole("alert").filter({ hasText: "Could not confirm the change." })).toBeVisible();
  await page.unroute("**/calendar-feeds");
  await page.getByRole("button", { name: "Refresh subscription" }).press("Enter");
  await expect(create).toBeEnabled();
  await create.press("Enter");
  const field = page.getByLabel("Private subscription URL");
  await expect(field).toBeVisible();
  const link = await field.inputValue();
  await db.sectionMembership.updateMany({ where: { userId: fixture.student.id }, data: { archived: true } });
  expect((await request.get(link)).status()).toBe(404);
  await page.getByRole("button", { name: "Rotate link" }).press("Enter");
  await page.getByRole("button", { name: "Confirm rotation" }).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "This calendar scope is unavailable to your account." })).toBeVisible();
    await expect(field).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh subscription" }).press("Enter");
  await expect(page.getByText("Scope access ended. You can revoke this link.")).toBeVisible();
  await expect(field).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke link" }).press("Enter");
  await page.getByRole("button", { name: "Confirm revocation" }).press("Enter");
  await expect(page.getByText("Your account has no teaching profile or student section eligible for a feed.")).toBeVisible();
});
