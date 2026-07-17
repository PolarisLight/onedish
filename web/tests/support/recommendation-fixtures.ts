import type { Candidate } from "../../src/domain/contracts";
import type {
  DecisionSpec,
  RecommendationInput,
  RecommendationConstraints,
} from "../../src/recommendation/types";
import rules from "../../public/data/decision.v2.json";
import { parseDecisionSpec } from "../../src/recommendation/spec";


export const NOW = new Date("2026-07-18T12:00:00.000Z");
export const spec: DecisionSpec = parseDecisionSpec(rules);

interface CandidateChanges {
  readonly price_minor?: number;
  readonly taste_tags?: readonly string[];
  readonly allergens?: readonly string[];
  readonly possible_allergens?: readonly string[];
  readonly ingredients?: readonly string[];
  readonly estimated_minutes?: number;
  readonly protein_min?: number;
  readonly distance_m?: number;
  readonly open_state?: "open" | "closed" | "unknown";
  readonly base_ingredient?: string;
}

export function candidate(id: string, changes: CandidateChanges = {}): Candidate {
  const baseIngredient = changes.base_ingredient ?? "rice";
  return {
    dish: {
      id,
      restaurant_id: "restaurant-1",
      name: id.replaceAll("-", " "),
      description: `A test serving of ${id}.`,
      price_minor: changes.price_minor ?? 1400,
      currency: "USD",
      energy_kcal: { min: 500, max: 650 },
      protein_g: { min: changes.protein_min ?? 35, max: 50 },
      confidence: "high",
      allergens: changes.allergens ?? [],
      possible_allergens: changes.possible_allergens ?? [],
      ingredients: changes.ingredients ?? [baseIngredient, "vegetables"],
      cuisine_tags: ["asian"],
      taste_tags: changes.taste_tags ?? ["warm", "filling"],
      base_ingredient: baseIngredient,
      image: "/food/test.webp",
      nutrition_provenance: "estimated_demo",
      source_kind: "demo_menu",
      estimated_minutes: changes.estimated_minutes ?? 20,
    },
    place: {
      id: `place-${id}`,
      name: "Test Place",
      distance_m: changes.distance_m ?? 500,
      rating: 8.5,
      open_state: changes.open_state ?? "open",
      order_destination: "https://example.com/search",
      source_kind: "fixture_place",
      attribution: "OneDish test fixture",
    },
  };
}

export function input(
  changes: Partial<RecommendationConstraints> & {
    readonly session_exclusions?: readonly string[];
  } = {},
): RecommendationInput {
  return {
    locale: "en",
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
      max_price_minor: changes.max_price_minor ?? 2500,
      currency: changes.currency ?? "USD",
      max_duration_minutes: changes.max_duration_minutes ?? 30,
      minimum_protein_g: changes.minimum_protein_g ?? null,
      excluded_allergens: changes.excluded_allergens ?? [],
      excluded_ingredients: changes.excluded_ingredients ?? [],
      desired_taste_tags: changes.desired_taste_tags ?? ["warm"],
      allowed_relaxations: changes.allowed_relaxations ?? [
        "recent_repetition",
        "taste",
        "duration",
        "budget",
      ],
    },
    repetition: { dish_ids: {}, cuisines: {}, base_ingredients: {} },
    preferences: { cuisine: {}, taste: {} },
    session_exclusions: changes.session_exclusions ?? [],
  };
}
