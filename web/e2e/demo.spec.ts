import { expect, test } from "@playwright/test";

test("one tap creates a live decision and can pick another", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What should I eat?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pick my meal" })).toBeInViewport();
  await page.getByRole("button", { name: "Pick my meal" }).click();
  await expect(page).toHaveURL(/\/choose\/decision-/);
  await expect(page.getByRole("heading", { name: "From ninety to one." })).toBeVisible();
  await page.getByRole("button", { name: "Show result" }).click();
  await expect(page).toHaveURL(/\/winner\/decision-/);
  const firstDish = await page.getByRole("heading", { level: 1 }).textContent();
  await expect(page.getByText("Fictional demo menu")).toBeVisible();
  await page.getByRole("button", { name: "Pick another" }).click();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(firstDish ?? "");
  await page.getByRole("button", { name: "Edit preferences" }).click();
  await expect(page.getByRole("dialog", { name: "Meal preferences" })).toBeVisible();
});
