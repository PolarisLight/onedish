import { expect, test } from "@playwright/test";

test("demo explains ninety choices and reveals one winner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Stop browsing. Eat this." })).toBeVisible();
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { name: "From ninety to one." })).toBeVisible();
  await expect(page.getByText("Nearby menu set")).toBeVisible();
  await page.getByRole("button", { name: "Show result" }).click();
  await expect(page.getByRole("heading", { name: "Charred Chicken Rice Bowl" })).toBeVisible();
  await expect(page.getByText("Fictional demo menu")).toBeVisible();
  await page.getByRole("button", { name: "Not today" }).click();
  await page.getByRole("button", { name: "Not craving it" }).click();
  await expect(page.getByText("Your one reserve")).toBeVisible();
  await page.getByRole("link", { name: "Taste Orbit" }).click();
  await expect(page.getByRole("heading", { name: "Your taste has an orbit." })).toBeVisible();
});
