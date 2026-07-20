import {
  db,
  getRecentRestaurantIntents,
  getRestaurantPreferences,
  resetLocalData,
  saveRestaurantIntent,
  saveRestaurantPreferences,
} from "../src/db/db";


beforeEach(() => resetLocalData());

test("stores only user-owned intent fields", async () => {
  await saveRestaurantIntent({
    id: "intent-1",
    occurred_at: "2026-07-20T10:00:00.000Z",
    action: "accepted",
    selected_tags: ["japanese"],
    budget_band_minor: 5000,
  });
  const raw = JSON.stringify(
    await getRecentRestaurantIntents(14, new Date("2026-07-20T12:00:00Z")),
  );
  for (const forbidden of [
    "restaurant",
    "poi",
    "address",
    "latitude",
    "longitude",
    "rating",
    "price",
    "photo",
    "navigation",
  ]) {
    expect(raw.toLowerCase()).not.toContain(forbidden);
  }
});

test("rejects provider-derived or unknown fields at runtime", async () => {
  await expect(saveRestaurantIntent({
    id: "bad",
    occurred_at: "2026-07-20T10:00:00.000Z",
    action: "accepted",
    selected_tags: ["japanese"],
    budget_band_minor: null,
    restaurant_name: "provider value",
  } as never)).rejects.toThrow("Invalid restaurant intent");
  expect(await db.restaurantIntentEvents.count()).toBe(0);
});

test("reads only the newest one hundred intents inside the fourteen day window", async () => {
  const rows = Array.from({ length: 105 }, (_, index) => ({
    id: `intent-${index}`,
    occurred_at: new Date(Date.UTC(2026, 6, 20, 8, index)).toISOString(),
    action: "accepted" as const,
    selected_tags: ["japanese"] as const,
    budget_band_minor: null,
  }));
  await db.restaurantIntentEvents.bulkPut(rows);
  await db.restaurantIntentEvents.put({
    id: "old",
    occurred_at: "2026-07-01T00:00:00.000Z",
    action: "accepted",
    selected_tags: ["japanese"],
    budget_band_minor: null,
  });
  const recent = await getRecentRestaurantIntents(14, new Date("2026-07-20T12:00:00Z"));
  expect(recent).toHaveLength(100);
  expect(recent.at(0)?.id).toBe("intent-104");
  expect(recent.some((row) => row.id === "old")).toBe(false);
});

test("round-trips strict restaurant preferences separately from the dish demo profile", async () => {
  await saveRestaurantPreferences({
    selected_tags: ["japanese", "hot_pot"],
    budget_minor: 5000,
    budget_is_explicit: true,
  });
  await db.settings.put({ key: "profile.v2", value: { dish_demo: true } });
  expect(await getRestaurantPreferences({
    selected_tags: [],
    budget_minor: 6000,
    budget_is_explicit: false,
  })).toEqual({
    selected_tags: ["japanese", "hot_pot"],
    budget_minor: 5000,
    budget_is_explicit: true,
  });
  expect((await db.settings.get("profile.v2"))?.value).toEqual({ dish_demo: true });
});
