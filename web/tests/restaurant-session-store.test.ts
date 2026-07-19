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

beforeEach(clearRestaurantSessions);

it("rotates ranked restaurants only in module memory", () => {
  const response = parseRestaurantRecommendation(restaurantResponse());
  const id = createRestaurantSession(response);
  expect(getCurrentRestaurant(id)?.candidate.name).toBe("First");
  expect(pickAnotherRestaurant(id)?.candidate.name).toBe("Second");
  expect(pickAnotherRestaurant(id)).toBeNull();
  clearRestaurantSessions();
  expect(getRestaurantSession(id)).toBeNull();
});
