import type { SupportedLocale } from "../recommendation/types";
import type { RestaurantIntentTag } from "./intent-tags";


export interface RestaurantPreferences {
  readonly selected_tags: readonly RestaurantIntentTag[];
  readonly budget_minor: number;
  readonly budget_is_explicit: boolean;
}

export function restaurantPreferenceDefaults(locale: SupportedLocale): RestaurantPreferences {
  return {
    selected_tags: [],
    budget_minor: locale === "en" ? 2500 : 6000,
    budget_is_explicit: false,
  };
}
