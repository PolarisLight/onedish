import type { RestaurantCuisine } from "./cuisines";

export type RestaurantReasonCode =
  | "higher_rating"
  | "budget_match"
  | "taste_match"
  | "history_diversity"
  | "closer_than_typical"
  | "high_confidence";

export interface RestaurantEvidence {
  readonly distance: boolean;
  readonly rating: boolean;
  readonly average_cost: boolean;
  readonly category: boolean;
  readonly open_state: boolean;
  readonly menu: boolean;
}

export interface RestaurantCandidate {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly cuisine_tags: readonly string[];
  readonly distance_m: number;
  readonly rating: number | null;
  readonly average_cost_minor: number | null;
  readonly currency: "CNY" | "USD" | null;
  readonly open_state: "open" | "closed" | "unknown";
  readonly navigation_url: string | null;
  readonly source_kind: "amap_place" | "overture_place";
  readonly attribution: string;
  readonly confidence: number;
  readonly persistence: "active_only" | "licensed_open_data";
  readonly evidence: RestaurantEvidence;
}

export interface RankedRestaurant {
  readonly candidate: RestaurantCandidate;
  readonly score: number;
  readonly reason_codes: readonly RestaurantReasonCode[];
}

export interface RestaurantTraceStage {
  readonly id: "nearby" | "constraints" | "habits" | "winner";
  readonly input_count: number;
  readonly survivor_count: number;
}

export interface RestaurantRecommendResponse {
  readonly schema_version: "restaurant-recommendation.v1";
  readonly session_id: string;
  readonly ranked: readonly RankedRestaurant[];
  readonly trace: readonly RestaurantTraceStage[];
  readonly selection_source: "ai_rerank" | "deterministic";
  readonly model_status: "selected" | "disabled" | "timeout" | "invalid" | "error";
  readonly recommendation_mode: "exploration" | "personalized";
  readonly radius_m: 3000;
}

export interface RestaurantRecommendRequest {
  readonly latitude: number;
  readonly longitude: number;
  readonly locale: "en" | "zh-CN";
  readonly meal_period: "breakfast" | "lunch" | "dinner";
  readonly profile: {
    readonly budget_minor: number | null;
    readonly budget_is_explicit: boolean;
    readonly currency: "CNY" | "USD";
    readonly preferred_cuisines: readonly RestaurantCuisine[];
    readonly max_distance_m: 3000;
  };
  readonly history: {
    readonly recent_cuisines: Readonly<Record<string, number>>;
    readonly cuisine_preferences: Readonly<Record<string, number>>;
  };
}
