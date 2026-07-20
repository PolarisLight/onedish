import type {
  RankedRestaurant,
  RestaurantCandidate,
  RestaurantEvidence,
  RestaurantReasonCode,
  RestaurantRecommendResponse,
  RestaurantTraceStage,
} from "./types";

const reasonCodes = new Set<RestaurantReasonCode>([
  "higher_rating",
  "budget_match",
  "taste_match",
  "history_diversity",
  "closer_than_typical",
  "high_confidence",
]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, maxLength?: number): string {
  if (typeof value !== "string" || value.length < 1 || (maxLength !== undefined && value.length > maxLength)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function nullableString(value: unknown, label: string, maxLength?: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || (maxLength !== undefined && value.length > maxLength)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
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

function stringArray(value: unknown, label: string, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function evidence(value: unknown): RestaurantEvidence {
  const raw = object(value, "candidate evidence");
  const keys = ["distance", "rating", "average_cost", "category", "open_state", "menu"] as const;
  for (const key of keys) {
    if (typeof raw[key] !== "boolean") throw new Error("Invalid candidate evidence");
  }
  return {
    distance: raw.distance as boolean,
    rating: raw.rating as boolean,
    average_cost: raw.average_cost as boolean,
    category: raw.category as boolean,
    open_state: raw.open_state as boolean,
    menu: raw.menu as boolean,
  };
}

function candidate(value: unknown): RestaurantCandidate {
  const raw = object(value, "candidate");
  const id = string(raw.id, "candidate ID");
  if (!/^(amap|overture):[^\s]{1,120}$/.test(id)) throw new Error("Invalid candidate ID");
  const sourceKind = oneOf(raw.source_kind, ["amap_place", "overture_place"] as const, "candidate source");
  const persistence = oneOf(raw.persistence, ["active_only", "licensed_open_data"] as const, "candidate persistence");
  if ((sourceKind === "amap_place" && persistence !== "active_only")
    || (sourceKind === "overture_place" && persistence !== "licensed_open_data")) {
    throw new Error("Invalid source policy");
  }
  const currency = raw.currency === null
    ? null
    : oneOf(raw.currency, ["CNY", "USD"] as const, "candidate currency");
  return {
    id,
    name: string(raw.name, "candidate name", 160),
    category: nullableString(raw.category, "candidate category", 100),
    cuisine_tags: stringArray(raw.cuisine_tags, "candidate cuisine tags", 6),
    distance_m: integer(raw.distance_m, "candidate distance", 0, 50_000),
    rating: nullableNumber(raw.rating, "candidate rating", 0, 10),
    average_cost_minor: nullableInteger(raw.average_cost_minor, "candidate average cost", 0, 1_000_000),
    currency,
    open_state: oneOf(raw.open_state, ["open", "closed", "unknown"] as const, "candidate open state"),
    navigation_url: navigation(raw.navigation_url),
    source_kind: sourceKind,
    attribution: string(raw.attribution, "candidate attribution", 160),
    confidence: finiteNumber(raw.confidence, "candidate confidence", 0, 1),
    persistence,
    evidence: evidence(raw.evidence),
  };
}

function rankedRestaurant(value: unknown): RankedRestaurant {
  const raw = object(value, "ranked restaurant");
  if (!Array.isArray(raw.reason_codes) || raw.reason_codes.length > 3
    || raw.reason_codes.some((reason) => typeof reason !== "string" || !reasonCodes.has(reason as RestaurantReasonCode))) {
    throw new Error("Invalid reason codes");
  }
  return {
    candidate: candidate(raw.candidate),
    score: finiteNumber(raw.score, "score", 0, 100),
    reason_codes: raw.reason_codes as RestaurantReasonCode[],
  };
}

function traceStage(value: unknown): RestaurantTraceStage {
  const raw = object(value, "trace stage");
  const inputCount = integer(raw.input_count, "trace counts", 0);
  const survivorCount = integer(raw.survivor_count, "trace counts", 0);
  if (survivorCount > inputCount) throw new Error("Invalid trace counts");
  return {
    id: oneOf(raw.id, ["nearby", "constraints", "habits", "winner"] as const, "trace stage"),
    input_count: inputCount,
    survivor_count: survivorCount,
  };
}

export function parseRestaurantRecommendation(value: unknown): RestaurantRecommendResponse {
  const root = object(value, "restaurant response");
  if (root.schema_version !== "restaurant-recommendation.v1") throw new Error("Invalid schema");
  if (typeof root.session_id !== "string" || !/^[a-f0-9]{32}$/.test(root.session_id)) throw new Error("Invalid session");
  if (!Array.isArray(root.ranked) || root.ranked.length < 1 || root.ranked.length > 25) throw new Error("Invalid ranked candidates");
  const ranked = root.ranked.map(rankedRestaurant);
  if (new Set(ranked.map((item) => item.candidate.id)).size !== ranked.length) throw new Error("Invalid candidate ID");
  if (!Array.isArray(root.trace) || root.trace.length < 1) throw new Error("Invalid trace");
  const trace = root.trace.map(traceStage);
  for (let index = 1; index < trace.length; index += 1) {
    if (trace[index]!.survivor_count > trace[index - 1]!.survivor_count) throw new Error("Invalid trace counts");
  }
  if (root.radius_m !== 3000 && root.radius_m !== 10000) throw new Error("Invalid radius");
  return {
    schema_version: root.schema_version,
    session_id: root.session_id,
    ranked,
    trace,
    selection_source: oneOf(root.selection_source, ["ai_rerank", "deterministic"] as const, "selection source"),
    model_status: oneOf(root.model_status, ["selected", "disabled", "timeout", "invalid", "error"] as const, "model status"),
    recommendation_mode: oneOf(root.recommendation_mode, ["exploration", "personalized"] as const, "recommendation mode"),
    radius_m: root.radius_m,
  };
}
