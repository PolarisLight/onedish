import { normalizeSelectedPoi, normalizeSelectedPois } from "../src/location/landmark-selection";

const valid = {
  id: "poi-1",
  name: "Zhongshan Park",
  address: "780 Changning Road",
  location: { getLng: () => 121.417, getLat: () => 31.224 },
};

test("normalizes the exact memory-only landmark shape", () => {
  expect(normalizeSelectedPoi(valid)).toEqual({
    id: "poi-1",
    name: "Zhongshan Park",
    address: "780 Changning Road",
    latitude: 31.224,
    longitude: 121.417,
  });
});

test("ignores missing-id, blank-id, missing-location, and non-finite POIs", () => {
  expect(normalizeSelectedPois([
    valid,
    { ...valid, id: "" },
    { ...valid, id: "   " },
    { ...valid, id: undefined },
    { ...valid, location: undefined },
    { ...valid, location: { getLng: () => Number.NaN, getLat: () => 31 } },
    { ...valid, location: { getLng: () => 121, getLat: () => Number.POSITIVE_INFINITY } },
    { ...valid, name: "" },
  ])).toEqual([normalizeSelectedPoi(valid)]);
});

test("rejects out-of-range coordinates and oversized provider fields", () => {
  expect(normalizeSelectedPois([
    { ...valid, location: { getLng: () => 181, getLat: () => 31 } },
    { ...valid, location: { getLng: () => -181, getLat: () => 31 } },
    { ...valid, location: { getLng: () => 121, getLat: () => 91 } },
    { ...valid, location: { getLng: () => 121, getLat: () => -91 } },
    { ...valid, id: "i".repeat(121) },
    { ...valid, name: "n".repeat(161) },
    { ...valid, address: "a".repeat(241) },
  ])).toEqual([]);
});

test("trims normal fields and deterministically keeps the first POI for a duplicate ID", () => {
  const duplicate = { ...valid, name: "Later duplicate" };
  expect(normalizeSelectedPois([
    { ...valid, id: " poi-1 ", name: " Zhongshan Park ", address: " 780 Changning Road " },
    duplicate,
    { ...valid, id: "poi-2", name: "Second park" },
  ])).toEqual([
    {
      id: "poi-1",
      name: "Zhongshan Park",
      address: "780 Changning Road",
      latitude: 31.224,
      longitude: 121.417,
    },
    {
      id: "poi-2",
      name: "Second park",
      address: "780 Changning Road",
      latitude: 31.224,
      longitude: 121.417,
    },
  ]);
});
