export function restaurantResponse() {
  return {
    schema_version: "restaurant-recommendation.v1",
    session_id: "a".repeat(32),
    ranked: ["First", "Second"].map((name, index) => ({
      candidate: {
        id: `overture:${index}`,
        name,
        category: "restaurant",
        cuisine_tags: ["fujian"],
        distance_m: 200 + index * 100,
        rating: 4.6 - index * 0.4,
        average_cost_minor: 5000,
        currency: "CNY",
        open_state: "unknown",
        navigation_url: "https://www.openstreetmap.org/",
        source_kind: "overture_place",
        attribution: "Overture",
        confidence: 0.7 + index * 0.15,
        persistence: "licensed_open_data",
        evidence: { distance: true, rating: true, average_cost: true, category: true, open_state: false, menu: false },
      },
      score: 80 - index,
      reason_codes: index === 0 ? ["higher_rating"] : ["high_confidence"],
    })),
    trace: [
      { id: "nearby", input_count: 8, survivor_count: 8 },
      { id: "constraints", input_count: 8, survivor_count: 5 },
      { id: "habits", input_count: 5, survivor_count: 2 },
      { id: "winner", input_count: 2, survivor_count: 1 },
    ],
    selection_source: "deterministic",
    model_status: "disabled",
    recommendation_mode: "exploration" as "exploration" | "personalized",
    radius_m: 3000,
  };
}

export function personalizedRestaurantResponse() {
  const response = restaurantResponse();
  response.recommendation_mode = "personalized";
  response.ranked[0]!.reason_codes = ["budget_match", "taste_match", "history_diversity"];
  return response;
}
