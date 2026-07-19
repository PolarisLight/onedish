import { parseDemoRecord, type DemoRecord, type Place } from "../domain/contracts";
import { parseRestaurantRecommendation } from "../restaurants/parser";
import type { RestaurantRecommendRequest, RestaurantRecommendResponse } from "../restaurants/types";

async function boundedFetch(input: string, init: RequestInit, signal?: AbortSignal) {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 15_000);
  const abort = () => timeout.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(input, { ...init, signal: timeout.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json() as Promise<unknown>;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
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
  const value = await boundedFetch(
    "/api/v1/restaurants/recommend",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    signal,
  );
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
