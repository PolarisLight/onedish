import { expect, test } from "@playwright/test";

async function createHistory(page: import("@playwright/test").Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Pick my meal" }).click();
  const skip = page.getByRole("button", { name: "Skip" });
  const meet = page.getByRole("button", { name: "Meet your dish" });
  await expect(skip.or(meet)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await page.getByRole("button", { name: "Meet your dish" }).click();
  await expect(page).toHaveURL(/\/winner\/decision-/);
  await expect(page.getByRole("heading", { name: "Why this one" })).toBeVisible();
}

test("language switch keeps each route in one interface language", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.getByRole("heading", { name: "今天 吃什么？" })).toBeVisible();
  await expect(page.getByText(/¥60\.00/)).toBeVisible();
  await page.getByRole("link", { name: "隐私" }).first().click();
  await expect(page.getByRole("heading", { name: "你的身体不是商品。" })).toBeVisible();
  await expect(page.getByRole("button", { name: "精确位置" })).toBeVisible();
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { name: "Your body is not the product." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Precise location" })).toBeVisible();
});

test("taste orbit focuses a signal and YOU returns it to natural rotation", async ({ page }) => {
  await createHistory(page);
  await page.getByRole("link", { name: "Taste Orbit" }).first().click();
  const signal = page.locator(".orbit-signal").first();
  await expect(signal).toBeVisible();
  await signal.click({ force: true });
  await expect(signal).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".orbit-stage")).toHaveClass(/has-focus/);
  await page.getByRole("button", { name: "YOU" }).click();
  await expect(page.locator(".orbit-stage")).not.toHaveClass(/has-focus/);
});

test("privacy explorer is interactive and fits a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Health signals" }).click();
  await expect(page.getByRole("heading", { name: "Health signals" })).toBeVisible();
  await expect(page.getByText("Health data is not connected. If enabled later, it stays on this device by default.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Delete local profile" }).click();
  await expect(page.getByRole("dialog", { name: "Delete local profile and meal-derived data?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).not.toBeAttached();
});

test("reduced-motion preference freezes natural orbit rotation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createHistory(page);
  await page.goto("/history");
  const stage = page.locator(".orbit-stage");
  await expect(stage).toBeVisible();
  const before = await stage.evaluate((element) => getComputedStyle(element).getPropertyValue("--orbit-angle"));
  await page.waitForTimeout(250);
  const after = await stage.evaluate((element) => getComputedStyle(element).getPropertyValue("--orbit-angle"));
  expect(after).toBe(before);
});
