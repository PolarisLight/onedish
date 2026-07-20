import { recommendRestaurant } from "../api/client";
import type { HistoryEventRow } from "../db/db";
import { inferMealPeriod } from "../recommendation/context";
import type { SupportedLocale, UserProfile } from "../recommendation/types";
import { createRestaurantSession } from "./session-store";
import type { RestaurantRecommendRequest, RestaurantRecommendResponse } from "./types";
import { normalizeRestaurantCuisines } from "./cuisines";

interface StartInput {
  readonly point: { readonly latitude: number; readonly longitude: number };
  readonly locale: SupportedLocale;
  readonly profile: UserProfile;
  readonly history: readonly HistoryEventRow[];
  readonly now: Date;
}

type RestaurantRequest = (payload: RestaurantRecommendRequest) => Promise<RestaurantRecommendResponse>;

interface StartOptions {
  readonly request?: RestaurantRequest;
  readonly canCommit?: () => boolean;
}

const CONSUMED_HISTORY_KINDS = new Set<HistoryEventRow["kind"]>(["accepted", "eaten"]);

export async function startRestaurantRecommendation(
  input: StartInput,
  options: StartOptions = {},
): Promise<string | null> {
  const recentCuisines: Record<string, number> = {};
  for (const event of input.history) {
    if (!CONSUMED_HISTORY_KINDS.has(event.kind)) continue;
    for (const cuisine of normalizeRestaurantCuisines(event.cuisine_tags)) {
      recentCuisines[cuisine] = (recentCuisines[cuisine] ?? 0) + 1;
    }
  }
  const response = await (options.request ?? recommendRestaurant)({
    latitude: input.point.latitude,
    longitude: input.point.longitude,
    locale: input.locale,
    meal_period: inferMealPeriod(input.now),
    profile: {
      budget_minor: input.profile.budget_minor,
      budget_is_explicit: input.profile.budget_is_explicit,
      currency: input.locale === "en" ? "USD" : "CNY",
      preferred_cuisines: normalizeRestaurantCuisines(input.profile.preferred_cuisines),
      max_distance_m: input.profile.preferred_cuisines.length > 0 ? 10000 : 3000,
    },
    history: { recent_cuisines: recentCuisines, cuisine_preferences: {} },
  });
  if (options.canCommit && !options.canCommit()) return null;
  return createRestaurantSession(response);
}
