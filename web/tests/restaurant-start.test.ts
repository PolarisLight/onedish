import { expect, it, vi } from "vitest";
import { db, getProfile, resetLocalData } from "../src/db/db";
import { clearRestaurantSessions, getCurrentRestaurant, getRestaurantSession } from "../src/restaurants/session-store";
import { startRestaurantRecommendation } from "../src/restaurants/start";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import { restaurantResponse } from "./support/restaurant-fixtures";
import type { HistoryEventRow } from "../src/db/db";
import type { UserProfile } from "../src/recommendation/types";

const localLunch = () => new Date(2026, 6, 19, 12, 0, 0);

it("sends minimized context and creates an active session", async () => {
  clearRestaurantSessions();
  const recommend = vi.fn().mockResolvedValue(
    parseRestaurantRecommendation(restaurantResponse()),
  );
  const id = await startRestaurantRecommendation({
    point: { latitude: 24.48, longitude: 118.09 },
    locale: "zh-CN",
    profile: {
      locale: "zh-CN", excluded_allergens: [], excluded_ingredients: [],
      desired_taste_tags: ["spicy"], preferred_cuisines: ["fujian"], budget_minor: 6000,
      budget_is_explicit: true, duration_minutes: 20,
    },
    history: [{
      id: "h1", occurred_at: new Date().toISOString(), kind: "accepted",
      cuisine_tags: ["fujian"],
    }],
    now: localLunch(),
  }, { request: recommend });
  expect(recommend).toHaveBeenCalledWith(expect.objectContaining({
    latitude: 24.48,
    longitude: 118.09,
    meal_period: "lunch",
    profile: {
      budget_minor: 6000,
      budget_is_explicit: true,
      currency: "CNY",
      preferred_cuisines: ["fujian"],
      max_distance_m: 3000,
    },
    history: expect.objectContaining({ recent_cuisines: { fujian: 1 } }),
  }));
  if (!id) throw new Error("Expected the active recommendation to commit a session");
  expect(getCurrentRestaurant(id)?.candidate.name).toBe("First");
});

it.each([
  ["accepted", true],
  ["eaten", true],
  ["rejected", false],
  ["dismissed", false],
  ["corrected", false],
  ["reset", false],
] as const)("counts %s history as consumed: %s", async (kind, consumed) => {
  clearRestaurantSessions();
  const recommend = vi.fn().mockResolvedValue(parseRestaurantRecommendation(restaurantResponse()));
  const profile = {
    locale: "en", excluded_allergens: [], excluded_ingredients: [],
    desired_taste_tags: ["warm", "spicy", "fresh"], preferred_cuisines: [],
    budget_minor: 2500, budget_is_explicit: false, duration_minutes: 20,
  } satisfies UserProfile;
  await startRestaurantRecommendation({
    point: { latitude: 24.48, longitude: 118.09 }, locale: "en", profile,
    history: [{ id: kind, occurred_at: new Date().toISOString(), kind, cuisine_tags: ["fujian"] } satisfies HistoryEventRow],
    now: localLunch(),
  }, { request: recommend });

  expect(recommend).toHaveBeenCalledWith(expect.objectContaining({
    profile: expect.objectContaining({ preferred_cuisines: [] }),
    history: expect.objectContaining({ recent_cuisines: consumed ? { fujian: 1 } : {} }),
  }));
});

it("sends only explicit normalized cuisines, never taste-orbit or unknown tags", async () => {
  const recommend = vi.fn().mockResolvedValue(parseRestaurantRecommendation(restaurantResponse()));
  const profile = {
    locale: "en", excluded_allergens: [], excluded_ingredients: [],
    desired_taste_tags: ["warm", "spicy", "fresh"],
    preferred_cuisines: ["sichuan", "unknown", "spicy"],
    budget_minor: 2500, budget_is_explicit: false, duration_minutes: 20,
  } as unknown as UserProfile;
  await startRestaurantRecommendation({
    point: { latitude: 24.48, longitude: 118.09 }, locale: "en", profile,
    history: [{ id: "h", occurred_at: new Date().toISOString(), kind: "eaten", cuisine_tags: ["sichuan", "asian", "warm"] }],
    now: localLunch(),
  }, { request: recommend });

  expect(recommend).toHaveBeenCalledWith(expect.objectContaining({
    profile: expect.objectContaining({ preferred_cuisines: ["sichuan"] }),
    history: expect.objectContaining({ recent_cuisines: { sichuan: 1 } }),
  }));
});

it("does not send a repaired default budget as explicit", async () => {
  await resetLocalData();
  await db.settings.put({
    key: "profile.v2",
    value: {
      locale: "zh-CN",
      excluded_allergens: [],
      excluded_ingredients: [],
      desired_taste_tags: [],
      budget_minor: -1,
      budget_is_explicit: true,
      duration_minutes: 20,
    },
  });
  const profile = await getProfile();
  expect(profile).toMatchObject({ budget_minor: 6000, budget_is_explicit: false });
  if (!profile) throw new Error("Expected a normalized profile");
  const recommend = vi.fn().mockResolvedValue(parseRestaurantRecommendation(restaurantResponse()));

  await startRestaurantRecommendation({
    point: { latitude: 24.48, longitude: 118.09 },
    locale: "zh-CN",
    profile,
    history: [],
    now: localLunch(),
  }, { request: recommend });

  expect(recommend).toHaveBeenCalledWith(expect.objectContaining({
    profile: expect.objectContaining({ budget_minor: 6000, budget_is_explicit: false }),
  }));
});

it("checks the active operation before replacing the in-memory session", async () => {
  clearRestaurantSessions();
  const oldResponse = parseRestaurantRecommendation({ ...restaurantResponse(), session_id: "a".repeat(32) });
  const newResponse = parseRestaurantRecommendation({ ...restaurantResponse(), session_id: "b".repeat(32) });
  let resolveOld!: (response: typeof oldResponse) => void;
  let resolveNew!: (response: typeof newResponse) => void;
  const oldRequest = new Promise<typeof oldResponse>((resolve) => { resolveOld = resolve; });
  const newRequest = new Promise<typeof newResponse>((resolve) => { resolveNew = resolve; });
  const input = {
    point: { latitude: 24.48, longitude: 118.09 },
    locale: "en" as const,
    profile: {
      locale: "en" as const, excluded_allergens: [], excluded_ingredients: [],
      desired_taste_tags: [], preferred_cuisines: [], budget_minor: 2500, budget_is_explicit: false,
      duration_minutes: 20,
    },
    history: [],
    now: new Date("2026-07-19T12:00:00+08:00"),
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
  expect(getRestaurantSession("b".repeat(32))).not.toBeNull();

  resolveOld(oldResponse);
  await expect(oldStart).resolves.toBeNull();
  expect(getRestaurantSession("b".repeat(32))).not.toBeNull();
  expect(getRestaurantSession("a".repeat(32))).toBeNull();
});
