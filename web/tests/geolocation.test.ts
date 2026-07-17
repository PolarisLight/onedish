import { LocationRequestError, requestCurrentLocation } from "../src/location/geolocation";

test("requests device location only after the function is called", async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 31.23, longitude: 121.47, accuracy: 30 } } as GeolocationPosition));
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  expect(getCurrentPosition).not.toHaveBeenCalled();
  await expect(requestCurrentLocation({ timeoutMs: 5_000 })).resolves.toEqual({ latitude: 31.23, longitude: 121.47, accuracy_m: 30, source: "device" });
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});

test("maps permission denial to a typed error", async () => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1 } as GeolocationPositionError) } });
  await expect(requestCurrentLocation({ timeoutMs: 5_000 })).rejects.toEqual(new LocationRequestError("denied"));
});
