import type { Candidate, Place } from "../domain/contracts";
import {
  getProfile,
  getRecentHistory,
  saveDecision,
} from "../db/db";
import { normalizeLocale } from "../i18n/locale-utils";
import { defaultProfile, inferOneTapContext } from "./context";
import { NoSafeCandidate, recommendLocal } from "./engine";
import { loadRecommendationData } from "./spec";
import type {
  QuickState,
  RecommendationInput,
  RecommendationRecord,
  RuntimeData,
} from "./types";

function getRuntimeData(): Promise<RuntimeData> {
  const scope = globalThis as typeof globalThis & {
    __onedishRuntimeDataPromiseV2?: Promise<RuntimeData>;
  };
  scope.__onedishRuntimeDataPromiseV2 ??= loadRecommendationData();
  return scope.__onedishRuntimeDataPromiseV2;
}

export class RecommendationExhausted extends Error {
  readonly recoveryAction = "edit_preferences" as const;

  constructor() {
    super("No more safe choices remain in this session");
    this.name = "RecommendationExhausted";
  }
}

function candidatesFrom(data: RuntimeData): Candidate[] {
  const placeByRestaurant = new Map<string, Place>();
  for (const restaurant of data.catalog.restaurants) {
    const place = data.places.find((item) => (
      item.id === `fixture-${restaurant.id}` || item.name === restaurant.name
    ));
    if (place) placeByRestaurant.set(restaurant.id, place);
  }
  return data.catalog.dishes.flatMap((dish) => {
    const place = placeByRestaurant.get(dish.restaurant_id);
    return place ? [{ dish, place }] : [];
  });
}

async function buildRecord(
  data: RuntimeData,
  input: RecommendationInput,
  now: Date,
): Promise<RecommendationRecord> {
  let result;
  try {
    result = await recommendLocal(candidatesFrom(data), input, data.spec, now);
  } catch (error) {
    if (error instanceof NoSafeCandidate && input.session_exclusions.length > 0) {
      throw new RecommendationExhausted();
    }
    throw error;
  }
  const winner = result.ranked[0];
  if (!winner) throw new RecommendationExhausted();
  const record: RecommendationRecord = {
    schema_version: "recommendation.v2",
    locale: input.locale,
    input,
    context: input.context,
    constraints: input.constraints,
    decision: result.decision,
    ranked_candidates: result.ranked,
    winner,
    reserve: result.ranked[1] ?? null,
    winner_reason_codes: result.winnerReasonCodes,
    session_exclusions: input.session_exclusions,
  };
  await saveDecision({
    id: record.decision.decision_id,
    stateId: "recommendation.v2",
    payload: record,
  });
  return record;
}

export async function startRecommendation({
  quickState,
  now = new Date(),
}: {
  readonly quickState: QuickState;
  readonly now?: Date;
}): Promise<RecommendationRecord> {
  const data = await getRuntimeData();
  const detectedLocale = normalizeLocale(
    typeof navigator === "undefined" ? "en" : navigator.language,
  );
  const profile = await getProfile() ?? defaultProfile(detectedLocale, data.spec);
  const history = await getRecentHistory(14, now);
  const { input } = inferOneTapContext({
    now,
    profile,
    history,
    quickState,
    spec: data.spec,
    sessionExclusions: [],
  });
  return buildRecord(data, input, now);
}

export async function retryRecommendation(
  current: RecommendationRecord,
  now = new Date(),
): Promise<RecommendationRecord> {
  const data = await getRuntimeData();
  const sameDishIds = data.catalog.dishes
    .filter((dish) => dish.name === current.winner.dish.name)
    .map((dish) => dish.id);
  const exclusions = [...new Set([
    ...current.session_exclusions,
    current.winner.dish.id,
    ...sameDishIds,
  ])];
  return buildRecord(data, {
    ...current.input,
    session_exclusions: exclusions,
  }, now);
}
