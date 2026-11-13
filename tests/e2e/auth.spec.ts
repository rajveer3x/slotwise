import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash, argon2id } from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Role } from "../../src/generated/prisma/enums";
const testUrl = process.env.TEST_DATABASE_URL!;
if (new URL(testUrl).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
const departmentId = `browser-${randomUUID()}`;
const password = randomUUID();
let passwordHash: string;
test.beforeAll(async () => {
  passwordHash = await hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  await db.department.create({ data: { id: departmentId, name: "Computing · Synthetic browser demo" } });
});
test.afterAll(async () => { await db.user.deleteMany({ where: { departmentId } }); await db.department.deleteMany({ where: { id: departmentId } }); await db.$disconnect(); });
async function account(role: Role) {
  return db.user.create({ data: { email: `${randomUUID()}@browser.slotwise.test`, name: `Demo ${role}`, role, departmentId, passwordHash } });
}
async function login(page: Page, email: string, inputPassword: string = password) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(inputPassword); await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
for (const role of ["ADMIN", "COORDINATOR", "HOD", "FACULTY", "STUDENT"] as const) {
  test(`${role} signs in with current navigation and persists after reload`, async ({ page }) => {
    const user = await account(role); await login(page, user.email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: `Welcome, Demo ${role}` })).toBeVisible();
    if (role === "ADMIN") await expect(page.getByRole("link", { name: "Account access", exact: true })).toBeVisible();
    else await expect(page.getByRole("link", { name: "Account access", exact: true })).toHaveCount(0);
    await page.reload(); await expect(page.getByRole("heading", { name: `Welcome, Demo ${role}` })).toBeVisible();
    const cookie = (await page.context().cookies()).find(c => c.name === "next-auth.session-token");
    expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe("Lax");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard"); await expect(page).toHaveURL(/\/login$/);
  });
}
test("invalid login is generic, throttled on server and creates no session", async ({ page }) => {
  const user = await account("FACULTY");
  for (let i = 0; i < 5; i++) { await login(page, user.email, "wrong"); await expect(page.getByRole("status")).toContainText("Unable to sign in"); }
  await login(page, user.email); await expect(page.getByRole("status")).toContainText("Unable to sign in");
  expect((await page.context().cookies()).some(c => c.name.includes("session-token"))).toBe(false);
});
test("student direct admin navigation is rejected; revoked session loses access", async ({ page }) => {
  const user = await account("STUDENT"); await login(page, user.email); await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/admin/accounts"); await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await db.user.update({ where: { id: user.id }, data: { active: false } });
  await page.goto("/dashboard"); await expect(page).toHaveURL(/\/login$/);
});
test("admin mutation uses current database role, then succeeds after reauthorization", async ({ page }) => {
  const user = await account("ADMIN"); const target = await account("FACULTY");
  await db.user.update({ where: { id: target.id }, data: { name: "Unique target" } });
  await login(page, user.email); await expect(page).toHaveURL(/\/dashboard$/); await page.goto("/admin/accounts");
  await db.user.update({ where: { id: user.id }, data: { role: "STUDENT" } });
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Unique target" }) });
  await card.getByRole("button", { name: "Revoke Unique target" }).click();
  await expect(page.getByText("You do not have permission to change this account.")).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).active).toBe(true);
  await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } }); await page.goto("/admin/accounts");
  await card.getByRole("button", { name: "Revoke Unique target" }).click(); await expect(card.getByRole("status")).toContainText("Account revoked");
  expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).active).toBe(false);
});
test("missing CSRF token cannot create a session", async ({ request }) => {
  const user = await account("STUDENT");
  await request.post("/api/auth/callback/credentials", { form: { email: user.email, password, json: "true" } });
  expect((await request.storageState()).cookies.some(c => c.name.includes("session-token"))).toBe(false);
});
test("pending sign-in prevents duplicate submissions", async ({ page }) => {
  const user = await account("FACULTY");
  let release!: () => void;
  let started!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  let count = 0;
  await page.route("**/api/auth/callback/credentials", async route => { count++; started(); await hold; await route.continue(); });
  await login(page, user.email); await requested;
  try { await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled(); }
  finally { release(); }
  await expect(page).toHaveURL(/\/dashboard$/); expect(count).toBe(1);
});
test("stale account form explains refresh and does not overwrite current access", async ({ page }) => {
  const admin = await account("ADMIN"); const target = await account("FACULTY");
  await db.user.update({ where: { id: target.id }, data: { name: "Stale target" } });
  await login(page, admin.email); await expect(page).toHaveURL(/\/dashboard$/); await page.goto("/admin/accounts");
  await db.user.update({ where: { id: target.id }, data: { active: false } });
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Stale target", exact: true }) });
  await card.getByRole("button", { name: "Revoke Stale target" }).click();
  await expect(card.getByRole("status")).toContainText("Account access changed. Refresh");
  expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).active).toBe(false);
  await db.user.update({ where: { id: admin.id }, data: { role: "STUDENT" } });
  await page.goto("/dashboard"); await expect(page.getByRole("heading", { name: "Welcome, Demo ADMIN" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account access", exact: true })).toHaveCount(0);
  await expect(page.getByText("Your workspace for your section's timetable and schedule changes.")).toBeVisible();
});
test("tampering with a session cookie requires authentication", async ({ page }) => {
  const user = await account("STUDENT"); await login(page, user.email); await expect(page).toHaveURL(/\/dashboard$/);
  const cookie = (await page.context().cookies()).find(c => c.name === "next-auth.session-token")!;
  await page.context().addCookies([{ ...cookie, value: cookie.value + "tampered" }]);
  await page.goto("/dashboard"); await expect(page).toHaveURL(/\/login$/);
});
for (const width of [320, 390, 768, 1440]) {
  test(`authenticated shell is accessible at ${width}px with keyboard menu and reduced motion`, async ({ page }, testInfo) => {
    const user = await account("ADMIN");
    const longName = await account("FACULTY");
    await db.user.update({ where: { id: longName.id }, data: { name: "Synthetic faculty with a deliberately long display name for responsive verification" } });
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto("/login"); await page.getByRole("button", { name: "Sign in", exact: true }).click();
    expect(await page.getByLabel("Email", { exact: true }).evaluate((e: HTMLInputElement) => e.validity.valueMissing)).toBe(true);
    await page.getByLabel("Email", { exact: true }).fill(user.email); await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Password", { exact: true }).press("Enter"); await expect(page).toHaveURL(/\/dashboard$/);
    for (const path of ["/dashboard", "/admin/accounts"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-${width}.png`), fullPage: true });
    }
    if (width < 1024) {
      const menu = page.getByRole("button", { name: "Menu", exact: true }); await menu.focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
      await page.keyboard.press("Escape"); await expect(menu).toBeFocused();
    }
    for (const path of ["/dashboard", "/admin/accounts"]) {
      await page.goto(path); await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}
