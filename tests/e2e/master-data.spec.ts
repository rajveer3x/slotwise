import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { hash, argon2id } from "argon2";
import { config, type Kind } from "../../src/features/master-data/config";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const departmentId = `master-browser-${randomUUID()}`, otherId = `${departmentId}-other`, password = randomUUID();
let passwordHash: string, facultyId: string, studentId: string;
test.beforeAll(async () => {
  passwordHash = await hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  await db.department.createMany({ data: [{ id: departmentId, name: "Synthetic master-data browser demo" }, { id: otherId, name: "Other department" }] });
  facultyId = (await db.user.create({ data: { departmentId, role: "FACULTY", name: "Synthetic lecturer with a deliberately long name for responsive verification", email: `${randomUUID()}@slotwise.test`, passwordHash } })).id;
  studentId = (await db.user.create({ data: { departmentId, role: "STUDENT", name: "Synthetic student", email: `${randomUUID()}@slotwise.test`, passwordHash } })).id;
  await db.room.create({ data: { departmentId: otherId, code: "SECRET", name: "Foreign room must stay hidden", capacity: 30, type: "THEORY" } });
});
test.afterAll(async () => {
  const where = { departmentId: { in: [departmentId, otherId] } };
  await db.masterMutationReceipt.deleteMany({ where }); await db.courseAllocation.deleteMany({ where }); await db.facultyQualification.deleteMany({ where }); await db.facultyAvailability.deleteMany({ where }); await db.sectionMembership.deleteMany({ where }); await db.holiday.deleteMany({ where }); await db.section.deleteMany({ where }); await db.faculty.deleteMany({ where }); await db.course.deleteMany({ where }); await db.room.deleteMany({ where }); await db.timeSlot.deleteMany({ where }); await db.semester.deleteMany({ where }); await db.user.deleteMany({ where }); await db.department.deleteMany({ where: { id: { in: [departmentId, otherId] } } }); await db.$disconnect();
});
async function login(page: Page, role: "COORDINATOR" | "ADMIN" | "STUDENT" = "COORDINATOR") {
  const user = await db.user.create({ data: { departmentId, role, name: `Browser ${role}`, email: `${randomUUID()}@slotwise.test`, passwordHash } });
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(user.email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/); return user;
}
async function create(page: Page, kind: Kind, data: Record<string, string | boolean>) {
  await page.goto(`/admin?tab=${kind}`);
  const form = page.getByRole("region", { name: `Create ${config[kind].singular}`, exact: true });
  for (const field of config[kind].fields) {
    const control = form.getByLabel(field.label, { exact: field.type !== "checkbox" });
    if (field.type === "checkbox") await control.setChecked(Boolean(data[field.key]));
    else if (field.ref || field.type === "type" || field.type === "weekday") await control.selectOption(String(data[field.key]));
    else await control.fill(String(data[field.key]));
  }
  await form.getByRole("button", { name: `Create ${config[kind].singular}`, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved successfully." }).first()).toBeVisible();
}
test("coordinator configures all master entities and creates a valid allocation that survives reload", async ({ page }) => {
  await login(page);
  await create(page, "semester", { code: "AUTUMN", name: "Synthetic semester", startDate: "2026-08-03", endDate: "2026-12-18", active: true });
  const semesterId = (await db.semester.findFirstOrThrow({ where: { departmentId } })).id;
  await create(page, "holiday", { semesterId, date: "2026-11-20", name: "Synthetic holiday" });
  await create(page, "faculty", { userId: facultyId, designation: "Lecturer", targetMinutesPerWeek: "720", maxMinutesPerDay: "240", maxMinutesPerWeek: "1080" });
  const profileId = (await db.faculty.findFirstOrThrow({ where: { departmentId } })).id;
  await create(page, "facultyAvailability", { facultyId: profileId, weekday: "1", startMinute: "09:00", endMinute: "17:00" });
  await create(page, "course", { code: "CS101", name: "Programming", type: "THEORY", requiredContactMinutes: "2160" });
  const courseId = (await db.course.findFirstOrThrow({ where: { departmentId } })).id;
  await create(page, "facultyQualification", { facultyId: profileId, courseId });
  await create(page, "section", { semesterId, code: "S1", name: "Synthetic section", strength: "36", preferredPeriodsPerDay: "5" });
  const sectionId = (await db.section.findFirstOrThrow({ where: { departmentId } })).id;
  await create(page, "sectionMembership", { userId: studentId, sectionId, isRepresentative: true });
  await create(page, "room", { code: "R1", name: "Synthetic room", type: "THEORY", capacity: "40" });
  await create(page, "timeSlot", { label: "Period 1", weekday: "1", startMinute: "09:00", endMinute: "10:00" });
  await create(page, "courseAllocation", { courseId, semesterId, sectionId, facultyId: profileId, weeklyPeriods: "3", requiredContactMinutes: "2160" });
  await page.reload(); await expect(page.getByRole("region", { name: "Allocations records" })).toContainText("2160");
  const allocation = await db.courseAllocation.findFirstOrThrow({ where: { departmentId } }); expect(allocation.weeklyPeriods).toBe(3); expect(allocation.requiredContactMinutes).toBe(2160);
  await page.goto("/admin?tab=room"); await expect(page.getByText("Foreign room must stay hidden")).toHaveCount(0);
  const createForm = page.getByRole("region", { name: "Create room", exact: true });
  await createForm.getByLabel("Code", { exact: true }).fill("r1"); await createForm.getByLabel("Name", { exact: true }).fill("Duplicate input retained"); await createForm.getByLabel("Room type").selectOption("THEORY"); await createForm.getByLabel("Capacity").fill("40"); await createForm.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(createForm.getByRole("status")).toContainText("already exists"); await expect(createForm.getByLabel("Name", { exact: true })).toHaveValue("Duplicate input retained"); await expect(createForm.getByLabel("Code", { exact: true })).toHaveAttribute("aria-invalid", "true");
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "R1 · Synthetic room", exact: true }) });
  await card.locator("summary").filter({ hasText: /^Edit room$/ }).click(); await card.getByLabel("Capacity").fill("50");
  const room = await db.room.findFirstOrThrow({ where: { departmentId, code: "R1" } }); await db.room.update({ where: { id: room.id }, data: { capacity: 60, version: { increment: 1 } } });
  // Saving another form refreshes server props without silently replacing the
  // unsaved room draft or adopting a newer expected version.
  await createForm.getByLabel("Code", { exact: true }).fill("ANOTHER-ROOM"); await createForm.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(card.getByText("Newer data is available.", { exact: false })).toBeVisible(); await expect(card.getByLabel("Capacity")).toHaveValue("50");
  await card.getByRole("button", { name: "Save changes" }).click(); await expect(card.getByRole("status").filter({ hasText: "record changed" })).toBeVisible(); await expect(card.getByLabel("Capacity")).toHaveValue("50");
  await card.getByRole("button", { name: "Refresh page" }).click(); await card.locator("summary").filter({ hasText: /^Edit room$/ }).click(); await expect(card.getByLabel("Capacity")).toHaveValue("60");
  await page.goto("/admin?tab=room&archived=true"); await card.getByText("Archive room", { exact: true }).click(); await expect(card).toContainText("Archival preserves existing references"); await card.getByRole("button", { name: "Archive record" }).click(); await expect(card).toContainText("Archived · Version 3");
  await page.reload(); await expect(card).toContainText("Archived · Version 3"); await card.getByText("Restore room", { exact: true }).click(); await card.getByRole("button", { name: "Restore record" }).click(); await expect(card).toContainText("Available · Version 4");
  await page.getByLabel("Search rooms").fill("no-such-room"); await page.getByRole("button", { name: "Search", exact: true }).click(); await expect(page.getByText("No records match this search.", { exact: false })).toBeVisible();
});
test("repeated search parameters keep the page usable and consistently use the first value", async ({ page }) => {
  await login(page);
  await page.goto("/admin?tab=room&tab=course&q=synthetic&q=missing&archived=true&archived=false");
  await expect(page.getByRole("heading", { name: "Master data", exact: true })).toBeVisible();
  await expect(page.getByLabel("Search rooms")).toHaveValue("synthetic");
  await expect(page.getByLabel("Include archived records")).toBeChecked();
  await expect(page.getByRole("region", { name: "Create room", exact: true })).toBeVisible();
});
test("server rejects missing teaching time even when browser validation is bypassed", async ({ page }) => {
  await login(page); await page.goto("/admin?tab=timeSlot");
  const region = page.getByRole("region", { name: "Create teaching slot", exact: true });
  await region.getByLabel("Label", { exact: true }).fill("Missing start time");
  await region.getByLabel("Weekday").selectOption("6");
  await region.getByLabel("End time").fill("01:00");
  await region.locator("form").evaluate((form: HTMLFormElement) => { form.noValidate = true; });
  await region.getByRole("button", { name: "Create teaching slot", exact: true }).click();
  await expect(region.getByRole("status")).toContainText("Check the highlighted fields");
  await expect(region.getByLabel("Start time")).toHaveAttribute("aria-invalid", "true");
  await expect(region.getByLabel("Label", { exact: true })).toHaveValue("Missing start time");
  expect(await db.timeSlot.count({ where: { departmentId, label: "Missing start time" } })).toBe(0);
});
test("rendered coordinator form cannot mutate after role revocation and student direct navigation is denied", async ({ page }) => {
  const user = await login(page); await page.goto("/admin?tab=room");
  const form = page.getByRole("region", { name: "Create room", exact: true });
  await form.getByLabel("Code", { exact: true }).fill("DENIED"); await form.getByLabel("Name", { exact: true }).fill("Denied room"); await form.getByLabel("Room type").selectOption("THEORY"); await form.getByLabel("Capacity").fill("40");
  await db.user.update({ where: { id: user.id }, data: { role: "STUDENT" } });
  await form.getByRole("button", { name: "Create room", exact: true }).click(); await expect(form.getByRole("status")).toContainText("do not have permission");
  expect(await db.room.count({ where: { departmentId, code: "DENIED" } })).toBe(0);
  await page.goto("/admin"); await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});
