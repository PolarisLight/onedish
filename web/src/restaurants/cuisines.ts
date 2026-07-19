export const RESTAURANT_CUISINES = [
  "fujian",
  "sichuan",
  "cantonese",
  "japanese",
  "western",
] as const;

export type RestaurantCuisine = typeof RESTAURANT_CUISINES[number];

const supportedCuisines = new Set<string>(RESTAURANT_CUISINES);

export function normalizeRestaurantCuisines(values: unknown): RestaurantCuisine[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<RestaurantCuisine>();
  const normalized: RestaurantCuisine[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const tag = value.trim().toLowerCase();
    if (!supportedCuisines.has(tag)) continue;
    const cuisine = tag as RestaurantCuisine;
    if (seen.has(cuisine)) continue;
    seen.add(cuisine);
    normalized.push(cuisine);
  }
  return normalized;
}
