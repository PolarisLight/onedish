import type {
  Candidate,
  DecisionRecord,
  Dish,
  MealContext,
  Place,
} from "../domain/contracts";


export type SupportedLocale = "en" | "zh-CN";
export type QuickState = "light" | "hungry" | "surprise" | null;
export type MealPeriod = "breakfast" | "lunch" | "dinner";
export type RelaxationId = "recent_repetition" | "taste" | "duration" | "budget";

export interface LocaleDefaults {
  readonly currency: "USD" | "CNY";
  readonly budget_minor: number;
  readonly duration_minutes: number;
  readonly distance_unit: "mile" | "kilometer";
  readonly usd_multiplier: number;
}

export interface DecisionSpec {
  readonly version: "decision.v2";
  readonly stage_order: readonly string[];
  readonly score: {
    readonly taste_match: number;
    readonly comfort_match: number;
    readonly confidence: Readonly<Record<"authoritative" | "high" | "medium" | "low", number>>;
    readonly distance_divisor: number;
    readonly price_divisor: number;
    readonly recent_dish: number;
    readonly recent_base_ingredient: number;
    readonly preference_scale: number;
  };
  readonly relaxation_order: readonly RelaxationId[];
  readonly meal_period_tastes: Readonly<Record<MealPeriod, readonly string[]>>;
  readonly locales: Readonly<Record<SupportedLocale, LocaleDefaults>>;
  readonly quick_states: Readonly<Record<Exclude<QuickState, null>, {
    readonly desired_taste_tags?: readonly string[];
    readonly minimum_protein_g?: number;
    readonly avoid_top_recent_cuisine?: boolean;
  }>>;
  readonly reasons: Readonly<Record<string, Readonly<Record<SupportedLocale, string>>>>;
}

export interface UserProfile {
  readonly locale: SupportedLocale;
  readonly excluded_allergens: readonly string[];
  readonly excluded_ingredients: readonly string[];
  readonly desired_taste_tags: readonly string[];
  readonly budget_minor: number;
  readonly duration_minutes: number;
}

export interface RecommendationConstraints {
  readonly max_price_minor: number;
  readonly currency: "USD" | "CNY";
  readonly max_duration_minutes: number;
  readonly minimum_protein_g: number | null;
  readonly excluded_allergens: readonly string[];
  readonly excluded_ingredients: readonly string[];
  readonly desired_taste_tags: readonly string[];
  readonly allowed_relaxations: readonly RelaxationId[];
}

export interface RecommendationInput {
  readonly locale: SupportedLocale;
  readonly context: MealContext;
  readonly constraints: RecommendationConstraints;
  readonly repetition: {
    readonly dish_ids: Readonly<Record<string, number>>;
    readonly cuisines: Readonly<Record<string, number>>;
    readonly base_ingredients: Readonly<Record<string, number>>;
  };
  readonly preferences: {
    readonly cuisine: Readonly<Record<string, number>>;
    readonly taste: Readonly<Record<string, number>>;
  };
  readonly session_exclusions: readonly string[];
}

export interface RecommendationRecord {
  readonly schema_version: "recommendation.v2";
  readonly locale: SupportedLocale;
  readonly context: MealContext;
  readonly constraints: RecommendationConstraints;
  readonly decision: DecisionRecord;
  readonly ranked_candidates: readonly Candidate[];
  readonly winner: Candidate;
  readonly reserve: Candidate | null;
  readonly winner_reason_codes: readonly string[];
  readonly session_exclusions: readonly string[];
}

export interface RuntimeCatalog {
  readonly version: "catalog.v1";
  readonly restaurants: readonly {
    readonly id: string;
    readonly name: string;
    readonly cuisine_tags: readonly string[];
    readonly source_kind: "demo_restaurant";
  }[];
  readonly dishes: readonly Dish[];
  readonly image_attribution: Readonly<Record<string, string>>;
}

export interface RuntimeData {
  readonly spec: DecisionSpec;
  readonly catalog: RuntimeCatalog;
  readonly places: readonly Place[];
}
