import { GeocoderError, geocodeArea } from "../src/location/geocoder";

test("geocoder reports typed errors instead of interface copy", async () => {
  await expect(geocodeArea("  ", "en")).rejects.toEqual(expect.objectContaining<Partial<GeocoderError>>({ kind: "empty" }));
});
