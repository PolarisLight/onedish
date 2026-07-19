import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db, resetLocalData } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { LandmarkPicker } from "../src/location/LandmarkPicker";
import { createAmapLandmarkMapFactory } from "../src/location/amap-landmark-map";
import type { AmapNamespace } from "../src/location/amap-types";
import type {
  LandmarkMapAdapter,
  LandmarkMapFactory,
  SelectedPoi,
} from "../src/location/landmark-selection";

const park: SelectedPoi = {
  id: "park-1",
  name: "Zhongshan Park",
  address: "780 Changning Road",
  latitude: 31.224,
  longitude: 121.417,
};
const station: SelectedPoi = {
  id: "station-2",
  name: "Jiangsu Road Station",
  address: "Jiangsu Road",
  latitude: 31.22,
  longitude: 121.43,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeHarness() {
  let markerSelect: (poi: SelectedPoi) => void = () => undefined;
  const adapter: LandmarkMapAdapter = {
    suggest: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
    showPois: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(),
  };
  const factory: LandmarkMapFactory = vi.fn(async (_container, onSelect) => {
    markerSelect = onSelect;
    return adapter;
  });
  return { adapter, factory, selectMarker: (poi: SelectedPoi) => markerSelect(poi) };
}

function Picker(props: { factory: LandmarkMapFactory; onConfirm?: (poi: SelectedPoi) => void }) {
  return <LandmarkPicker createMap={props.factory} onClose={() => undefined} onConfirm={props.onConfirm ?? (() => undefined)} />;
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetLocalData();
});

afterEach(() => vi.useRealTimers());

test("map movement and background interaction never select a POI", async () => {
  const harness = makeHarness();
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await waitFor(() => expect(harness.factory).toHaveBeenCalledOnce());
  const confirm = screen.getByRole("button", { name: "Search restaurants near this place" });
  expect(confirm).toBeDisabled();

  fireEvent.click(screen.getByTestId("landmark-map"));
  fireEvent.pointerMove(screen.getByTestId("landmark-map"));

  expect(confirm).toBeDisabled();
  expect(harness.adapter.focus).not.toHaveBeenCalled();
});

test("marker selection shows the exact real POI and confirms it unchanged", async () => {
  const harness = makeHarness();
  const onConfirm = vi.fn();
  render(<LocaleProvider><Picker factory={harness.factory} onConfirm={onConfirm} /></LocaleProvider>);
  await waitFor(() => expect(harness.factory).toHaveBeenCalledOnce());

  act(() => harness.selectMarker(park));

  expect(screen.getByText(park.name)).toBeVisible();
  expect(screen.getByText(park.address)).toBeVisible();
  const confirm = screen.getByRole("button", { name: "Search restaurants near this place" });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(onConfirm).toHaveBeenCalledWith(park);
});

