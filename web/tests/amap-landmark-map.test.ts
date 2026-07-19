import type { AMapLoaderConfig } from "../src/location/amap-loader";
import type { AMapSearchCallback, AmapNamespace } from "../src/location/amap-types";
import {
  createAmapLandmarkMapFactory,
  loaderConfigFromEnv,
} from "../src/location/amap-landmark-map";
import type { SelectedPoi } from "../src/location/landmark-selection";

const park: SelectedPoi = {
  id: "park-1",
  name: "Zhongshan Park",
  address: "780 Changning Road",
  latitude: 31.224,
  longitude: 121.417,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function makeAmapHarness() {
  const maps: FakeMap[] = [];
  const markers: FakeMarker[] = [];
  const autoCompletes: FakeAutoComplete[] = [];
  let searchCallback: AMapSearchCallback | undefined;
  const suggestionCallbacks: AMapSearchCallback[] = [];
  const search = vi.fn((_query: string, callback: AMapSearchCallback) => { searchCallback = callback; });
  const suggest = vi.fn((_query: string, callback: AMapSearchCallback) => { suggestionCallbacks.push(callback); });

  class FakeMap {
    readonly setCenter = vi.fn();
    readonly setFitView = vi.fn();
    readonly destroy = vi.fn();
    readonly add = vi.fn();
    readonly remove = vi.fn();
    readonly on = vi.fn();
    readonly off = vi.fn();
    constructor(readonly container: string | HTMLElement, readonly options?: unknown) { maps.push(this); }
  }
  class FakeMarker {
    readonly handlers = new Map<string, (event: unknown) => void>();
    readonly on = vi.fn((event: string, handler: (event: unknown) => void) => this.handlers.set(event, handler));
    readonly off = vi.fn((event: string, handler: (event: unknown) => void) => {
      if (this.handlers.get(event) === handler) this.handlers.delete(event);
    });
    readonly setMap = vi.fn();
    readonly getPosition = vi.fn();
    readonly setPosition = vi.fn();
    constructor(readonly options?: unknown) { markers.push(this); }
  }
  class FakePlaceSearch {
    readonly search = search;
  }
  class FakeAutoComplete {
    readonly search = suggest;
    constructor(readonly options?: unknown) { autoCompletes.push(this); }
  }
  const namespace = {
    Map: FakeMap,
    Marker: FakeMarker,
    PlaceSearch: FakePlaceSearch,
    AutoComplete: FakeAutoComplete,
  } as unknown as AmapNamespace;
  return {
    maps,
    markers,
    autoCompletes,
    namespace,
    search,
    suggest,
    callback: () => searchCallback,
    suggestionCallback: (index: number) => suggestionCallbacks[index],
  };
}

function makeFailingAmapHarness(options: { placeSearch?: boolean; markerAt?: number }) {
  const base = makeAmapHarness();
  let markerCount = 0;
  class FailingPlaceSearch {
    constructor() {
      if (options.placeSearch) throw new Error("place search constructor failed");
    }
    search() { return undefined; }
  }
  class FailingMarker {
    readonly handlers = new Map<string, (event: unknown) => void>();
    readonly on = vi.fn((event: string, handler: (event: unknown) => void) => this.handlers.set(event, handler));
    readonly off = vi.fn((event: string, handler: (event: unknown) => void) => {
      if (this.handlers.get(event) === handler) this.handlers.delete(event);
    });
    readonly setMap = vi.fn();
    readonly getPosition = vi.fn();
    readonly setPosition = vi.fn();
    constructor(readonly markerOptions?: unknown) {
      markerCount += 1;
      if (markerCount === options.markerAt) throw new Error("marker constructor failed");
      base.markers.push(this as never);
    }
  }
  return {
    ...base,
    namespace: {
      ...(base.namespace as unknown as Record<string, unknown>),
      PlaceSearch: FailingPlaceSearch,
      Marker: FailingMarker,
    } as unknown as AmapNamespace,
  };
}

const config: AMapLoaderConfig = { key: "public-key", serviceHost: "/_AMapService" };

test("uses a nonblank service host instead of plaintext security configuration", () => {
  expect(loaderConfigFromEnv({
    VITE_AMAP_JS_KEY: " public-key ",
    VITE_AMAP_SERVICE_HOST: " /_AMapService ",
    VITE_AMAP_SECURITY_CODE: "must-not-be-used",
  })).toEqual({ key: "public-key", serviceHost: "/_AMapService" });
});

test("uses the development security code when no proxy host is configured", () => {
  expect(loaderConfigFromEnv({
    VITE_AMAP_JS_KEY: "public-key",
    VITE_AMAP_SERVICE_HOST: "   ",
    VITE_AMAP_SECURITY_CODE: "security-code",
  })).toEqual({ key: "public-key", securityCode: "security-code" });
});

test("never returns a loader config without the required public key", () => {
  expect(() => loaderConfigFromEnv({ VITE_AMAP_JS_KEY: "", VITE_AMAP_SECURITY_CODE: "secret" }))
    .toThrow("AMap JS credentials are not configured");
});

test("aborts after a deferred loader without constructing a stale map", async () => {
  const amap = makeAmapHarness();
  const load = deferred<AmapNamespace>();
  const factory = createAmapLandmarkMapFactory({ load: () => load.promise, config: () => config });
  const controller = new AbortController();
  const pending = factory(document.createElement("div"), vi.fn(), controller.signal);
  controller.abort();
  load.resolve(amap.namespace);

  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(amap.maps).toHaveLength(0);
});

test("translates real PlaceSearch statuses and normalizes provider POIs", async () => {
  const amap = makeAmapHarness();
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), vi.fn(), new AbortController().signal);
  expect(amap.maps).toHaveLength(1);

  const complete = adapter.search("park");
  amap.callback()?.("complete", { poiList: { pois: [
    { id: " park-1 ", name: " Zhongshan Park ", address: " 780 Changning Road ", location: { getLng: () => 121.417, getLat: () => 31.224 } },
    { id: "park-1", name: "duplicate", location: { getLng: () => 121, getLat: () => 31 } },
    { id: "bad", name: "bad", location: { getLng: () => 500, getLat: () => 31 } },
  ] } });
  await expect(complete).resolves.toEqual([park]);

  const empty = adapter.search("nothing");
  amap.callback()?.("no_data", {});
  await expect(empty).resolves.toEqual([]);

  const failed = adapter.search("failure");
  amap.callback()?.("error", {});
  await expect(failed).rejects.toThrow("AMap landmark search failed");
});

