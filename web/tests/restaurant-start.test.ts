import { expect, it, vi } from "vitest";
import type { RestaurantIntentEventRow } from "../src/db/db";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import {
  clearRestaurantSessions,
  getCurrentRestaurant,
  getRestaurantSession,
} from "../src/restaurants/session-store";
import { startRestaurantRecommendation } from "../src/restaurants/start";
import { restaurantResponse } from "./support/restaurant-fixtures";


const preferences = {
  selected_tags: ["japanese", "hot_pot"] as const,
  budget_minor: 5000,
  budget_is_explicit: true,
};
const intents: RestaurantIntentEventRow[] = [{
  id: "local-only-id",
  occurred_at: "2026-07-19T10:00:00.000Z",
  action: "accepted",
  selected_tags: ["japanese"],
  budget_band_minor: 5000,
}];

it("sends only current intent and sanitized user-owned events", async () => {
  clearRestaurantSessions();
  const recommend = vi.fn().mockResolvedValue(
    parseRestaurantRecommendation(restaurantResponse()),
  );
  const id = await startRestaurantRecommendation({
    point: { latitude: 24.48, longitude: 118.09 },
    locale: "zh-CN",
    preferences,
    recentIntents: intents,
  }, { request: recommend });
  expect(recommend).toHaveBeenCalledWith({
    schema_version: "restaurant-request.v2",
    latitude: 24.48,
    longitude: 118.09,
    locale: "zh-CN",
    profile: {
      selected_tags: ["japanese", "hot_pot"],
      budget_minor: 5000,
      budget_is_explicit: true,
      currency: "CNY",
    },
    recent_intents: [{
      occurred_at: "2026-07-19T10:00:00.000Z",
      selected_tags: ["japanese"],
      budget_band_minor: 5000,
    }],
  });
  const serialized = JSON.stringify(recommend.mock.calls[0]);
  for (const forbidden of [
    "local-only-id", "action", "restaurant_name", "dish", "allergen",
    "ingredient", "taste", "duration", "health", "meal_period", "history",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  if (!id) throw new Error("Expected an active session");
  expect(getCurrentRestaurant(id)?.candidate.name).toBe("First");
  expect(getRestaurantSession(id)?.request.profile.selected_tags).toEqual([
    "japanese",
    "hot_pot",
  ]);
});

it("uses USD for the English product without changing the stored numeric budget", async () => {
  const recommend = vi.fn().mockResolvedValue(parseRestaurantRecommendation(restaurantResponse()));
  await startRestaurantRecommendation({
    point: { latitude: 24.48, longitude: 118.09 },
    locale: "en",
    preferences: { ...preferences, budget_minor: 2500 },
    recentIntents: [],
  }, { request: recommend });
  expect(recommend).toHaveBeenCalledWith(expect.objectContaining({
    profile: expect.objectContaining({ currency: "USD", budget_minor: 2500 }),
  }));
});

it("checks the active operation before replacing the in-memory session", async () => {
  clearRestaurantSessions();
  const oldResponse = parseRestaurantRecommendation({
    ...restaurantResponse(),
    session_id: "a".repeat(32),
  });
  const newResponse = parseRestaurantRecommendation({
    ...restaurantResponse(),
    session_id: "b".repeat(32),
  });
  let resolveOld!: (response: typeof oldResponse) => void;
  let resolveNew!: (response: typeof newResponse) => void;
  const oldRequest = new Promise<typeof oldResponse>((resolve) => { resolveOld = resolve; });
  const newRequest = new Promise<typeof newResponse>((resolve) => { resolveNew = resolve; });
  const input = {
    point: { latitude: 24.48, longitude: 118.09 },
    locale: "en" as const,
    preferences,
    recentIntents: intents,
  };
  let activeOperation = 1;
  const oldStart = startRestaurantRecommendation(input, {
    request: () => oldRequest,
    canCommit: () => activeOperation === 1,
  });
  activeOperation = 2;
  const newStart = startRestaurantRecommendation(input, {
    request: () => newRequest,
    canCommit: () => activeOperation === 2,
  });
  resolveNew(newResponse);
  await expect(newStart).resolves.toBe("b".repeat(32));
  resolveOld(oldResponse);
  await expect(oldStart).resolves.toBeNull();
  expect(getRestaurantSession("b".repeat(32))).not.toBeNull();
  expect(getRestaurantSession("a".repeat(32))).toBeNull();
});
