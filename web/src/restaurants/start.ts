import { recommendRestaurant } from "../api/client";
import type { RestaurantIntentEventRow } from "../db/db";
import type { SupportedLocale } from "../recommendation/types";
import { createRestaurantSession } from "./session-store";
import type { RestaurantPreferences } from "./preferences";
import type { RestaurantRecommendRequest, RestaurantRecommendResponse } from "./types";


interface StartInput {
  readonly point: { readonly latitude: number; readonly longitude: number };
  readonly locale: SupportedLocale;
  readonly preferences: RestaurantPreferences;
  readonly recentIntents: readonly RestaurantIntentEventRow[];
}

type RestaurantRequest = (
  payload: RestaurantRecommendRequest,
) => Promise<RestaurantRecommendResponse>;

interface StartOptions {
  readonly request?: RestaurantRequest;
  readonly canCommit?: () => boolean;
}

export async function startRestaurantRecommendation(
  input: StartInput,
  options: StartOptions = {},
): Promise<string | null> {
  const request: RestaurantRecommendRequest = {
    schema_version: "restaurant-request.v2",
    latitude: input.point.latitude,
    longitude: input.point.longitude,
    locale: input.locale,
    profile: {
      selected_tags: [...input.preferences.selected_tags],
      budget_minor: input.preferences.budget_minor,
      budget_is_explicit: input.preferences.budget_is_explicit,
      currency: input.locale === "en" ? "USD" : "CNY",
    },
    recent_intents: input.recentIntents.map((event) => ({
      occurred_at: event.occurred_at,
      selected_tags: [...event.selected_tags],
      budget_band_minor: event.budget_band_minor,
    })),
  };
  const response = await (options.request ?? recommendRestaurant)(request);
  if (options.canCommit && !options.canCommit()) return null;
  return createRestaurantSession(request, response);
}
