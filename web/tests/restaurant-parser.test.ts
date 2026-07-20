import { describe, expect, it } from "vitest";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import { restaurantResponse } from "./support/restaurant-fixtures";


function candidateWith(patch: Record<string, unknown>) {
  const response = restaurantResponse();
  response.ranked[0]!.candidate = {
    ...response.ranked[0]!.candidate,
    ...patch,
  } as typeof response.ranked[0]["candidate"];
  return response;
}

describe("restaurant V2 response parser", () => {
  it("accepts the strict V2 evidence contract", () => {
    const parsed = parseRestaurantRecommendation(restaurantResponse());
    expect(parsed.schema_version).toBe("restaurant-recommendation.v2");
    expect(parsed.active_radius_m).toBe(3000);
    expect(parsed.search_rounds.map((round) => round.radius_m)).toEqual([2000, 3000]);
    expect(parsed.ranked[0]?.matched_tags).toEqual(["japanese"]);
    expect(parsed.ranked[0]?.budget_state).toBe("within");
  });

  it.each([
    ["old schema", { schema_version: "restaurant-recommendation.v1" }],
    ["old AI field", { selection_source: "ai_rerank" }],
    ["old model field", { model_status: "selected" }],
    ["old personalization field", { recommendation_mode: "personalized" }],
    ["old trace", { trace: [] }],
  ])("rejects %s", (_label, patch) => {
    expect(() => parseRestaurantRecommendation({ ...restaurantResponse(), ...patch })).toThrow();
  });

  it.each([
    [3000, [{ radius_m: 3000, discovered_count: 1, eligible_count: 1 }]],
    [5000, [
      { radius_m: 2000, discovered_count: 1, eligible_count: 0 },
      { radius_m: 5000, discovered_count: 1, eligible_count: 1 },
    ]],
  ])("rejects a non-prefix radius sequence ending at %s", (activeRadius, rounds) => {
    expect(() => parseRestaurantRecommendation({
      ...restaurantResponse(),
      active_radius_m: activeRadius,
      search_rounds: rounds,
    })).toThrow("radius");
  });

  it("rejects duplicate candidates and a mismatched pool count", () => {
    const duplicate = restaurantResponse();
    duplicate.ranked[1] = duplicate.ranked[0]!;
    expect(() => parseRestaurantRecommendation(duplicate)).toThrow("candidate");
    expect(() => parseRestaurantRecommendation({
      ...restaurantResponse(),
      quality_pool_count: 1,
    })).toThrow("pool");
  });

  it("requires stretch overage if and only if the state is stretch", () => {
    const missing = restaurantResponse();
    missing.ranked[0]!.budget_state = "stretch";
    missing.ranked[0]!.reason_codes = ["budget_stretch"];
    expect(() => parseRestaurantRecommendation(missing)).toThrow("budget");
    const extra = restaurantResponse();
    extra.ranked[0]!.budget_overage_minor = 800 as never;
    expect(() => parseRestaurantRecommendation(extra)).toThrow("budget");
  });

  it("rejects unknown budget with a budget-match reason", () => {
    const response = restaurantResponse();
    response.ranked[0]!.budget_state = "unknown";
    response.ranked[0]!.reason_codes = ["within_budget"];
    expect(() => parseRestaurantRecommendation(response)).toThrow("budget");
  });

  it.each([
    ["unsafe navigation", candidateWith({ navigation_url: "http://example.com" })],
    ["unknown intent", candidateWith({ intent_tags: ["unknown"] })],
    ["invalid ID", candidateWith({ id: "fixture:1" })],
    ["source mismatch", candidateWith({ source_kind: "amap_place", persistence: "licensed_open_data" })],
    ["legacy cuisine tags", candidateWith({ cuisine_tags: ["fujian"] })],
    ["legacy confidence", candidateWith({ confidence: 0.8 })],
  ])("rejects candidate with %s", (_label, response) => {
    expect(() => parseRestaurantRecommendation(response)).toThrow();
  });

  it("rejects matched tags without candidate category evidence", () => {
    const response = restaurantResponse();
    response.ranked[0]!.matched_tags = ["hot_pot"];
    expect(() => parseRestaurantRecommendation(response)).toThrow("matched");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 101])(
    "rejects invalid score %s",
    (score) => {
      const response = restaurantResponse();
      response.ranked[0]!.score = score;
      expect(() => parseRestaurantRecommendation(response)).toThrow("score");
    },
  );
});
