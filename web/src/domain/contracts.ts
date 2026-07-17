export const stageIds = [
  "found",
  "available",
  "safety_budget",
  "nutrition",
  "repetition",
  "taste_confidence",
  "winner",
] as const;

export const rejectionReasons = [
  "too_heavy",
  "not_craving",
  "too_expensive",
  "had_recently",
] as const;

export type StageId = (typeof stageIds)[number];
export type RejectionReason = (typeof rejectionReasons)[number];

export interface NutritionRange {
  readonly min: number;
  readonly max: number;
}

export interface EliminationStage {
  readonly id: StageId;
  readonly input_count: number;
  readonly survivor_count: number;
  readonly reason_counts: Readonly<Record<string, number>>;
  readonly representative_removed_ids: readonly string[];
}

export interface Dish {
  readonly id: string;
  readonly restaurant_id: string;
  readonly name: string;
  readonly description: string;
  readonly price_minor: number;
  readonly currency: string;
  readonly energy_kcal: NutritionRange;
  readonly protein_g: NutritionRange;
  readonly confidence: string;
  readonly allergens: readonly string[];
  readonly possible_allergens: readonly string[];
  readonly ingredients: readonly string[];
  readonly cuisine_tags: readonly string[];
  readonly taste_tags: readonly string[];
  readonly base_ingredient: string;
  readonly image: string;
  readonly nutrition_provenance: string;
  readonly source_kind: "demo_menu";
}

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly distance_m: number;
  readonly rating: number | null;
  readonly open_state: "open" | "closed" | "unknown";
  readonly order_destination: string | null;
  readonly source_kind: "fixture_place" | "foursquare_place";
  readonly attribution: string;
}

export interface Candidate {
  readonly dish: Dish;
  readonly place: Place;
}

export interface DecisionRecord {
  readonly decision_id: string;
  readonly input_sha256: string;
  readonly stages: readonly EliminationStage[];
  readonly winner_id: string;
  readonly reserve_id: string | null;
  readonly relaxations: readonly string[];
}

export interface MealContext {
  readonly protein_gap_g: number | null;
  readonly energy_range_kcal: NutritionRange | null;
  readonly recent_categories_to_avoid: readonly string[];
  readonly comfort_preference: "warm" | null;
  readonly source_freshness: "today" | "unavailable";
  readonly wellness_context_used: boolean;
  readonly context_source: "manual" | "synthetic" | "none";
}

export interface DemoRecord {
  readonly schema_version: "demo.v1";
  readonly state_id: "day1" | "day1_rejected" | "day2";
  readonly title: string;
  readonly synthetic_demo_context: true;
  readonly catalog_version: string;
  readonly engine_version: "engine.v1";
  readonly input_sha256: string;
  readonly context: MealContext;
  readonly constraints: Readonly<Record<string, unknown>>;
  readonly history_summary: {
    readonly recent_dishes: number;
    readonly recent_base_ingredients: Readonly<Record<string, number>>;
    readonly learned_cuisine_weights: Readonly<Record<string, number>>;
    readonly learned_taste_weights: Readonly<Record<string, number>>;
  };
  readonly decision: DecisionRecord;
  readonly winner: Candidate;
  readonly reserve: Candidate | null;
  readonly feedback: Readonly<Record<string, unknown>> | null;
  readonly provenance: Readonly<Record<string, string>>;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function parseDemoRecord(value: unknown): DemoRecord {
  const root = object(value, "demo record");
  if (root.schema_version !== "demo.v1") throw new Error("Unsupported demo schema");
  if (!(["day1", "day1_rejected", "day2"] as unknown[]).includes(root.state_id)) {
    throw new Error("Unknown demo state");
  }
  if (typeof root.input_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(root.input_sha256)) {
    throw new Error("Invalid input hash");
  }
  const decision = object(root.decision, "decision");
  if (decision.input_sha256 !== root.input_sha256) throw new Error("Demo hash mismatch");
  if (!Array.isArray(decision.stages) || decision.stages.length === 0) {
    throw new Error("Decision stages are required");
  }
  let previous = Number.POSITIVE_INFINITY;
  for (const rawStage of decision.stages) {
    const stage = object(rawStage, "stage");
    const count = stage.survivor_count;
    if (typeof count !== "number" || count < 0 || count > previous) {
      throw new Error("Stage counts must be non-increasing");
    }
    if (!stageIds.includes(stage.id as StageId)) throw new Error("Unknown stage id");
    previous = count;
  }
  const last = object(decision.stages.at(-1), "last stage");
  if (last.survivor_count !== 1) throw new Error("A demo decision must end with one winner");
  return value as DemoRecord;
}
