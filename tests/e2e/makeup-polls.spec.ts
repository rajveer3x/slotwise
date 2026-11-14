import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "../../src/generated/prisma/client";
import { resolutionFixture } from "../support/resolution-fixture";
import { cleanupTimetable } from "../support/timetable-fixture";

const url = process.env.TEST_DATABASE_URL!;
if (new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const password = randomUUID();
let fixture: Awaited<ReturnType<typeof resolutionFixture>>;

test.beforeEach(async () => {
  fixture = await resolutionFixture(db, await hash(password));
  await db.sectionMembership.updateMany({ where: { userId: fixture.student.id }, data: { isRepresentative: true } });
});
test.afterEach(async () => { await cleanupTimetable(db, fixture.departmentId); });
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function openPoll(page: Page) {
  await page.goto(`/resolutions?leave=${fixture.leaveId}`);
  await page.getByText("Offer a representative poll", { exact: true }).click();
  const options = page.getByRole("group", { name: "Options to offer" });
  await options.getByRole("checkbox").nth(0).press("Space");
  await options.getByRole("checkbox").nth(1).press("Space");
  await page.getByLabel("Deadline date").fill("2099-01-05");
  await page.getByLabel("Deadline time (Asia/Kolkata)").fill("17:00");
  const button = page.getByRole("button", { name: "Open poll", exact: true });
  await expect(button).toBeEnabled();
  await button.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Poll opened for the section representative." })).toBeVisible();
  await page.getByRole("link", { name: "View opened poll" }).click();
  await expect(page.getByRole("heading", { name: "Makeup polls" })).toBeVisible();
}

test("representative saves and replaces a preference, then coordinator closes, reviews and publishes it", async ({ page, browser }, testInfo) => {
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 950 }, reducedMotion: "reduce" });
  const outsiderContext = await browser.newContext();
  try {
    const student = await studentContext.newPage(), outsider = await outsiderContext.newPage();
    await login(page, fixture.coordinator.email);
    await openPoll(page);
    const pollUrl = page.url();
    await login(outsider, fixture.outsider.email);
    await outsider.goto(pollUrl);
    await expect(outsider.getByRole("heading", { name: "Poll unavailable" })).toBeVisible();

    await login(student, fixture.student.email);
    await student.getByRole("button", { name: "Menu", exact: true }).press("Enter");
    await student.getByRole("dialog").getByRole("link", { name: "Makeup polls" }).press("Enter");
    const radios = student.getByRole("radio");
    await expect(radios).toHaveCount(2);
    await radios.first().press("Space");
    await student.getByRole("button", { name: "Save preference" }).press("Enter");
    await expect(student.getByRole("status").filter({ hasText: "Preference saved." })).toBeVisible();
    await student.reload();
    await expect(radios.first()).toBeChecked();
    await radios.first().press("ArrowDown");
    await student.getByRole("button", { name: "Save preference" }).press("Enter");
    await expect(radios.nth(1)).toBeChecked();
    await expect(student.getByText("Your saved preference")).toBeVisible();
    await expect.poll(() => db.pollVote.findFirst({ where: { departmentId: fixture.departmentId } }).then(v => v?.position)).toBe(2);

    for (const width of [320, 390, 768, 1440]) {
      await student.setViewportSize({ width, height: 950 });
      expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await student.setViewportSize({ width: 390, height: 950 });
    await student.addStyleTag({ content: "html { zoom: 2 }" });
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await student.addStyleTag({ content: "html { zoom: 1 }" });
    await radios.nth(1).focus();
    await expect(radios.nth(1)).toBeFocused();
    expect((await new AxeBuilder({ page: student }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await student.screenshot({ path: testInfo.outputPath("representative-mobile.png"), fullPage: true });
    expect(await db.schedulePublication.count({ where: { departmentId: fixture.departmentId } })).toBe(0);

    await page.reload();
    await expect(page.getByText("Representative’s preference")).toBeVisible();
    await page.getByRole("button", { name: "Close poll" }).press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Poll closed." })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 950 });
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("coordinator-desktop.png"), fullPage: true });
    await student.reload();
    await expect(student.getByText(/^Closed · Deadline/)).toBeVisible();
    await expect(student.getByRole("button", { name: "Save preference" })).toHaveCount(0);

    await page.getByRole("link", { name: "Review in Class recovery" }).click();
    await page.getByRole("button", { name: "Check preferred option" }).press("Enter");
    await expect(page.getByText(/Draft only · 1 selected/)).toBeVisible();
    const save = page.getByRole("button", { name: "Save draft", exact: true });
    await expect(save).toBeEnabled();
    await save.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    const review = page.getByRole("region", { name: "Preview and publish", exact: true });
    const preview = review.getByRole("button", { name: "Preview selected changes", exact: true });
    await expect(preview).toBeEnabled();
    await preview.press("Enter");
    await expect(review.getByRole("heading", { name: "Before / After · Asia/Kolkata", exact: true })).toBeVisible();
    const publish = review.getByRole("button", { name: "Publish 1 changes", exact: true });
    await expect(publish).toBeEnabled();
    await publish.press("Enter");
    await expect(review.getByRole("status").filter({ hasText: "Published 1 changes." })).toBeVisible();
    const replacement = await db.classOccurrence.findFirstOrThrow({ where: { departmentId: fixture.departmentId, publicationId: { not: null } } });
    const choice = await db.makeupPollOption.findFirstOrThrow({ where: { poll: { departmentId: fixture.departmentId }, position: 2 } });
    expect(replacement.startAt).toEqual(choice.startAt);
    expect(replacement.resolutionTier).toBe(3);
    expect(replacement.deliveryStatus).toBe("PENDING");
  } finally {
    await studentContext.close();
    await outsiderContext.close();
  }
});

