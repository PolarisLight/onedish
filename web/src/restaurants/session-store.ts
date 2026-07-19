import type { RankedRestaurant, RestaurantRecommendResponse } from "./types";

export interface ActiveRestaurantSession {
  readonly response: RestaurantRecommendResponse;
  index: number;
}

const sessions = new Map<string, ActiveRestaurantSession>();

export function createRestaurantSession(response: RestaurantRecommendResponse): string {
  sessions.clear();
  sessions.set(response.session_id, { response, index: 0 });
  return response.session_id;
}

export function getRestaurantSession(id: string): ActiveRestaurantSession | null {
  return sessions.get(id) ?? null;
}

export function getCurrentRestaurant(id: string): RankedRestaurant | null {
  const session = sessions.get(id);
  return session?.response.ranked[session.index] ?? null;
}

export function pickAnotherRestaurant(id: string): RankedRestaurant | null {
  const session = sessions.get(id);
  if (!session || session.index + 1 >= session.response.ranked.length) return null;
  session.index += 1;
  return session.response.ranked[session.index] ?? null;
}

export function clearRestaurantSessions(): void {
  sessions.clear();
}