test("constructs POI-only AutoComplete and normalizes complete/no-data/error suggestions", async () => {
  const amap = makeAmapHarness();
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), vi.fn(), new AbortController().signal);
  expect(amap.autoCompletes).toHaveLength(1);
  expect(amap.autoCompletes[0]?.options).toEqual({ datatype: "poi" });

  const complete = adapter.suggest("park");
  amap.suggestionCallback(0)?.("complete", { tips: [
    { id: " park-1 ", name: " Zhongshan Park ", address: " 780 Changning Road ", location: { getLng: () => 121.417, getLat: () => 31.224 } },
    { id: "park-1", name: "duplicate", location: { getLng: () => 121, getLat: () => 31 } },
    { id: "district", name: "Shanghai" },
    { id: "bad-range", name: "Bad", location: { getLng: () => 181, getLat: () => 31 } },
    { id: "long", name: "n".repeat(161), location: { getLng: () => 121, getLat: () => 31 } },
  ] });
  await expect(complete).resolves.toEqual([park]);

  const empty = adapter.suggest("nothing");
  amap.suggestionCallback(1)?.("no_data", {});
  await expect(empty).resolves.toEqual([]);

  const failed = adapter.suggest("failure");
  amap.suggestionCallback(2)?.("error", {});
  await expect(failed).rejects.toThrow("AMap landmark suggestions failed");
});

test("settles stale and destroyed AutoComplete work without accepting late callbacks", async () => {
  const amap = makeAmapHarness();
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), vi.fn(), new AbortController().signal);

  const stale = adapter.suggest("old");
  const current = adapter.suggest("new");
  await expect(stale).resolves.toEqual([]);
  amap.suggestionCallback(0)?.("complete", { tips: [{
    id: "old", name: "Old", location: { getLng: () => 121, getLat: () => 31 },
  }] });
  amap.suggestionCallback(1)?.("complete", { tips: [{
    id: park.id, name: park.name, address: park.address,
    location: { getLng: () => park.longitude, getLat: () => park.latitude },
  }] });
  await expect(current).resolves.toEqual([park]);

  const duringDestroy = adapter.suggest("pending");
  adapter.destroy();
  await expect(duringDestroy).resolves.toEqual([]);
  amap.suggestionCallback(2)?.("complete", { tips: [{
    id: park.id, name: park.name, location: { getLng: () => park.longitude, getLat: () => park.latitude },
  }] });
  const calls = amap.suggest.mock.calls.length;
  await expect(adapter.suggest("after destroy")).resolves.toEqual([]);
  expect(amap.suggest).toHaveBeenCalledTimes(calls);
});

test("settles pending PlaceSearch work when destroyed and ignores its late callback", async () => {
  const amap = makeAmapHarness();
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), vi.fn(), new AbortController().signal);

  const pending = adapter.search("pending");
  adapter.destroy();
  await expect(pending).resolves.toEqual([]);
  amap.callback()?.("complete", { poiList: { pois: [{
    id: park.id, name: park.name, location: { getLng: () => park.longitude, getLat: () => park.latitude },
  }] } });
  const calls = amap.search.mock.calls.length;
  await expect(adapter.search("after destroy")).resolves.toEqual([]);
  expect(amap.search).toHaveBeenCalledTimes(calls);
});