test("failed voting keeps the selection and a newly unavailable preference requires recomputation", async ({ page, browser }) => {
  const studentContext = await browser.newContext();
  try {
    const student = await studentContext.newPage();
    const scope = { departmentId: fixture.departmentId };
    await db.resourceReservation.deleteMany({ where: scope });
    await db.classOccurrence.deleteMany({ where: { ...scope, schedulingStatus: "ACTIVE" } });
    await login(page, fixture.coordinator.email);
    await openPoll(page);
    await login(student, fixture.student.email);
    await student.goto(page.url());
    await student.getByRole("radio").first().press("Space");
    const save = student.getByRole("button", { name: "Save preference" });
    let reached!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { reached = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    await student.route("**/makeup-polls**", async route => {
      if (route.request().method() !== "POST") return route.continue();
      reached();
      await hold;
      await route.abort();
    });
    await save.press("Enter");
    await started;
    try { await expect(student.getByRole("button", { name: "Saving…" })).toBeDisabled(); }
    finally { release(); }
    await expect(student.getByText("Could not reach the server.", { exact: false })).toBeVisible();
    await expect(student.getByRole("radio").first()).toBeChecked();
    await student.unroute("**/makeup-polls**");
    await save.press("Enter");
    await expect(student.getByText("Your saved preference")).toBeVisible();

    await page.getByRole("button", { name: "Close poll" }).press("Enter");
    await expect(page.getByText("Poll closed.")).toBeVisible();
    const preferred = await db.makeupPollOption.findFirstOrThrow({ where: { poll: scope, position: 1 } });
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", dateStyle: "short" }).format(preferred.startAt);
    await db.$transaction([
      db.holiday.create({ data: { ...scope, semesterId: fixture.semester.id, date, name: "Synthetic scheduling conflict" } }),
      db.semester.update({ where: { id: fixture.semester.id }, data: { scheduleRevision: { increment: 1 } } }),
    ]);
    await page.reload();
    await expect(page.getByText(/schedule has changed since this poll opened/)).toBeVisible();
    await page.getByRole("link", { name: "Review in Class recovery" }).click();
    await page.getByRole("button", { name: "Check preferred option" }).press("Enter");
    await expect(page.getByText(/preferred option is no longer available.*Recompute/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview selected changes", exact: true })).toBeDisabled();
    expect(await db.schedulePublication.count({ where: scope })).toBe(0);
  } finally { await studentContext.close(); }
});
