export const stageIds = [
  "found",
  "available",
  "safety_budget",
  "safety",
  "nutrition",
  "repetition",
  "taste_confidence",
  "taste",
  "duration",
  "budget",
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
  readonly estimated_minutes: number;
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
  readonly engine_version: "engine.v1" | "engine.v2";
  readonly catalog_version: string;
  readonly input_sha256: string;
  readonly created_at: string;
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
  readonly engine_version: "engine.v1" | "engine.v2";
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

import type { RecommendationRecord } from "../recommendation/types";

export type StoredDecision = DemoRecord | RecommendationRecord;

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

function validateTrace(root: Record<string, unknown>): void {
  const decision = object(root.decision, "decision");
  if (typeof decision.input_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(decision.input_sha256)) {
    throw new Error("Invalid input hash");
  }
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
  if (last.survivor_count !== 1) throw new Error("A decision must end with one winner");
}

export function parseRecommendationRecord(value: unknown): RecommendationRecord {
  const root = object(value, "recommendation record");
  if (root.schema_version !== "recommendation.v2") {
    throw new Error("Unsupported recommendation schema");
  }
  validateTrace(root);
  const decision = object(root.decision, "decision");
  const winner = object(root.winner, "winner");
  const winnerDish = object(winner.dish, "winner dish");
  if (typeof decision.winner_id !== "string" || winnerDish.id !== decision.winner_id) {
    throw new Error("Recommendation winner mismatch");
  }
  if (!Array.isArray(root.ranked_candidates) || !root.ranked_candidates.some((candidate) => {
    const raw = object(candidate, "ranked candidate");
    return object(raw.dish, "ranked dish").id === decision.winner_id;
  })) throw new Error("Winner must exist in ranked candidates");
  if (!Array.isArray(root.session_exclusions)) throw new Error("Session exclusions are required");
  if (root.session_exclusions.includes(decision.winner_id)) {
    throw new Error("Winner cannot be session excluded");
  }
  const input = object(root.input, "recommendation input");
  if (!Array.isArray(input.session_exclusions)) throw new Error("Input exclusions are required");
  return value as RecommendationRecord;
}

export function parseStoredDecision(value: unknown): StoredDecision {
  const root = object(value, "stored decision");
  if (root.schema_version === "demo.v1") return parseDemoRecord(value);
  return parseRecommendationRecord(value);
}
