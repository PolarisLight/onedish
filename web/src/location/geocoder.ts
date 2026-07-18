export interface GeocodedArea { readonly latitude: number; readonly longitude: number; readonly label: string }
export type GeocoderErrorKind = "empty" | "unavailable" | "not_found";
export class GeocoderError extends Error {
  constructor(readonly kind: GeocoderErrorKind) { super(kind); this.name = "GeocoderError"; }
}
const cache = new Map<string, GeocodedArea>();

export async function geocodeArea(query: string, locale: string): Promise<GeocodedArea> {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!normalized) throw new GeocoderError("empty");
  const key = `${locale}:${normalized.toLocaleLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const params = new URLSearchParams({ format: "jsonv2", limit: "1", q: normalized });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "Accept-Language": locale } });
  if (!response.ok) throw new GeocoderError("unavailable");
  const results = await response.json() as { lat?: string; lon?: string; display_name?: string }[];
  const first = results[0];
  if (!first?.lat || !first.lon) throw new GeocoderError("not_found");
  const result = { latitude: Number(first.lat), longitude: Number(first.lon), label: first.display_name ?? normalized };
  cache.set(key, result);
  return result;
}
