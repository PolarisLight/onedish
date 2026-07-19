import { describe, expect, it } from "vitest";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import { personalizedRestaurantResponse, restaurantResponse } from "./support/restaurant-fixtures";

function candidateWith(patch: Record<string, unknown>) {
  const response = restaurantResponse();
  response.ranked[0]!.candidate = {
    ...response.ranked[0]!.candidate,
    ...patch,
  } as typeof response.ranked[0]["candidate"];
  return response;
}

describe("restaurant response parser", () => {
  it("accepts a strict valid response", () => {
    const parsed = parseRestaurantRecommendation(restaurantResponse());
    expect(parsed.recommendation_mode).toBe("exploration");
    expect(parsed.radius_m).toBe(3000);
    expect(parsed.ranked[0]!.reason_codes).toEqual(["higher_rating"]);
  });

  it("accepts personalized recommendation mode", () => {
    const response = personalizedRestaurantResponse();
    expect(parseRestaurantRecommendation(response).recommendation_mode).toBe("personalized");
  });

  it.each([
    "higher_rating",
    "budget_match",
    "taste_match",
    "history_diversity",
    "closer_than_typical",
    "high_confidence",
  ])("accepts current reason %s", (reason) => {
    const response = restaurantResponse();
    response.ranked[0]!.reason_codes = [reason];
    expect(parseRestaurantRecommendation(response).ranked[0]!.reason_codes).toEqual([reason]);
  });

  it.each([
    ["obsolete mode", { recommendation_mode: "default" }],
    ["obsolete radius", { radius_m: 1500 }],
  ])("rejects %s", (_label, patch) => {
    expect(() => parseRestaurantRecommendation({ ...restaurantResponse(), ...patch })).toThrow();
  });

  it.each(["nearby", "meal_period_match"])("rejects obsolete reason %s", (reason) => {
    const response = restaurantResponse();
    response.ranked[0]!.reason_codes = [reason];
    expect(() => parseRestaurantRecommendation(response)).toThrow("reason");
  });

  it("rejects unsafe navigation and non-monotonic counts", () => {
    const unsafe = restaurantResponse();
    unsafe.ranked[0]!.candidate.navigation_url = "javascript:alert(1)";
    expect(() => parseRestaurantRecommendation(unsafe)).toThrow("navigation");
    const growing = restaurantResponse();
    growing.trace[1]!.survivor_count = 9;
    expect(() => parseRestaurantRecommendation(growing)).toThrow("trace");
  });

  it.each([
    ["missing evidence", candidateWith({ evidence: undefined })],
    ["non-array cuisine tags", candidateWith({ cuisine_tags: "fujian" })],
    ["invalid ID prefix", candidateWith({ id: "fixture:1" })],
    ["invalid source", candidateWith({ source_kind: "fixture_place" })],
    ["source/persistence mismatch", candidateWith({ source_kind: "amap_place", persistence: "licensed_open_data" })],
  ])("rejects candidate with %s", (_label, response) => {
    expect(() => parseRestaurantRecommendation(response)).toThrow();
  });

  it.each([
    ["selection source", { selection_source: "fixture" }],
    ["model status", { model_status: "ready" }],
    ["schema", { schema_version: "restaurant-recommendation.v0" }],
    ["session", { session_id: "not-a-session" }],
  ])("rejects invalid %s", (_label, patch) => {
    expect(() => parseRestaurantRecommendation({ ...restaurantResponse(), ...patch })).toThrow();
  });

  it.each([
    ["NaN score", () => {
      const response = restaurantResponse();
      response.ranked[0]!.score = Number.NaN;
      return response;
    }],
    ["infinite score", () => {
      const response = restaurantResponse();
      response.ranked[0]!.score = Number.POSITIVE_INFINITY;
      return response;
    }],
    ["NaN rating", () => candidateWith({ rating: Number.NaN })],
    ["infinite confidence", () => candidateWith({ confidence: Number.POSITIVE_INFINITY })],
  ])("rejects %s", (_label, makeResponse) => {
    expect(() => parseRestaurantRecommendation(makeResponse())).toThrow();
  });

  it.each([
    ["fractional trace count", { input_count: 8.5 }],
    ["negative trace count", { survivor_count: -1 }],
    ["survivors above input", { input_count: 1, survivor_count: 2 }],
    ["invalid stage ID", { id: "search" }],
  ])("rejects %s", (_label, patch) => {
    const response = restaurantResponse();
    response.trace[0] = { ...response.trace[0]!, ...patch } as typeof response.trace[0];
    expect(() => parseRestaurantRecommendation(response)).toThrow("trace");
  });
});
