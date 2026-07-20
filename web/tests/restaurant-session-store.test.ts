import { beforeEach, expect, it } from "vitest";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import {
  clearRestaurantSessions,
  createRestaurantSession,
  getCurrentRestaurant,
  getRestaurantSession,
  pickAnotherRestaurant,
} from "../src/restaurants/session-store";
import { restaurantResponse } from "./support/restaurant-fixtures";
import type { RestaurantRecommendRequest } from "../src/restaurants/types";

const request: RestaurantRecommendRequest = {
  schema_version: "restaurant-request.v2",
  latitude: 24.48,
  longitude: 118.09,
  locale: "zh-CN",
  profile: {
    selected_tags: ["japanese"],
    budget_minor: 5000,
    budget_is_explicit: true,
    currency: "CNY",
  },
  recent_intents: [],
};

beforeEach(clearRestaurantSessions);

it("rotates ranked restaurants only in module memory", () => {
  const response = parseRestaurantRecommendation(restaurantResponse());
  const id = createRestaurantSession(request, response);
  expect(getCurrentRestaurant(id)?.candidate.name).toBe("First");
  expect(pickAnotherRestaurant(id)?.candidate.name).toBe("Second");
  expect(pickAnotherRestaurant(id)).toBeNull();
  clearRestaurantSessions();
  expect(getRestaurantSession(id)).toBeNull();
});
