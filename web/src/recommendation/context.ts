import type { HistoryEventRow } from "../db/db";
import { formatMoney } from "../i18n/locale-utils";
import type {
  DecisionSpec,
  MealPeriod,
  QuickState,
  RecommendationInput,
  SupportedLocale,
  UserProfile,
} from "./types";


export interface OneTapContextResult {
  readonly mealPeriod: MealPeriod;
  readonly input: RecommendationInput;
  readonly summary: string;
}

export function defaultProfile(
  locale: SupportedLocale,
  spec: DecisionSpec,
): UserProfile {
  const defaults = spec.locales[locale];
  return {
    locale,
    excluded_allergens: [],
    excluded_ingredients: [],
    desired_taste_tags: [],
    budget_minor: defaults.budget_minor,
    duration_minutes: defaults.duration_minutes,
  };
}

export function inferMealPeriod(now: Date): MealPeriod {
  const hour = now.getHours();
  if (hour >= 5 && hour <= 10) return "breakfast";
  if (hour >= 11 && hour <= 14) return "lunch";
  return "dinner";
}

function counts(values: readonly (string | undefined)[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    if (value) result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function inferOneTapContext({
  now,
  profile,
  history,
  quickState,
  spec,
  sessionExclusions,
}: {
  readonly now: Date;
  readonly profile: UserProfile;
  readonly history: readonly HistoryEventRow[];
  readonly quickState: QuickState;
  readonly spec: DecisionSpec;
  readonly sessionExclusions: readonly string[];
}): OneTapContextResult {
  const mealPeriod = inferMealPeriod(now);
  const quick = quickState ? spec.quick_states[quickState] : undefined;
  const relevant = history.filter((event) => event.kind === "eaten" || event.kind === "accepted");
  const cuisines = counts(relevant.flatMap((event) => event.cuisine_tags ?? []));
  const topCuisine = Object.entries(cuisines)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  const preferences: Record<string, number> = {};
  if (quick?.avoid_top_recent_cuisine && topCuisine) preferences[topCuisine] = -0.5;
  const desiredTags = unique([
    ...profile.desired_taste_tags,
    ...spec.meal_period_tastes[mealPeriod],
    ...(quick?.desired_taste_tags ?? []),
  ]);
  const localeDefaults = spec.locales[profile.locale];
  const periodLabel = profile.locale === "en"
    ? { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" }[mealPeriod]
    : { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" }[mealPeriod];
  const durationLabel = profile.locale === "en"
    ? `${profile.duration_minutes} min`
    : `${profile.duration_minutes} 分钟`;

  return {
    mealPeriod,
    summary: `${periodLabel} / ${formatMoney(profile.budget_minor, profile.locale)} / ${durationLabel}`,
    input: {
      locale: profile.locale,
      context: {
        protein_gap_g: null,
        energy_range_kcal: null,
        recent_categories_to_avoid: [],
        comfort_preference: null,
        source_freshness: "unavailable",
        wellness_context_used: false,
        context_source: "none",
      },
      constraints: {
        max_price_minor: profile.budget_minor,
        currency: localeDefaults.currency,
        max_duration_minutes: profile.duration_minutes,
        minimum_protein_g: quick?.minimum_protein_g ?? null,
        excluded_allergens: profile.excluded_allergens,
        excluded_ingredients: profile.excluded_ingredients,
        desired_taste_tags: desiredTags,
        allowed_relaxations: spec.relaxation_order,
      },
      repetition: {
        dish_ids: counts(relevant.map((event) => event.dish_id)),
        cuisines,
        base_ingredients: counts(relevant.map((event) => event.base_ingredient)),
      },
      preferences: { cuisine: preferences, taste: {} },
      session_exclusions: [...sessionExclusions],
    },
  };
}
