import {
  normalizeRestaurantIntentTags,
  type RestaurantIntentTag,
} from "./intent-tags";
import type {
  RankedRestaurant,
  RestaurantBudgetState,
  RestaurantCandidate,
  RestaurantEvidence,
  RestaurantExclusionCounts,
  RestaurantReasonCode,
  RestaurantRecommendResponse,
  RestaurantSearchRound,
} from "./types";


const reasonCodes = new Set<RestaurantReasonCode>([
  "tag_match",
  "within_budget",
  "budget_stretch",
  "budget_unknown",
  "above_median_rating",
  "nearby",
  "intent_diversity",
]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(raw: Record<string, unknown>, allowed: readonly string[], label: string) {
  const keys = Object.keys(raw);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) {
    throw new Error(`Invalid ${label}`);
  }
}

function string(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function nullableString(value: unknown, label: string, maxLength: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maxLength) throw new Error(`Invalid ${label}`);
  return value;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = finiteNumber(value, label, minimum, maximum);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nullableNumber(value: unknown, label: string, minimum: number, maximum: number): number | null {
  return value === null ? null : finiteNumber(value, label, minimum, maximum);
}

function nullableInteger(value: unknown, label: string, minimum: number, maximum: number): number | null {
  return value === null ? null : integer(value, label, minimum, maximum);
}

function oneOf<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
  label: string,
): Values[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function radius(value: unknown): 2000 | 3000 | 5000 {
  if (value !== 2000 && value !== 3000 && value !== 5000) throw new Error("Invalid radius");
  return value;
}

function navigation(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Invalid navigation URL");
  try {
    if (new URL(value).protocol !== "https:") throw new Error("Invalid navigation URL");
  } catch {
    throw new Error("Invalid navigation URL");
  }
  return value;
}

function intentTags(value: unknown, label: string, maximum: number): readonly RestaurantIntentTag[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Invalid ${label}`);
  const normalized = normalizeRestaurantIntentTags(value);
  if (normalized.length !== value.length) throw new Error(`Invalid ${label}`);
  return normalized;
}

function evidence(value: unknown): RestaurantEvidence {
  const raw = object(value, "candidate evidence");
  const keys = ["distance", "rating", "average_cost", "category", "open_state"] as const;
  exactKeys(raw, keys, "candidate evidence");
  for (const key of keys) {
    if (typeof raw[key] !== "boolean") throw new Error("Invalid candidate evidence");
  }
  return {
    distance: raw.distance as boolean,
    rating: raw.rating as boolean,
    average_cost: raw.average_cost as boolean,
    category: raw.category as boolean,
    open_state: raw.open_state as boolean,
  };
}

function candidate(value: unknown): RestaurantCandidate {
  const raw = object(value, "candidate");
  exactKeys(raw, [
    "id", "name", "category", "intent_tags", "distance_m", "rating",
    "average_cost_minor", "currency", "open_state", "navigation_url",
    "source_kind", "attribution", "persistence", "evidence",
  ], "candidate");
  const id = string(raw.id, "candidate ID", 126);
  if (!/^(amap|overture):[^\s]{1,120}$/.test(id)) throw new Error("Invalid candidate ID");
  const sourceKind = oneOf(
    raw.source_kind,
    ["amap_place", "overture_place"] as const,
    "candidate source",
  );
  const persistence = oneOf(
    raw.persistence,
    ["active_only", "licensed_open_data"] as const,
    "candidate persistence",
  );
  if (
    (sourceKind === "amap_place" && persistence !== "active_only")
    || (sourceKind === "overture_place" && persistence !== "licensed_open_data")
  ) {
    throw new Error("Invalid source policy");
  }
  return {
    id,
    name: string(raw.name, "candidate name", 160),
    category: nullableString(raw.category, "candidate category", 100),
    intent_tags: intentTags(raw.intent_tags, "candidate intent tags", 6),
    distance_m: integer(raw.distance_m, "candidate distance", 0, 50_000),
    rating: nullableNumber(raw.rating, "candidate rating", 0, 5),
    average_cost_minor: nullableInteger(raw.average_cost_minor, "candidate cost", 0, 1_000_000),
    currency: raw.currency === null
      ? null
      : oneOf(raw.currency, ["CNY", "USD"] as const, "candidate currency"),
    open_state: oneOf(
      raw.open_state,
      ["open", "closed", "unknown"] as const,
      "candidate open state",
    ),
    navigation_url: navigation(raw.navigation_url),
    source_kind: sourceKind,
    attribution: string(raw.attribution, "candidate attribution", 160),
    persistence,
    evidence: evidence(raw.evidence),
  };
}

function rankedRestaurant(value: unknown): RankedRestaurant {
  const raw = object(value, "ranked restaurant");
  exactKeys(raw, [
    "candidate", "score", "matched_tags", "budget_state",
    "budget_overage_minor", "reason_codes",
  ], "ranked restaurant");
  const parsedCandidate = candidate(raw.candidate);
  const matchedTags = intentTags(raw.matched_tags, "matched tags", 6);
  if (matchedTags.some((tag) => !parsedCandidate.intent_tags.includes(tag))) {
    throw new Error("Invalid matched tags");
  }
  const budgetState = oneOf(
    raw.budget_state,
    ["not_requested", "within", "stretch", "unknown"] as const,
    "budget state",
  ) as RestaurantBudgetState;
  const overage = nullableInteger(raw.budget_overage_minor, "budget overage", 1, 1_000_000);
  if ((budgetState === "stretch") !== (overage !== null)) throw new Error("Invalid budget state");
  if (!Array.isArray(raw.reason_codes) || raw.reason_codes.length > 4) {
    throw new Error("Invalid reason codes");
  }
  const reasons = raw.reason_codes.map((reason) => {
    if (typeof reason !== "string" || !reasonCodes.has(reason as RestaurantReasonCode)) {
      throw new Error("Invalid reason codes");
    }
    return reason as RestaurantReasonCode;
  });
  const budgetReasons = reasons.filter((reason) => [
    "within_budget", "budget_stretch", "budget_unknown",
  ].includes(reason));
  const allowedBudgetReason: Readonly<Record<RestaurantBudgetState, RestaurantReasonCode | null>> = {
    not_requested: null,
    within: "within_budget",
    stretch: "budget_stretch",
    unknown: "budget_unknown",
  };
  if (budgetReasons.some((reason) => reason !== allowedBudgetReason[budgetState])) {
    throw new Error("Invalid budget reason");
  }
  return {
    candidate: parsedCandidate,
    score: finiteNumber(raw.score, "score", 0, 100),
    matched_tags: matchedTags,
    budget_state: budgetState,
    budget_overage_minor: overage,
    reason_codes: reasons,
  };
}

function searchRound(value: unknown): RestaurantSearchRound {
  const raw = object(value, "search round");
  exactKeys(raw, ["radius_m", "discovered_count", "eligible_count"], "search round");
  const discovered = integer(raw.discovered_count, "search counts", 0, 500);
  const eligible = integer(raw.eligible_count, "search counts", 0, 500);
  if (eligible > discovered) throw new Error("Invalid search counts");
  return {
    radius_m: radius(raw.radius_m),
    discovered_count: discovered,
    eligible_count: eligible,
  };
}

export function parseRestaurantSearchRounds(value: unknown): readonly RestaurantSearchRound[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new Error("Invalid search rounds");
  }
  return value.map(searchRound);
}

export function parseRestaurantExclusions(value: unknown): RestaurantExclusionCounts {
  const raw = object(value, "exclusions");
  const keys = ["closed", "outside_radius", "tag_mismatch", "excessive_budget"] as const;
  exactKeys(raw, keys, "exclusions");
  return {
    closed: integer(raw.closed, "exclusions", 0, 500),
    outside_radius: integer(raw.outside_radius, "exclusions", 0, 500),
    tag_mismatch: integer(raw.tag_mismatch, "exclusions", 0, 500),
    excessive_budget: integer(raw.excessive_budget, "exclusions", 0, 500),
  };
}

export function parseRestaurantRecommendation(value: unknown): RestaurantRecommendResponse {
  const root = object(value, "restaurant response");
  exactKeys(root, [
    "schema_version", "session_id", "active_radius_m", "search_rounds",
    "exclusions", "quality_pool_count", "ranked",
  ], "restaurant response");
  if (root.schema_version !== "restaurant-recommendation.v2") throw new Error("Invalid schema");
  if (typeof root.session_id !== "string" || !/^[a-f0-9]{32}$/.test(root.session_id)) {
    throw new Error("Invalid session");
  }
  const activeRadius = radius(root.active_radius_m);
  const rounds = parseRestaurantSearchRounds(root.search_rounds);
  const expected = [2000, 3000, 5000].slice(0, rounds.length);
  if (
    rounds.some((round, index) => round.radius_m !== expected[index])
    || rounds.at(-1)?.radius_m !== activeRadius
  ) {
    throw new Error("Invalid radius sequence");
  }
  if (!Array.isArray(root.ranked) || root.ranked.length < 1 || root.ranked.length > 5) {
    throw new Error("Invalid ranked candidates");
  }
  const ranked = root.ranked.map(rankedRestaurant);
  if (new Set(ranked.map((item) => item.candidate.id)).size !== ranked.length) {
    throw new Error("Invalid candidate IDs");
  }
  const qualityPoolCount = integer(root.quality_pool_count, "quality pool", 1, 5);
  if (qualityPoolCount !== ranked.length) throw new Error("Invalid quality pool");
  return {
    schema_version: root.schema_version,
    session_id: root.session_id,
    active_radius_m: activeRadius,
    search_rounds: rounds,
    exclusions: parseRestaurantExclusions(root.exclusions),
    quality_pool_count: qualityPoolCount,
    ranked,
  };
}
