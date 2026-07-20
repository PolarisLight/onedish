import { expect, test, type Page } from "@playwright/test";
import { installAmapFixture, installFailingAmapFixture } from "./support/amap-fixture";

const pois = [
  { id: "mixc", name: "Xiamen MixC", address: "99 Hubin East Road", latitude: 24.476, longitude: 118.116 },
  { id: "station", name: "Xiamen Railway Station", address: "900 Xiahe Road", latitude: 24.467, longitude: 118.113 },
] as const;

const response = {
  schema_version: "restaurant-recommendation.v2",
  session_id: "b".repeat(32),
  active_radius_m: 3000,
  search_rounds: [
    { radius_m: 2000, discovered_count: 12, eligible_count: 0 },
    { radius_m: 3000, discovered_count: 16, eligible_count: 2 },
  ],
  exclusions: { closed: 1, outside_radius: 0, tag_mismatch: 13, excessive_budget: 0 },
  quality_pool_count: 2,
  ranked: ["Harbor Table", "Garden Noodles"].map((name, index) => ({
    candidate: {
      id: `amap:e2e-${index}`,
      name,
      category: "Fujian",
      intent_tags: ["minnan_fujian"],
      distance_m: 1900 - index * 1400,
      rating: 4.9 - index * 0.7,
      average_cost_minor: 6800,
      currency: "CNY",
      open_state: "unknown",
      navigation_url: "https://uri.amap.com/marker?position=118.11,24.47",
      source_kind: "amap_place",
      attribution: "AMap",
      persistence: "active_only",
      evidence: { distance: true, rating: true, average_cost: true, category: true, open_state: false },
    },
    score: 89 - index,
    matched_tags: ["minnan_fujian"],
    budget_state: "not_requested",
    budget_overage_minor: null,
    reason_codes: index === 0 ? ["above_median_rating"] : ["nearby"],
  })),
};

async function finishElimination(page: Page): Promise<void> {
  await expect(page).toHaveURL(/restaurants\/choose\/b{32}/);
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Meet your restaurant" }).click();
}

async function reasonTexts(page: Page): Promise<string[]> {
  return page.locator(".restaurant-evidence li").allTextContents();
}

test("map-backed landmark suggestion selection reaches candidate-specific alternatives", async ({ page }) => {
  await installAmapFixture(page, pois);
  let requestedPayload: Record<string, unknown> | undefined;
  let requestedLocation: unknown;
  await page.route("**/api/v1/restaurants/recommend", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    requestedPayload = payload;
    requestedLocation = { latitude: payload.latitude, longitude: payload.longitude };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Choose another place" }).click();
  await expect(page.getByLabel("Landmark map")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("searchbox", { name: "Search landmarks" }).fill("Xiamen");
  const suggestions = page.getByRole("list", { name: "Landmark suggestions" });
  await suggestions.getByRole("button", { name: /Xiamen MixC/ }).click();
  await expect(page.getByRole("heading", { name: "Xiamen MixC" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __amapFixtureCalls?: { autoComplete: number; placeSearch: number } }
  ).__amapFixtureCalls)).toEqual({ autoComplete: 1, placeSearch: 1 });
  await page.getByRole("button", { name: "Search restaurants near this place" }).click();
  await finishElimination(page);
  await expect(page.getByText("Search radius: 3 km")).toBeVisible();
  expect(requestedLocation).toEqual({ latitude: pois[0].latitude, longitude: pois[0].longitude });
  const serializedRequest = JSON.stringify(requestedPayload);
  expect(serializedRequest).not.toContain(pois[0].id);
  expect(serializedRequest).not.toContain(pois[0].name);
  expect(serializedRequest).not.toContain(pois[0].address);
  const serializedBrowserStorage = await page.evaluate(() => JSON.stringify({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(serializedBrowserStorage).not.toContain(pois[0].id);
  expect(serializedBrowserStorage).not.toContain(pois[0].name);
  expect(serializedBrowserStorage).not.toContain(pois[0].address);
  const firstReasons = await reasonTexts(page);
  await page.getByRole("button", { name: "Pick another" }).click();
  await expect(page.getByRole("heading", { name: "Garden Noodles" })).toBeVisible();
  expect(await reasonTexts(page)).not.toEqual(firstReasons);
});

test("map failure can be closed without breaking current-location entry", async ({ page }) => {
  await installFailingAmapFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Choose another place" }).click();
  await expect(page.getByRole("button", { name: "Retry map" })).toBeVisible();
  await page.getByRole("button", { name: "Close map" }).last().click();
  await page.getByRole("button", { name: "See what to eat" }).click();
  await expect(page.getByRole("dialog", { name: "Use your location once?" })).toBeVisible();
});

test("landmark suggestions and confirmation stay usable at 320 by 568", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await installAmapFixture(page, pois);
  await page.goto("/");
  await page.getByRole("button", { name: "Choose another place" }).click();
  await page.getByRole("searchbox", { name: "Search landmarks" }).fill("Xiamen");
  const suggestions = page.getByRole("list", { name: "Landmark suggestions" });
  await suggestions.getByRole("button", { name: /Xiamen MixC/ }).click();
  await expect(suggestions).not.toBeAttached();
  await expect(page.getByRole("list", { name: "Landmark search results" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Xiamen MixC" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search restaurants near this place" })).toBeInViewport();
});
