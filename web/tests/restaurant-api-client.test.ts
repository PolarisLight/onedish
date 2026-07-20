import { afterEach, expect, it, vi } from "vitest";
import { recommendRestaurant, RestaurantRequestError } from "../src/api/client";
import type { RestaurantRecommendRequest } from "../src/restaurants/types";


const request = {
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
} satisfies RestaurantRecommendRequest;

afterEach(() => vi.unstubAllGlobals());

it("parses bounded no-match recovery without exposing raw upstream detail", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    detail: {
      code: "no_match",
      search_rounds: [
        { radius_m: 2000, discovered_count: 2, eligible_count: 0 },
        { radius_m: 3000, discovered_count: 3, eligible_count: 0 },
        { radius_m: 5000, discovered_count: 5, eligible_count: 0 },
      ],
      exclusions: { closed: 0, outside_radius: 0, tag_mismatch: 5, excessive_budget: 0 },
      recovery_actions: ["clear_tags", "ignore_budget"],
      upstream_body: "must never escape",
    },
  }), { status: 409 })));
  const error = await recommendRestaurant(request).catch((caught) => caught);
  expect(error).toBeInstanceOf(RestaurantRequestError);
  expect(error).toMatchObject({
    status: 409,
    code: "no_match",
    recoveryActions: ["clear_tags", "ignore_budget"],
  });
  expect(String(error)).not.toContain("must never escape");
});

it("maps provider failure to a sanitized retryable error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    detail: { code: "provider_unavailable", upstream: "secret" },
  }), { status: 503 })));
  await expect(recommendRestaurant(request)).rejects.toMatchObject({
    status: 503,
    code: "provider_unavailable",
    recoveryActions: [],
  });
});
