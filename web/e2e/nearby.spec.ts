import { expect, test } from "@playwright/test";

test("nearby asks for location only after intent and keeps fixtures labeled", async ({ context, page }) => {
  await page.route("**/api/v1/places/nearby", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{
      id: "B0TEST", name: "Test Restaurant", category: "Restaurant",
      distance_m: 250, price_tier: 2, rating: 4.6, open_state: "unknown",
      order_destination: "https://uri.amap.com/marker?position=121.47,31.23",
      source_kind: "amap_place", attribution: "高德地图", address: null,
      average_cost_minor: 5000, currency: "CNY", latitude: 31.23,
      longitude: 121.47, photo_url: null,
    }]),
  }));
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 31.23, longitude: 121.47 });
  await page.goto("/demo");
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
  await expect(page.getByText("Live place information from AMap. Check menu availability with the restaurant.")).toBeVisible();
});