test("creates selectable markers, fits their viewport, focuses, and fully destroys resources", async () => {
  const amap = makeAmapHarness();
  const onSelect = vi.fn();
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), onSelect, new AbortController().signal);

  adapter.showPois([park]);
  expect(amap.markers).toHaveLength(1);
  expect(amap.maps[0]?.setFitView).toHaveBeenCalledWith(amap.markers);
  amap.markers[0]?.handlers.get("click")?.({});
  expect(onSelect).toHaveBeenCalledWith(park);

  adapter.focus(park);
  expect(amap.maps[0]?.setCenter).toHaveBeenCalledWith([park.longitude, park.latitude]);
  adapter.destroy();
  expect(amap.markers[0]?.off).toHaveBeenCalledWith("click", expect.any(Function));
  expect(amap.markers[0]?.setMap).toHaveBeenCalledWith(null);
  expect(amap.maps[0]?.destroy).toHaveBeenCalledOnce();

  const callsBefore = amap.search.mock.calls.length;
  await expect(adapter.search("after destroy")).resolves.toEqual([]);
  expect(amap.search).toHaveBeenCalledTimes(callsBefore);
});

test("destroys a newly created map when adapter construction fails", async () => {
  const amap = makeFailingAmapHarness({ placeSearch: true });
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });

  await expect(factory(document.createElement("div"), vi.fn(), new AbortController().signal))
    .rejects.toThrow("place search constructor failed");
  expect(amap.maps).toHaveLength(1);
  expect(amap.maps[0]?.destroy).toHaveBeenCalledOnce();
});

test("rolls back a partially created marker batch when a later marker fails", async () => {
  const amap = makeFailingAmapHarness({ markerAt: 2 });
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), vi.fn(), new AbortController().signal);
  const second = { ...park, id: "park-2", name: "Second Park" };

  expect(() => adapter.showPois([park, second])).toThrow("marker constructor failed");
  expect(amap.markers).toHaveLength(1);
  expect(amap.markers[0]?.off).toHaveBeenCalledWith("click", expect.any(Function));
  expect(amap.markers[0]?.setMap).toHaveBeenCalledWith(null);
  expect(amap.maps[0]?.setFitView).not.toHaveBeenCalled();
});

test("best-effort cleanup continues after off throws and destroy still tears down the map", async () => {
  const amap = makeAmapHarness();
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), vi.fn(), new AbortController().signal);
  adapter.showPois([park, { ...park, id: "park-2", name: "Second Park" }]);
  amap.markers[0]?.off.mockImplementationOnce(() => { throw new Error("off cleanup failed"); });
  amap.maps[0]?.destroy.mockImplementationOnce(() => { throw new Error("map destroy failed"); });

  expect(() => adapter.destroy()).toThrow("off cleanup failed");
  expect(amap.markers[0]?.setMap).toHaveBeenCalledWith(null);
  expect(amap.markers[1]?.off).toHaveBeenCalledWith("click", expect.any(Function));
  expect(amap.markers[1]?.setMap).toHaveBeenCalledWith(null);
  expect(amap.maps[0]?.destroy).toHaveBeenCalledOnce();
  expect(() => adapter.destroy()).not.toThrow();
});

test("best-effort cleanup continues after setMap throws", async () => {
  const amap = makeAmapHarness();
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), vi.fn(), new AbortController().signal);
  adapter.showPois([park, { ...park, id: "park-2", name: "Second Park" }]);
  amap.markers[0]?.setMap.mockImplementationOnce(() => { throw new Error("marker detach failed"); });

  expect(() => adapter.destroy()).toThrow("marker detach failed");
  expect(amap.markers[1]?.off).toHaveBeenCalledWith("click", expect.any(Function));
  expect(amap.markers[1]?.setMap).toHaveBeenCalledWith(null);
  expect(amap.maps[0]?.destroy).toHaveBeenCalledOnce();
});

test("rolls back the new marker batch when fitting the viewport fails", async () => {
  const amap = makeAmapHarness();
  const factory = createAmapLandmarkMapFactory({ load: async () => amap.namespace, config: () => config });
  const adapter = await factory(document.createElement("div"), vi.fn(), new AbortController().signal);
  amap.maps[0]?.setFitView.mockImplementationOnce(() => { throw new Error("fit view failed"); });

  expect(() => adapter.showPois([park, { ...park, id: "park-2", name: "Second Park" }]))
    .toThrow("fit view failed");
  for (const marker of amap.markers) {
    expect(marker.off).toHaveBeenCalledWith("click", expect.any(Function));
    expect(marker.setMap).toHaveBeenCalledWith(null);
  }
  expect(() => adapter.showPois([park])).not.toThrow();
  expect(amap.maps[0]?.setFitView).toHaveBeenCalledTimes(2);
});
