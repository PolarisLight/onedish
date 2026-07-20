import { expect, test } from "@playwright/test";

test("one tap creates a live decision and can pick another", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "What should I eat?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pick my meal" })).toBeInViewport();
  await page.getByRole("button", { name: "Pick my meal" }).click();
  await expect(page).toHaveURL(/\/choose\/decision-/);
  await expect(page.getByRole("heading", { name: "From ninety to one." })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Meet your dish" }).click();
  await expect(page).toHaveURL(/\/winner\/decision-/);
  const firstDecisionUrl = page.url();
  await expect(page.getByRole("heading", { name: "Why this one" })).toBeVisible();
  await page.getByRole("button", { name: "Pick another" }).click();
  await expect(page).not.toHaveURL(firstDecisionUrl);
  await page.getByRole("button", { name: "Edit preferences" }).click();
  await expect(page.getByRole("dialog", { name: "Restaurant preferences" })).toBeVisible();
});

test("320px mobile actions stay above the fold", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Pick my meal" })).toBeInViewport();
  await page.getByRole("button", { name: "Pick my meal" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("button", { name: "Meet your dish" })).toBeInViewport();
});
