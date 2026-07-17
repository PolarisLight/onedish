import type {
  Candidate,
  DecisionRecord,
  EliminationStage,
  StageId,
} from "../domain/contracts";
import type {
  DecisionSpec,
  RecommendationInput,
  RelaxationId,
} from "./types";


export class NoSafeCandidate extends Error {
  readonly reasonCounts: Readonly<Record<string, number>>;

  constructor(reasonCounts: Readonly<Record<string, number>>) {
    super("No safe candidate survived the required constraints");
    this.name = "NoSafeCandidate";
    this.reasonCounts = reasonCounts;
  }
}

export interface LocalRecommendationResult {
  readonly decision: DecisionRecord;
  readonly ranked: readonly Candidate[];
  readonly winnerReasonCodes: readonly string[];
}

interface FilterResult {
  readonly survivors: readonly Candidate[];
  readonly reasons: Readonly<Record<string, number>>;
}

function filterCandidates(
  candidates: readonly Candidate[],
  reasonFor: (candidate: Candidate) => string | null,
): FilterResult {
  const survivors: Candidate[] = [];
  const reasons: Record<string, number> = {};
  for (const candidate of candidates) {
    const reason = reasonFor(candidate);
    if (reason === null) survivors.push(candidate);
    else reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  return { survivors, reasons };
}

function stage(
  id: StageId,
  before: readonly Candidate[],
  after: readonly Candidate[],
  reasons: Readonly<Record<string, number>>,
): EliminationStage {
  const survivorIds = new Set(after.map((candidate) => candidate.dish.id));
  return {
    id,
    input_count: before.length,
    survivor_count: after.length,
    reason_counts: Object.fromEntries(
      Object.entries(reasons).sort(([left], [right]) => left.localeCompare(right)),
    ),
    representative_removed_ids: before
      .filter((candidate) => !survivorIds.has(candidate.dish.id))
      .map((candidate) => candidate.dish.id)
      .sort()
      .slice(0, 3),
  };
}

function localizedPriceMinor(
  candidate: Candidate,
  input: RecommendationInput,
  spec: DecisionSpec,
): number {
  return Math.round(candidate.dish.price_minor * spec.locales[input.locale].usd_multiplier);
}

function overlaps(
  candidateMin: number,
  candidateMax: number,
  targetMin: number,
  targetMax: number,
): boolean {
  return candidateMax >= targetMin && candidateMin <= targetMax;
}

function scoreCandidate(
  candidate: Candidate,
  input: RecommendationInput,
  spec: DecisionSpec,
): number {
  const dish = candidate.dish;
  const desired = new Set(input.constraints.desired_taste_tags);
  const tasteMatches = dish.taste_tags.filter((tag) => desired.has(tag)).length;
  let score = tasteMatches * spec.score.taste_match;
  if (input.context.comfort_preference && dish.taste_tags.includes(input.context.comfort_preference)) {
    score += spec.score.comfort_match;
  }
  score += spec.score.confidence[dish.confidence as keyof typeof spec.score.confidence] ?? 0;
  score -= Math.floor(candidate.place.distance_m / spec.score.distance_divisor);
  score -= Math.floor(dish.price_minor / spec.score.price_divisor);
  score -= (input.repetition.dish_ids[dish.id] ?? 0) * spec.score.recent_dish;
  score -= (input.repetition.base_ingredients[dish.base_ingredient] ?? 0)
    * spec.score.recent_base_ingredient;
  const preference = [
    ...dish.cuisine_tags.map((tag) => input.preferences.cuisine[tag] ?? 0),
    ...dish.taste_tags.map((tag) => input.preferences.taste[tag] ?? 0),
  ].reduce((total, value) => total + value, 0);
  score += Math.round(preference * spec.score.preference_scale);
  return score;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canRelax(input: RecommendationInput, relaxation: RelaxationId): boolean {
  return input.constraints.allowed_relaxations.includes(relaxation);
}

function softStage(
  id: Extract<StageId, "repetition" | "taste" | "duration" | "budget">,
  current: readonly Candidate[],
  filtered: FilterResult,
  relaxation: RelaxationId,
  input: RecommendationInput,
  relaxations: RelaxationId[],
): { readonly survivors: readonly Candidate[]; readonly trace: EliminationStage } {
  if (filtered.survivors.length > 0) {
    return {
      survivors: filtered.survivors,
      trace: stage(id, current, filtered.survivors, filtered.reasons),
    };
  }
  if (!canRelax(input, relaxation)) throw new NoSafeCandidate(filtered.reasons);
  relaxations.push(relaxation);
  return {
    survivors: current,
    trace: stage(id, current, current, filtered.reasons),
  };
}

function winnerReasons(winner: Candidate, input: RecommendationInput): readonly string[] {
  const reasons: string[] = [];
  if (winner.dish.taste_tags.some((tag) => input.constraints.desired_taste_tags.includes(tag))) {
    reasons.push("taste_match");
  }
  if (
    input.constraints.minimum_protein_g !== null
    && winner.dish.protein_g.min >= input.constraints.minimum_protein_g
  ) reasons.push("protein_match");
  if ((input.repetition.dish_ids[winner.dish.id] ?? 0) === 0) reasons.push("recent_variety");
  if (winner.dish.estimated_minutes <= input.constraints.max_duration_minutes) {
    reasons.push("duration_match");
  }
  reasons.push("confidence_match");
  return reasons.slice(0, 3);
}

export async function recommendLocal(
  candidates: readonly Candidate[],
  input: RecommendationInput,
  spec: DecisionSpec,
  now: Date,
): Promise<LocalRecommendationResult> {
  const ordered = [...candidates].sort((left, right) => left.dish.id.localeCompare(right.dish.id));
  if (ordered.length === 0) throw new NoSafeCandidate({ empty_catalog: 1 });
  const stages: EliminationStage[] = [stage("found", ordered, ordered, {})];
  const relaxations: RelaxationId[] = [];

  const available = filterCandidates(ordered, (candidate) => {
    if (candidate.place.open_state === "closed") return "place_closed";
    if (!candidate.place.order_destination) return "missing_order_destination";
    return null;
  });
  stages.push(stage("available", ordered, available.survivors, available.reasons));
  if (available.survivors.length === 0) throw new NoSafeCandidate(available.reasons);

  const allergens = new Set(input.constraints.excluded_allergens);
  const ingredients = new Set(
    input.constraints.excluded_ingredients.map((value) => value.toLocaleLowerCase()),
  );
  const sessionExclusions = new Set(input.session_exclusions);
  const safe = filterCandidates(available.survivors, (candidate) => {
    if (sessionExclusions.has(candidate.dish.id)) return "session_excluded";
    if ([...candidate.dish.allergens, ...candidate.dish.possible_allergens]
      .some((allergen) => allergens.has(allergen))) return "allergen_excluded";
    if (candidate.dish.ingredients.some((ingredient) => ingredients.has(ingredient.toLocaleLowerCase()))) {
      return "ingredient_excluded";
    }
    return null;
  });
  stages.push(stage("safety", available.survivors, safe.survivors, safe.reasons));
  if (safe.survivors.length === 0) throw new NoSafeCandidate(safe.reasons);

  let nutrition = safe.survivors;
  const nutritionReasons: Record<string, number> = {};
  const targetEnergy = input.context.energy_range_kcal;
  if (targetEnergy) {
    const energy = filterCandidates(nutrition, (candidate) => overlaps(
      candidate.dish.energy_kcal.min,
      candidate.dish.energy_kcal.max,
      targetEnergy.min,
      targetEnergy.max,
    ) ? null : "energy_outside_range");
    Object.assign(nutritionReasons, energy.reasons);
    if (energy.survivors.length > 0) nutrition = energy.survivors;
  }
  if (input.constraints.minimum_protein_g !== null) {
    const proteinFloor = input.constraints.minimum_protein_g;
    const protein = filterCandidates(nutrition, (candidate) => (
      candidate.dish.protein_g.min >= proteinFloor ? null : "protein_below_floor"
    ));
    Object.assign(nutritionReasons, protein.reasons);
    if (protein.survivors.length > 0) nutrition = protein.survivors;
  }
  stages.push(stage("nutrition", safe.survivors, nutrition, nutritionReasons));

  const repeated = filterCandidates(nutrition, (candidate) => {
    if (input.context.recent_categories_to_avoid.includes(candidate.dish.base_ingredient)) {
      return "recent_repetition";
    }
    if ((input.repetition.dish_ids[candidate.dish.id] ?? 0) >= 1) return "recent_repetition";
    if ((input.repetition.base_ingredients[candidate.dish.base_ingredient] ?? 0) >= 2) {
      return "recent_repetition";
    }
    return null;
  });
  let soft = softStage(
    "repetition",
    nutrition,
    repeated,
    "recent_repetition",
    input,
    relaxations,
  );
  stages.push(soft.trace);

  const desired = new Set(input.constraints.desired_taste_tags);
  const taste = filterCandidates(soft.survivors, (candidate) => (
    desired.size === 0 || candidate.dish.taste_tags.some((tag) => desired.has(tag))
      ? null
      : "taste_mismatch"
  ));
  soft = softStage("taste", soft.survivors, taste, "taste", input, relaxations);
  stages.push(soft.trace);

  const duration = filterCandidates(soft.survivors, (candidate) => (
    candidate.dish.estimated_minutes <= input.constraints.max_duration_minutes
      ? null
      : "too_slow"
  ));
  soft = softStage("duration", soft.survivors, duration, "duration", input, relaxations);
  stages.push(soft.trace);

  const budget = filterCandidates(soft.survivors, (candidate) => (
    localizedPriceMinor(candidate, input, spec) <= input.constraints.max_price_minor
      ? null
      : "over_budget"
  ));
  soft = softStage("budget", soft.survivors, budget, "budget", input, relaxations);
  stages.push(soft.trace);

  const ranked = [...soft.survivors].sort((left, right) => (
    scoreCandidate(right, input, spec) - scoreCandidate(left, input, spec)
    || left.place.distance_m - right.place.distance_m
    || left.dish.price_minor - right.dish.price_minor
    || left.dish.id.localeCompare(right.dish.id)
  ));
  const winner = ranked[0];
  if (!winner) throw new NoSafeCandidate({ empty_ranked_set: 1 });
  const reserve = ranked[1] ?? null;
  stages.push(stage(
    "winner",
    ranked,
    [winner],
    ranked.length > 1 ? { reserve_or_lower_score: ranked.length - 1 } : {},
  ));

  const inputHash = await sha256({
    candidates: ordered,
    input,
    rules_version: spec.version,
  });
  return {
    decision: {
      decision_id: `decision-${inputHash.slice(0, 16)}`,
      engine_version: "engine.v2",
      catalog_version: "catalog.v1",
      input_sha256: inputHash,
      created_at: now.toISOString(),
      stages,
      winner_id: winner.dish.id,
      reserve_id: reserve?.dish.id ?? null,
      relaxations,
    },
    ranked,
    winnerReasonCodes: winnerReasons(winner, input),
  };
}
