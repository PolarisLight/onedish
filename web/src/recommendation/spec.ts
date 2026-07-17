import type {
  DecisionSpec,
  LocaleDefaults,
  RelaxationId,
  RuntimeCatalog,
  RuntimeData,
  SupportedLocale,
} from "./types";
import type { Place } from "../domain/contracts";


function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return [...value];
}

function parseLocale(value: unknown, locale: SupportedLocale): LocaleDefaults {
  const raw = object(value, `locales.${locale}`);
  const expectedCurrency = locale === "en" ? "USD" : "CNY";
  const expectedDistance = locale === "en" ? "mile" : "kilometer";
  if (raw.currency !== expectedCurrency) throw new Error(`locales.${locale}.currency is invalid`);
  if (raw.distance_unit !== expectedDistance) {
    throw new Error(`locales.${locale}.distance_unit is invalid`);
  }
  return {
    currency: expectedCurrency,
    budget_minor: positiveNumber(raw.budget_minor, `locales.${locale}.budget_minor`),
    duration_minutes: positiveNumber(raw.duration_minutes, `locales.${locale}.duration_minutes`),
    distance_unit: expectedDistance,
    usd_multiplier: positiveNumber(raw.usd_multiplier, `locales.${locale}.usd_multiplier`),
  };
}

export function parseDecisionSpec(value: unknown): DecisionSpec {
  const root = object(value, "decision spec");
  if (root.version !== "decision.v2") throw new Error("Unsupported decision spec version");
  const score = object(root.score, "score");
  const confidence = object(score.confidence, "score.confidence");
  const relaxationOrder = strings(root.relaxation_order, "relaxation_order");
  const expectedRelaxations: RelaxationId[] = [
    "recent_repetition",
    "taste",
    "duration",
    "budget",
  ];
  if (relaxationOrder.join("|") !== expectedRelaxations.join("|")) {
    throw new Error("relaxation_order is invalid");
  }
  const locales = object(root.locales, "locales");
  const mealPeriods = object(root.meal_period_tastes, "meal_period_tastes");
  const quickStates = object(root.quick_states, "quick_states");
  const reasons = object(root.reasons, "reasons");
  for (const [code, labelsValue] of Object.entries(reasons)) {
    const labels = object(labelsValue, `reasons.${code}`);
    if (typeof labels.en !== "string" || typeof labels["zh-CN"] !== "string") {
      throw new Error(`reasons.${code} requires en and zh-CN labels`);
    }
  }

  return {
    version: "decision.v2",
    stage_order: strings(root.stage_order, "stage_order"),
    score: {
      taste_match: nonNegativeNumber(score.taste_match, "score.taste_match"),
      comfort_match: nonNegativeNumber(score.comfort_match, "score.comfort_match"),
      confidence: {
        authoritative: nonNegativeNumber(confidence.authoritative, "score.confidence.authoritative"),
        high: nonNegativeNumber(confidence.high, "score.confidence.high"),
        medium: nonNegativeNumber(confidence.medium, "score.confidence.medium"),
        low: nonNegativeNumber(confidence.low, "score.confidence.low"),
      },
      distance_divisor: positiveNumber(score.distance_divisor, "score.distance_divisor"),
      price_divisor: positiveNumber(score.price_divisor, "score.price_divisor"),
      recent_dish: nonNegativeNumber(score.recent_dish, "score.recent_dish"),
      recent_base_ingredient: nonNegativeNumber(
        score.recent_base_ingredient,
        "score.recent_base_ingredient",
      ),
      preference_scale: nonNegativeNumber(score.preference_scale, "score.preference_scale"),
    },
    relaxation_order: expectedRelaxations,
    meal_period_tastes: {
      breakfast: strings(mealPeriods.breakfast, "meal_period_tastes.breakfast"),
      lunch: strings(mealPeriods.lunch, "meal_period_tastes.lunch"),
      dinner: strings(mealPeriods.dinner, "meal_period_tastes.dinner"),
    },
    locales: {
      en: parseLocale(locales.en, "en"),
      "zh-CN": parseLocale(locales["zh-CN"], "zh-CN"),
    },
    quick_states: quickStates as DecisionSpec["quick_states"],
    reasons: reasons as DecisionSpec["reasons"],
  };
}

function parseCatalog(value: unknown): RuntimeCatalog {
  const root = object(value, "catalog");
  if (root.version !== "catalog.v1") throw new Error("Unsupported catalog version");
  if (!Array.isArray(root.restaurants) || !Array.isArray(root.dishes)) {
    throw new Error("Catalog restaurants and dishes are required");
  }
  object(root.image_attribution, "catalog.image_attribution");
  return value as RuntimeCatalog;
}

function parsePlaces(value: unknown): readonly Place[] {
  const root = object(value, "places collection");
  if (root.version !== "places.v1" || !Array.isArray(root.places)) {
    throw new Error("Unsupported places collection");
  }
  return root.places as unknown as readonly Place[];
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 15_000);
  const abort = () => timeout.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { signal: timeout.signal });
    if (!response.ok) throw new Error(`Runtime data request failed (${response.status})`);
    return await response.json() as unknown;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function loadRecommendationData(
  base = `${import.meta.env.BASE_URL}data/`,
  signal?: AbortSignal,
): Promise<RuntimeData> {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const [specValue, catalogValue, placesValue] = await Promise.all([
    fetchJson(`${normalizedBase}decision.v2.json`, signal),
    fetchJson(`${normalizedBase}catalog.v1.json`, signal),
    fetchJson(`${normalizedBase}places.v1.json`, signal),
  ]);
  return {
    spec: parseDecisionSpec(specValue),
    catalog: parseCatalog(catalogValue),
    places: parsePlaces(placesValue),
  };
}