test("keyboard room creation shows pending and prevents duplicate requests", async ({ page }) => {
  await login(page); await page.goto("/admin?tab=room");
  const form = page.getByRole("region", { name: "Create room", exact: true });
  await form.getByLabel("Code", { exact: true }).focus(); await page.keyboard.type("KEYBOARD"); await page.keyboard.press("Tab"); await page.keyboard.type("Keyboard room"); await page.keyboard.press("Tab"); await page.keyboard.press("t"); await page.keyboard.press("Tab"); await page.keyboard.type("45"); await page.keyboard.press("Tab");
  await expect(form.getByRole("button", { name: "Create room", exact: true })).toBeFocused();
  let release!: () => void, started!: () => void; const hold = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { started = r; }); let requests = 0;
  await page.route("**/admin?tab=room", async route => { if (route.request().method() === "POST") { requests++; started(); await hold; } await route.continue(); });
  await page.keyboard.press("Enter"); await ready;
  try { await expect(form.getByRole("button", { name: "Saving…" })).toBeDisabled(); } finally { release(); }
  await expect(form.getByRole("status")).toContainText("Saved successfully"); expect(requests).toBe(1); expect(await db.room.count({ where: { departmentId, code: "KEYBOARD" } })).toBe(1);
});
for (const width of [320, 390, 768, 1440]) test(`master data reflows and passes automated accessibility at ${width}px`, async ({ page }, testInfo) => {
  await db.faculty.upsert({ where: { userId: facultyId }, create: { departmentId, userId: facultyId, designation: "Synthetic lecturer", targetMinutesPerWeek: 720, maxMinutesPerDay: 240, maxMinutesPerWeek: 1080 }, update: {} });
  await db.room.create({ data: { departmentId, code: `VISUAL-${width}`, name: "Synthetic laboratory with a deliberately long descriptive name to check readable responsive layouts", type: "LAB", capacity: 40 } });
  await login(page, "ADMIN"); await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  for (const kind of ["faculty", "room", "courseAllocation"] as const) {
    await page.goto(`/admin?tab=${kind}`); await expect(page.getByRole("heading", { name: "Master data", exact: true })).toBeVisible(); await expect(page.getByRole("region", { name: `Create ${config[kind].singular}`, exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    if (kind !== "courseAllocation") await page.screenshot({ path: testInfo.outputPath(`master-${kind}-${width}.png`), fullPage: true });
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
