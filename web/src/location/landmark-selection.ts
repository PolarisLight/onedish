export interface SelectedPoi {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface LandmarkMapAdapter {
  suggest(query: string): Promise<readonly SelectedPoi[]>;
  search(query: string): Promise<readonly SelectedPoi[]>;
  showPois(pois: readonly SelectedPoi[]): void;
  focus(poi: SelectedPoi): void;
  destroy(): void;
}

export type LandmarkMapFactory = (
  container: HTMLElement,
  onPoiSelect: (poi: SelectedPoi) => void,
  signal: AbortSignal,
) => Promise<LandmarkMapAdapter>;

const MAX_ID_LENGTH = 120;
const MAX_NAME_LENGTH = 160;
const MAX_ADDRESS_LENGTH = 240;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coordinateFromLocation(location: unknown, member: "getLng" | "getLat"): number | undefined {
  if (!isRecord(location) || typeof location[member] !== "function") return undefined;
  try {
    const value = (location[member] as (this: unknown) => unknown).call(location);
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeSelectedPoi(value: unknown): SelectedPoi | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const address = typeof value.address === "string" ? value.address.trim() : "";
  const longitude = coordinateFromLocation(value.location, "getLng");
  const latitude = coordinateFromLocation(value.location, "getLat");
  if (
    !id || id.length > MAX_ID_LENGTH ||
    !name || name.length > MAX_NAME_LENGTH ||
    address.length > MAX_ADDRESS_LENGTH ||
    longitude === undefined || longitude < -180 || longitude > 180 ||
    latitude === undefined || latitude < -90 || latitude > 90
  ) return undefined;
  return { id, name, address, latitude, longitude };
}

export function normalizeSelectedPois(values: unknown): SelectedPoi[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const poi = normalizeSelectedPoi(value);
    if (!poi || seen.has(poi.id)) return [];
    seen.add(poi.id);
    return [poi];
  });
}

export function isSelectedPoi(value: unknown): value is SelectedPoi {
  return isRecord(value) &&
    typeof value.id === "string" && Boolean(value.id.trim()) && value.id.trim().length <= MAX_ID_LENGTH &&
    typeof value.name === "string" && Boolean(value.name.trim()) && value.name.trim().length <= MAX_NAME_LENGTH &&
    typeof value.address === "string" && value.address.trim().length <= MAX_ADDRESS_LENGTH &&
    typeof value.latitude === "number" && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 &&
    typeof value.longitude === "number" && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}
