import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1440]) {
  test(`landing and login are accessible and reflow at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(audit.violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${path === "/" ? "landing" : "login"}-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test("keyboard navigation, visible focus and reduced motion preserve the primary flow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  const signIn = page.getByRole("link", { name: "Sign in" });
  await expect(signIn).toBeFocused();
  const style = await signIn.evaluate((element) => {
    const value = getComputedStyle(element);
    return { outline: value.outlineStyle, width: value.outlineWidth, transition: value.transitionDuration };
  });
  expect(style.outline).toBe("solid");
  expect(style.width).toBe("2px");
  expect(style.transition).toBe("0s");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to SlotWise" })).toBeVisible();
  await page.getByRole("link", { name: "Back to SlotWise" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});

test("200% layout scaling keeps both pages readable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    // CSS zoom exercises actual 200% layout scaling, unlike deviceScaleFactor.
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  }
});

test("unknown routes provide a usable return path", async ({ page }) => {
  const response = await page.goto("/not-a-slotwise-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Return to SlotWise" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});
