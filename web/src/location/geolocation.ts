export interface LocationPoint { readonly latitude: number; readonly longitude: number; readonly accuracy_m: number; readonly source: "device" }
export type LocationErrorKind = "denied" | "unavailable" | "timeout" | "unsupported";
export class LocationRequestError extends Error { constructor(readonly kind: LocationErrorKind) { super(kind); this.name = "LocationRequestError"; } }

export function requestCurrentLocation({ timeoutMs }: { readonly timeoutMs: number }): Promise<LocationPoint> {
  if (!navigator.geolocation) return Promise.reject(new LocationRequestError("unsupported"));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_m: Math.round(position.coords.accuracy), source: "device" }),
    (error) => reject(new LocationRequestError(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable")),
    { enableHighAccuracy: false, maximumAge: 300_000, timeout: timeoutMs },
  ));
}
