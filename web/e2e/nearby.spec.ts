import { expect, test } from "@playwright/test";

test("nearby asks for location only after intent and keeps fixtures labeled", async ({ context, page }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 31.23, longitude: 121.47 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pick my meal" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Meet your dish" }).click();
  await page.getByRole("button", { name: "Find nearby" }).click();
  await expect(page.getByRole("button", { name: "Use current location" })).toBeVisible();
  await expect(page.getByTitle("OpenStreetMap nearby area")).not.toBeAttached();
  await page.getByRole("button", { name: "Use current location" }).click();
  await expect(page.getByRole("dialog", { name: "Share location for this map?" })).toBeVisible();
  await expect(page.getByTitle("OpenStreetMap nearby area")).not.toBeAttached();
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page.getByTitle("OpenStreetMap nearby area")).toBeVisible();
  await expect(page.getByText(/clearly labeled fixtures/i)).toBeVisible();
});
