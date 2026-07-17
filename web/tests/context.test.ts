import { deriveMealContext, minimalRecommendationPayload } from "../src/context/derive";

describe("daily context", () => {
  it("preserves missing values and derives bounded gaps", () => {
    expect(deriveMealContext({ source: "manual" })).toMatchObject({
      protein_gap_g: null,
      energy_range_kcal: null,
      source_freshness: "unavailable",
      wellness_context_used: false,
      context_source: "none",
    });
    expect(
      deriveMealContext({
        source: "manual",
        protein_consumed_g: 72,
        daily_protein_goal_g: 110,
        meal_energy_min_kcal: 500,
        meal_energy_max_kcal: 720,
      }).protein_gap_g,
    ).toBe(38);
  });

  it("builds only the documented recommendation envelope", () => {
    const payload = minimalRecommendationPayload(
      deriveMealContext({ source: "synthetic", sleep_minutes: 342 }),
      { excluded_allergens: ["peanuts"] },
    );
    expect(Object.keys(payload)).toEqual(["context", "constraints", "repetition", "preferences"]);
    expect(JSON.stringify(payload)).not.toContain("sleep_minutes");
  });
});
