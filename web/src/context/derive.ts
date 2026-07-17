import type { MealContext } from "../domain/contracts";

export interface DailyContextInput {
  readonly source: "manual" | "synthetic";
  readonly energy_consumed_kcal?: number | null;
  readonly protein_consumed_g?: number | null;
  readonly daily_energy_goal_kcal?: number | null;
  readonly daily_protein_goal_g?: number | null;
  readonly meal_energy_min_kcal?: number | null;
  readonly meal_energy_max_kcal?: number | null;
  readonly sleep_minutes?: number | null;
  readonly comfort_from_sleep_enabled?: boolean;
}

export function deriveMealContext(input: DailyContextInput): MealContext {
  const proteinGap =
    input.protein_consumed_g != null && input.daily_protein_goal_g != null
      ? Math.max(0, input.daily_protein_goal_g - input.protein_consumed_g)
      : null;
  const energyRange =
    input.meal_energy_min_kcal != null && input.meal_energy_max_kcal != null
      ? { min: input.meal_energy_min_kcal, max: input.meal_energy_max_kcal }
      : null;
  const used = [
    input.energy_consumed_kcal,
    input.protein_consumed_g,
    input.daily_energy_goal_kcal,
    input.daily_protein_goal_g,
    input.meal_energy_min_kcal,
    input.meal_energy_max_kcal,
    input.sleep_minutes,
  ].some((value) => value != null);
  return {
    protein_gap_g: proteinGap,
    energy_range_kcal: energyRange,
    recent_categories_to_avoid: [],
    comfort_preference:
      input.comfort_from_sleep_enabled && input.sleep_minutes != null && input.sleep_minutes < 360
        ? "warm"
        : null,
    source_freshness: used ? "today" : "unavailable",
    wellness_context_used: used,
    context_source: used ? input.source : "none",
  };
}

export function minimalRecommendationPayload(
  context: MealContext,
  constraints: Readonly<Record<string, unknown>>,
) {
  return {
    context,
    constraints,
    repetition: { dish_ids: {}, cuisines: {}, base_ingredients: {} },
    preferences: { cuisine: {}, taste: {} },
  } as const;
}
