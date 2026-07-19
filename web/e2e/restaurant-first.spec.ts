import { expect, test } from "@playwright/test";

const response = {
  schema_version: "restaurant-recommendation.v1",
  session_id: "a".repeat(32),
  ranked: ["Shacha Li", "Harbor Kitchen"].map((name, index) => ({
    candidate: {
      id: `amap:${index}`,
      name,
      category: "Fujian",
      cuisine_tags: ["fujian"],
      distance_m: 420 - index * 240,
      rating: 4.8 - index * 0.6,
      average_cost_minor: 5000,
      currency: "CNY",
      open_state: "unknown",
      navigation_url: "https://uri.amap.com/marker?position=118.09,24.48",
      source_kind: "amap_place",
      attribution: "AMap",
      confidence: 0.7 + index * 0.2,
      persistence: "active_only",
      evidence: { distance: true, rating: true, average_cost: true, category: true, open_state: false, menu: false },
    },
    score: 80 - index,
    reason_codes: index === 0
      ? ["higher_rating"]
      : ["closer_than_typical", "high_confidence"],
  })),
  trace: [
    { id: "nearby", input_count: 8, survivor_count: 8 },
    { id: "constraints", input_count: 8, survivor_count: 5 },
    { id: "habits", input_count: 5, survivor_count: 2 },
    { id: "winner", input_count: 2, survivor_count: 1 },
  ],
  selection_source: "deterministic",
  model_status: "disabled",
  recommendation_mode: "exploration",
  radius_m: 3000,
};

test("one tap uses location, real counts, and an in-memory second pick", async ({ context, page }) => {
  let calls = 0;
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 24.48, longitude: 118.09 });
  await page.route("**/api/v1/restaurants/recommend", async (route) => {
    calls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "See what to eat" }).click();
  await expect(page.getByRole("dialog", { name: "Use your location once?" })).toBeVisible();
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page).toHaveURL(/restaurants\/choose\/a{32}/);
  await expect(page.getByText("8").first()).toBeVisible();
  await expect(page.getByText("99")).not.toBeAttached();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Meet your restaurant" }).click();
  await expect(page.getByRole("heading", { name: "Shacha Li" })).toBeVisible();
  await page.getByRole("button", { name: "Pick another" }).click();
  await expect(page.getByRole("heading", { name: "Harbor Kitchen" })).toBeVisible();
  expect(calls).toBe(1);
});

test("location failure offers central Xiamen or retry", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (_ok: unknown, error: (value: { code: number }) => void) => error({ code: 1 }) },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "See what to eat" }).click();
  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page.getByRole("button", { name: "Use central Xiamen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try location again" })).toBeVisible();
});
