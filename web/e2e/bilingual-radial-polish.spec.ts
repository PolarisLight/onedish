import { expect, test } from "@playwright/test";

async function createHistory(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Pick my meal" }).click();
  const skip = page.getByRole("button", { name: "Skip" });
  const meet = page.getByRole("button", { name: "Meet your dish" });
  await expect(skip.or(meet)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await meet.click();
  await expect(page.getByRole("heading", { name: "Why this one" })).toBeVisible();
}

test("radial nodes and privacy receiver use the shared geometry contract", async ({ page }) => {
  await createHistory(page);
  await page.goto("/history");
  await expect(page.locator(".radial-node-position").first()).toBeVisible();
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Precise location" }).click();
  await expect(page.getByTestId("privacy-receiver")).toBeVisible();
});