test("an accessible search result selects its exact POI", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  vi.mocked(harness.adapter.search).mockResolvedValue([station]);
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await act(async () => Promise.resolve());

  fireEvent.change(screen.getByRole("searchbox", { name: "Search landmarks" }), { target: { value: "station" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  fireEvent.click(screen.getByRole("button", { name: /Jiangsu Road Station/ }));

  expect(screen.getAllByText(station.address)).toHaveLength(2);
  expect(harness.adapter.focus).toHaveBeenCalledWith(station);
});

test("debounces map-backed suggestions and selects an exact suggestion with matching marker and focus", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  const search = deferred<readonly SelectedPoi[]>();
  vi.mocked(harness.adapter.suggest).mockResolvedValue([park]);
  vi.mocked(harness.adapter.search).mockReturnValue(search.promise);
  const onConfirm = vi.fn();
  render(<LocaleProvider><Picker factory={harness.factory} onConfirm={onConfirm} /></LocaleProvider>);
  await act(async () => Promise.resolve());

  fireEvent.change(screen.getByRole("searchbox", { name: "Search landmarks" }), { target: { value: "park" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(249); });
  expect(harness.adapter.suggest).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(harness.adapter.suggest).toHaveBeenCalledWith("park");
  const suggestions = screen.getByRole("list", { name: "Landmark suggestions" });
  fireEvent.click(within(suggestions).getByRole("button", { name: /Zhongshan Park/ }));

  expect(harness.adapter.showPois).toHaveBeenLastCalledWith([park]);
  expect(harness.adapter.focus).toHaveBeenCalledWith(park);
  const confirm = screen.getByRole("button", { name: "Search restaurants near this place" });
  expect(confirm).toHaveFocus();
  await act(async () => search.resolve([station]));
  expect(harness.adapter.showPois).toHaveBeenLastCalledWith([park]);
  expect(screen.queryByRole("list", { name: "Landmark search results" })).not.toBeInTheDocument();
  fireEvent.click(confirm);
  expect(onConfirm).toHaveBeenCalledWith(park);
});

test("keeps suggestion and formal-result generations separate without duplicate or stale actions", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  const oldSuggestions = deferred<readonly SelectedPoi[]>();
  const newSuggestions = deferred<readonly SelectedPoi[]>();
  const formalResults = deferred<readonly SelectedPoi[]>();
  vi.mocked(harness.adapter.suggest)
    .mockReturnValueOnce(oldSuggestions.promise)
    .mockReturnValueOnce(newSuggestions.promise);
  vi.mocked(harness.adapter.search).mockReturnValue(formalResults.promise);
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await act(async () => Promise.resolve());
  const input = screen.getByRole("searchbox", { name: "Search landmarks" });

  fireEvent.change(input, { target: { value: "park" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  fireEvent.change(input, { target: { value: "station" } });
  expect(screen.queryByRole("list", { name: "Landmark suggestions" })).not.toBeInTheDocument();
  await act(async () => oldSuggestions.resolve([park]));
  expect(screen.queryByRole("button", { name: /Zhongshan Park/ })).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  await act(async () => newSuggestions.resolve([station]));
  const currentSuggestion = within(screen.getByRole("list", { name: "Landmark suggestions" }))
    .getByRole("button", { name: /Jiangsu Road Station/ });
  currentSuggestion.focus();
  expect(currentSuggestion).toHaveFocus();

  await act(async () => formalResults.resolve([station, park]));
  expect(screen.queryByRole("list", { name: "Landmark suggestions" })).not.toBeInTheDocument();
  expect(input).toHaveFocus();
  const results = screen.getByRole("list", { name: "Landmark search results" });
  expect(within(results).getAllByRole("button")).toHaveLength(2);
});

test("suggestion failure is distinct and does not clear selection or formal results", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  vi.mocked(harness.adapter.suggest).mockRejectedValue(new Error("suggest failed"));
  vi.mocked(harness.adapter.search).mockResolvedValue([station]);
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await act(async () => Promise.resolve());
  act(() => harness.selectMarker(park));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search landmarks" }), { target: { value: "station" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(screen.getByText("Landmark suggestions are unavailable.")).toBeVisible();
  expect(screen.getByRole("list", { name: "Landmark search results" })).toBeVisible();
  expect(screen.getByText("Selected meeting place")).toBeVisible();
  expect(screen.getByRole("button", { name: "Search restaurants near this place" })).toBeEnabled();
});

test("debounces input and protects newer results from stale responses", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  const oldRequest = deferred<readonly SelectedPoi[]>();
  const newRequest = deferred<readonly SelectedPoi[]>();
  vi.mocked(harness.adapter.search)
    .mockImplementationOnce(() => oldRequest.promise)
    .mockImplementationOnce(() => newRequest.promise);
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await act(async () => Promise.resolve());
  const search = screen.getByRole("searchbox", { name: "Search landmarks" });

  fireEvent.change(search, { target: { value: "park" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(249); });
  expect(harness.adapter.search).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  fireEvent.change(search, { target: { value: "station" } });
  await act(async () => oldRequest.resolve([park]));
  expect(screen.queryByRole("button", { name: /Zhongshan Park/ })).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(harness.adapter.search).toHaveBeenNthCalledWith(1, "park");
  expect(harness.adapter.search).toHaveBeenNthCalledWith(2, "station");

  await act(async () => newRequest.resolve([station]));
  expect(screen.getByRole("button", { name: /Jiangsu Road Station/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Zhongshan Park/ })).not.toBeInTheDocument();
});

test("clears prior result actions and markers throughout debounce, pending, and failure", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  const pending = deferred<readonly SelectedPoi[]>();
  vi.mocked(harness.adapter.search)
    .mockResolvedValueOnce([park])
    .mockReturnValueOnce(pending.promise);
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await act(async () => Promise.resolve());
  const search = screen.getByRole("searchbox", { name: "Search landmarks" });

  fireEvent.change(search, { target: { value: "park" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  fireEvent.click(screen.getByRole("button", { name: /Zhongshan Park/ }));
  expect(screen.getByText("Selected meeting place")).toBeVisible();

  fireEvent.change(search, { target: { value: "station" } });
  expect(screen.queryByRole("button", { name: /Zhongshan Park/ })).not.toBeInTheDocument();
  expect(harness.adapter.showPois).toHaveBeenLastCalledWith([]);
  expect(search).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Searching landmarks...");

  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  await act(async () => pending.reject(new Error("search failed")));
  expect(screen.queryByRole("button", { name: /Zhongshan Park/ })).not.toBeInTheDocument();
  expect(screen.getByText(park.name)).toBeVisible();
  expect(search).toHaveAttribute("aria-busy", "false");
});

test("announces map/search loading and a completed empty search", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  const mapLoad = deferred<LandmarkMapAdapter>();
  const factory: LandmarkMapFactory = vi.fn(() => mapLoad.promise);
  render(<LocaleProvider><Picker factory={factory} /></LocaleProvider>);
  expect(screen.getByTestId("landmark-map")).toHaveAttribute("aria-busy", "true");

  vi.mocked(harness.adapter.search).mockResolvedValue([]);
  await act(async () => mapLoad.resolve(harness.adapter));
  expect(screen.getByTestId("landmark-map")).toHaveAttribute("aria-busy", "false");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search landmarks" }), { target: { value: "unknown" } });
  expect(screen.getByRole("status")).toHaveTextContent("Searching landmarks...");
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(screen.getByRole("status")).toHaveTextContent("No landmarks found.");
});

test("runs a typed query once a slow map finishes loading", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  const mapLoad = deferred<LandmarkMapAdapter>();
  const factory: LandmarkMapFactory = vi.fn(() => mapLoad.promise);
  vi.mocked(harness.adapter.search).mockResolvedValue([park]);
  render(<LocaleProvider><Picker factory={factory} /></LocaleProvider>);

  fireEvent.change(screen.getByRole("searchbox", { name: "Search landmarks" }), { target: { value: "park" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(harness.adapter.search).not.toHaveBeenCalled();

  await act(async () => mapLoad.resolve(harness.adapter));
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(harness.adapter.search).toHaveBeenCalledWith("park");
  expect(screen.getByRole("button", { name: /Zhongshan Park/ })).toBeVisible();
});

test("bounds typed and retried landmark searches to the input limit", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  vi.mocked(harness.adapter.search).mockRejectedValue(new Error("search failed"));
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await act(async () => Promise.resolve());
  const search = screen.getByRole("searchbox", { name: "Search landmarks" });
  const oversized = "x".repeat(180);

  expect(search).toHaveAttribute("maxlength", "120");
  fireEvent.change(search, { target: { value: oversized } });
  expect(search).toHaveValue("x".repeat(120));
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(harness.adapter.search).toHaveBeenLastCalledWith("x".repeat(120));

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry search" })); });
  expect(harness.adapter.search).toHaveBeenLastCalledWith("x".repeat(120));
});

test("map load failure can retry successfully or close", async () => {
  const harness = makeHarness();
  const onClose = vi.fn();
  const factory = vi.fn<LandmarkMapFactory>()
    .mockRejectedValueOnce(new Error("private credential detail"))
    .mockResolvedValueOnce(harness.adapter);
  render(<LocaleProvider><LandmarkPicker createMap={factory} onClose={onClose} onConfirm={() => undefined} /></LocaleProvider>);

  expect(await screen.findByText("The map could not load.")).toBeVisible();
  expect(screen.queryByText(/credential/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  await waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("The map could not load.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close map" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("map load failure clears a query that was pending before the adapter existed", async () => {
  const load = deferred<LandmarkMapAdapter>();
  const factory: LandmarkMapFactory = vi.fn(() => load.promise);
  render(<LocaleProvider><Picker factory={factory} /></LocaleProvider>);
  const search = screen.getByRole("searchbox", { name: "Search landmarks" });
  fireEvent.change(search, { target: { value: "park" } });
  expect(search).toHaveAttribute("aria-busy", "true");
  await act(async () => load.reject(new Error("map failed")));

  expect(screen.getByText("The map could not load.")).toBeVisible();
  expect(search).toHaveAttribute("aria-busy", "false");
  expect(screen.queryByText("Searching landmarks...")).not.toBeInTheDocument();
});

test("search failure preserves selection and retries the current query", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  vi.mocked(harness.adapter.search)
    .mockRejectedValueOnce(new Error("provider internals"))
    .mockResolvedValueOnce([station]);
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await act(async () => Promise.resolve());
  act(() => harness.selectMarker(park));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search landmarks" }), { target: { value: "station" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(screen.getByText("Landmark search is unavailable. Try again.")).toBeVisible();
  expect(screen.getByText(park.name)).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
  await act(async () => Promise.resolve());
  expect(screen.getByRole("button", { name: /Jiangsu Road Station/ })).toBeVisible();
  expect(screen.getByText(park.name)).toBeVisible();
});

test("unmount destroys the adapter and ignores late search results", async () => {
  vi.useFakeTimers();
  const harness = makeHarness();
  const request = deferred<readonly SelectedPoi[]>();
  vi.mocked(harness.adapter.search).mockReturnValue(request.promise);
  const view = render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await act(async () => Promise.resolve());
  fireEvent.change(screen.getByRole("searchbox", { name: "Search landmarks" }), { target: { value: "park" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });

  view.unmount();
  expect(harness.adapter.destroy).toHaveBeenCalledOnce();
  await act(async () => request.resolve([park]));
  expect(screen.queryByText(park.name)).not.toBeInTheDocument();
});

test("StrictMode aborts stale production setup before constructing a map", async () => {
  const loads: Array<ReturnType<typeof deferred<AmapNamespace>>> = [];
  const maps: unknown[] = [];
  class MapConstructor {
    setCenter() { return undefined; }
    setFitView() { return undefined; }
    destroy() { return undefined; }
    add() { return undefined; }
    remove() { return undefined; }
    on() { return undefined; }
    off() { return undefined; }
    constructor() { maps.push(this); }
  }
  class PlaceSearch { search() { return undefined; } }
  class Marker {}
  class AutoComplete { search() { return undefined; } }
  const namespace = { Map: MapConstructor, PlaceSearch, Marker, AutoComplete } as unknown as AmapNamespace;
  const factory = createAmapLandmarkMapFactory({
    config: () => ({ key: "key", serviceHost: "/_AMapService" }),
    load: () => {
      const load = deferred<AmapNamespace>();
      loads.push(load);
      return load.promise;
    },
  });

  render(<StrictMode><LocaleProvider><Picker factory={factory} /></LocaleProvider></StrictMode>);
  expect(loads).toHaveLength(2);
  await act(async () => {
    loads[0]?.resolve(namespace);
    loads[1]?.resolve(namespace);
  });
  expect(maps).toHaveLength(1);
});

test("dialog, search, close, and confirmation have concise Chinese accessible names", async () => {
  const harness = makeHarness();
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);

  expect(await screen.findByRole("dialog", { name: "选择见面地点" })).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "搜索地标" })).toBeVisible();
  expect(screen.getByRole("button", { name: "关闭地图" })).toBeVisible();
  expect(screen.getByRole("button", { name: "搜索此地点附近的餐厅" })).toBeDisabled();
});

test("moves focus into the modal, contains keyboard focus, and restores it on close", async () => {
  const harness = makeHarness();
  const outside = document.createElement("button");
  document.body.append(outside);
  outside.focus();
  const view = render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  const search = screen.getByRole("searchbox", { name: "Search landmarks" });
  await waitFor(() => expect(search).toHaveFocus());

  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: "Close map" })).toHaveFocus();

  view.unmount();
  expect(outside).toHaveFocus();
  outside.remove();
});

test("isolates background siblings, locks scrolling, contains programmatic focus, and restores exact state", async () => {
  const harness = makeHarness();
  const sibling = document.createElement("button");
  sibling.setAttribute("aria-hidden", "false");
  Object.defineProperty(sibling, "inert", { configurable: true, writable: true, value: false });
  document.body.append(sibling);
  document.body.style.overflow = "clip";

  const view = render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  const search = screen.getByRole("searchbox", { name: "Search landmarks" });
  await waitFor(() => expect(search).toHaveFocus());
  expect(sibling).toHaveAttribute("aria-hidden", "true");
  expect(sibling.inert).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");

  sibling.focus();
  fireEvent.focusIn(sibling);
  expect(search).toHaveFocus();

  view.unmount();
  expect(sibling).toHaveAttribute("aria-hidden", "false");
  expect(sibling.inert).toBe(false);
  expect(document.body.style.overflow).toBe("clip");
  sibling.remove();
  document.body.style.overflow = "";
});

test("isolates body-level siblings mounted after the modal opens and restores them", async () => {
  const harness = makeHarness();
  const view = render(<LocaleProvider><Picker factory={harness.factory} /></LocaleProvider>);
  await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search landmarks" })).toHaveFocus());
  const latePortal = document.createElement("aside");
  Object.defineProperty(latePortal, "inert", { configurable: true, writable: true, value: false });

  document.body.append(latePortal);
  await waitFor(() => expect(latePortal).toHaveAttribute("aria-hidden", "true"));
  expect(latePortal.inert).toBe(true);

  view.unmount();
  expect(latePortal).not.toHaveAttribute("aria-hidden");
  expect(latePortal.inert).toBe(false);
  latePortal.remove();
});
