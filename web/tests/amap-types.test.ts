import {
  isAmapAutocompleteResult,
  isAmapLngLat,
  isAmapPlaceSearchResult,
  isAmapPoi,
} from "../src/location/amap-types";

const location = {
  longitude: 118.1,
  latitude: 24.5,
  getLng(): number { return this.longitude; },
  getLat(): number { return this.latitude; },
};
const poi = {
  id: "B0FF",
  name: "厦门万象城",
  address: "湖滨东路",
  location,
  distance: 320,
};

test("accepts representative LngLat, POI, place-search, and autocomplete shapes", () => {
  expect(isAmapLngLat(location)).toBe(true);
  expect(isAmapPoi(poi)).toBe(true);
  expect(isAmapPlaceSearchResult({
    info: "OK",
    count: 1,
    poiList: { count: 1, pageIndex: 1, pageSize: 10, pois: [poi] },
  })).toBe(true);
  expect(isAmapAutocompleteResult({
    info: "OK",
    count: 1,
    tips: [{ id: "B0FF", name: "厦门万象城", district: "思明区", location }],
  })).toBe(true);
});

it.each([
  ["partial LngLat", { getLng: (): number => 118.1 }],
  ["non-finite LngLat", { getLng: (): number => Number.NaN, getLat: (): number => 24.5 }],
  ["partial POI", { id: "B0FF" }],
  ["non-finite POI distance", { ...poi, distance: Number.POSITIVE_INFINITY }],
])("rejects malformed %s", (_label, value) => {
  if (_label.includes("LngLat")) expect(isAmapLngLat(value)).toBe(false);
  else expect(isAmapPoi(value)).toBe(false);
});

it.each([
  ["missing POI list", { info: "OK" }],
  ["partial POI", { poiList: { pois: [{ id: "B0FF" }] } }],
  ["non-finite count", { count: Number.NaN, poiList: { pois: [poi] } }],
])("rejects malformed place-search result: %s", (_label, value) => {
  expect(isAmapPlaceSearchResult(value)).toBe(false);
});

it.each([
  ["missing tips", { info: "OK" }],
  ["partial tip", { tips: [{ id: "B0FF" }] }],
  ["non-finite count", { count: Number.POSITIVE_INFINITY, tips: [] }],
])("rejects malformed autocomplete result: %s", (_label, value) => {
  expect(isAmapAutocompleteResult(value)).toBe(false);
});
