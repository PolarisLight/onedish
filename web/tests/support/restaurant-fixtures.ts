export function restaurantResponse() {
  return {
    schema_version: "restaurant-recommendation.v2",
    session_id: "a".repeat(32),
    active_radius_m: 3000,
    search_rounds: [
      { radius_m: 2000, discovered_count: 3, eligible_count: 0 },
      { radius_m: 3000, discovered_count: 8, eligible_count: 2 },
    ],
    exclusions: {
      closed: 1,
      outside_radius: 0,
      tag_mismatch: 5,
      excessive_budget: 0,
    },
    quality_pool_count: 2,
    ranked: ["First", "Second"].map((name, index) => ({
      candidate: {
        id: `overture:${index}`,
        name,
        category: index === 0 ? "日本料理" : "火锅",
        intent_tags: [index === 0 ? "japanese" : "hot_pot"],
        distance_m: 800 + index * 200,
        rating: 4.6 - index * 0.4,
        average_cost_minor: index === 0 ? 5000 : null,
        currency: index === 0 ? "CNY" : null,
        open_state: "open",
        navigation_url: "https://www.openstreetmap.org/",
        source_kind: "overture_place",
        attribution: "Overture",
        persistence: "licensed_open_data",
        evidence: {
          distance: true,
          rating: true,
          average_cost: index === 0,
          category: true,
          open_state: true,
        },
      },
      score: 80 - index,
      matched_tags: [index === 0 ? "japanese" : "hot_pot"],
      budget_state: index === 0 ? "within" : "unknown",
      budget_overage_minor: null,
      reason_codes: index === 0
        ? ["tag_match", "within_budget", "above_median_rating"]
        : ["tag_match", "budget_unknown"],
    })),
  };
}

export function restaurantRequest() {
  return {
    schema_version: "restaurant-request.v2" as const,
    latitude: 24.48,
    longitude: 118.09,
    locale: "en" as const,
    profile: {
      selected_tags: ["japanese"] as const,
      budget_minor: 5000,
      budget_is_explicit: true,
      currency: "USD" as const,
    },
    recent_intents: [],
  };
}
