import type { RestaurantIntentTag } from "./intent-tags";


export type RestaurantReasonCode =
  | "tag_match"
  | "within_budget"
  | "budget_stretch"
  | "budget_unknown"
  | "above_median_rating"
  | "nearby"
  | "intent_diversity";

export type RestaurantBudgetState = "not_requested" | "within" | "stretch" | "unknown";
export type RestaurantRecoveryAction = "clear_tags" | "ignore_budget";

export interface RestaurantEvidence {
  readonly distance: boolean;
  readonly rating: boolean;
  readonly average_cost: boolean;
  readonly category: boolean;
  readonly open_state: boolean;
}

export interface RestaurantCandidate {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly intent_tags: readonly RestaurantIntentTag[];
  readonly distance_m: number;
  readonly rating: number | null;
  readonly average_cost_minor: number | null;
  readonly currency: "CNY" | "USD" | null;
  readonly open_state: "open" | "closed" | "unknown";
  readonly navigation_url: string | null;
  readonly source_kind: "amap_place" | "overture_place";
  readonly attribution: string;
  readonly persistence: "active_only" | "licensed_open_data";
  readonly evidence: RestaurantEvidence;
}

export interface RankedRestaurant {
  readonly candidate: RestaurantCandidate;
  readonly score: number;
  readonly matched_tags: readonly RestaurantIntentTag[];
  readonly budget_state: RestaurantBudgetState;
  readonly budget_overage_minor: number | null;
  readonly reason_codes: readonly RestaurantReasonCode[];
}

export interface RestaurantSearchRound {
  readonly radius_m: 2000 | 3000 | 5000;
  readonly discovered_count: number;
  readonly eligible_count: number;
}

export interface RestaurantExclusionCounts {
  readonly closed: number;
  readonly outside_radius: number;
  readonly tag_mismatch: number;
  readonly excessive_budget: number;
}

export interface RestaurantRecommendResponse {
  readonly schema_version: "restaurant-recommendation.v2";
  readonly session_id: string;
  readonly active_radius_m: 2000 | 3000 | 5000;
  readonly search_rounds: readonly RestaurantSearchRound[];
  readonly exclusions: RestaurantExclusionCounts;
  readonly quality_pool_count: number;
  readonly ranked: readonly RankedRestaurant[];
}

export interface AcceptedIntentPayload {
  readonly occurred_at: string;
  readonly selected_tags: readonly RestaurantIntentTag[];
  readonly budget_band_minor: number | null;
}

export interface RestaurantRecommendRequest {
  readonly schema_version: "restaurant-request.v2";
  readonly latitude: number;
  readonly longitude: number;
  readonly locale: "en" | "zh-CN";
  readonly profile: {
    readonly selected_tags: readonly RestaurantIntentTag[];
    readonly budget_minor: number;
    readonly budget_is_explicit: boolean;
    readonly currency: "CNY" | "USD";
  };
  readonly recent_intents: readonly AcceptedIntentPayload[];
}
