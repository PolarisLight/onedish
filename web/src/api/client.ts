import { parseDemoRecord, type DemoRecord, type Place } from "../domain/contracts";
import {
  parseRestaurantExclusions,
  parseRestaurantRecommendation,
  parseRestaurantSearchRounds,
} from "../restaurants/parser";
import type {
  RestaurantExclusionCounts,
  RestaurantRecommendRequest,
  RestaurantRecommendResponse,
  RestaurantRecoveryAction,
  RestaurantSearchRound,
} from "../restaurants/types";

export class RestaurantRequestError extends Error {
  constructor(
    readonly status: 409 | 503,
    readonly code: "no_match" | "provider_unavailable",
    readonly recoveryActions: readonly RestaurantRecoveryAction[] = [],
    readonly searchRounds: readonly RestaurantSearchRound[] = [],
    readonly exclusions: RestaurantExclusionCounts | null = null,
  ) {
    super(code);
    this.name = "RestaurantRequestError";
  }
}

async function boundedResponse(input: string, init: RequestInit, signal?: AbortSignal) {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 15_000);
  const abort = () => timeout.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    return await fetch(input, { ...init, signal: timeout.signal });
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function boundedFetch(input: string, init: RequestInit, signal?: AbortSignal) {
  const response = await boundedResponse(input, init, signal);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<unknown>;
}

export async function recommend(payload: unknown, signal?: AbortSignal) {
  return boundedFetch(
    "/api/v1/recommend",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    signal,
  );
}

export async function recommendRestaurant(
  payload: RestaurantRecommendRequest,
  signal?: AbortSignal,
): Promise<RestaurantRecommendResponse> {
  const response = await boundedResponse(
    "/api/v1/restaurants/recommend",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    signal,
  );
  const value = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const detail = typeof value === "object" && value !== null
      && typeof (value as { detail?: unknown }).detail === "object"
      && (value as { detail?: unknown }).detail !== null
      ? (value as { detail: Record<string, unknown> }).detail
      : null;
    if (response.status === 409 && detail?.code === "no_match") {
      const actions = Array.isArray(detail.recovery_actions)
        ? detail.recovery_actions.filter(
          (action): action is RestaurantRecoveryAction => action === "clear_tags" || action === "ignore_budget",
        )
        : [];
      throw new RestaurantRequestError(
        409,
        "no_match",
        actions,
        parseRestaurantSearchRounds(detail.search_rounds),
        parseRestaurantExclusions(detail.exclusions),
      );
    }
    if (response.status === 503 && detail?.code === "provider_unavailable") {
      throw new RestaurantRequestError(503, "provider_unavailable");
    }
    throw new Error(`Request failed (${response.status})`);
  }
  return parseRestaurantRecommendation(value);
}

export async function findNearbyPlaces(
  point: { readonly latitude: number; readonly longitude: number },
  signal?: AbortSignal,
): Promise<readonly Place[]> {
  const payload = await boundedFetch(
    "/api/v1/places/nearby",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: point.latitude,
        longitude: point.longitude,
        radius_m: 3000,
        limit: 10,
      }),
    },
    signal,
  );
  if (!Array.isArray(payload)) throw new Error("Invalid nearby response");
  return payload.filter((place): place is Place => (
    typeof place === "object" && place !== null
    && typeof (place as Place).id === "string"
    && typeof (place as Place).name === "string"
    && typeof (place as Place).distance_m === "number"
  ));
}

export async function loadDemo(
  state: "day1" | "day1_rejected" | "day2" = "day1",
  signal?: AbortSignal,
): Promise<DemoRecord> {
  return parseDemoRecord(
    await boundedFetch(`${import.meta.env.BASE_URL}demo/${state}.json`, { method: "GET" }, signal),
  );
}
