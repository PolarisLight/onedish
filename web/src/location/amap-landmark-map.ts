import { loadAmap, type AMapLoaderConfig } from "./amap-loader";
import type {
  AMapAutocompleteResult,
  AMapEventHandler,
  AMapMarker,
  AMapPlaceSearchResult,
  AmapNamespace,
} from "./amap-types";
import {
  normalizeSelectedPois,
  type LandmarkMapAdapter,
  type LandmarkMapFactory,
  type SelectedPoi,
} from "./landmark-selection";

interface AmapEnvironment {
  readonly VITE_AMAP_JS_KEY?: string;
  readonly VITE_AMAP_SERVICE_HOST?: string;
  readonly VITE_AMAP_SECURITY_CODE?: string;
}

interface AmapLandmarkFactoryDependencies {
  readonly load: (config: AMapLoaderConfig) => Promise<AmapNamespace>;
  readonly config: () => AMapLoaderConfig;
}

const CONFIG_ERROR = "AMap JS credentials are not configured";

type CleanupResult = { readonly ok: true } | { readonly ok: false; readonly error: unknown };

function attemptCleanup(result: CleanupResult, action: () => void): CleanupResult {
  try {
    action();
    return result;
  } catch (error) {
    // Cleanup is best-effort; keep the first failure while continuing every later action.
    return result.ok ? { ok: false, error } : result;
  }
}

export function loaderConfigFromEnv(env: AmapEnvironment): AMapLoaderConfig {
  const key = env.VITE_AMAP_JS_KEY?.trim() ?? "";
  if (!key) throw new Error(CONFIG_ERROR);
  const serviceHost = env.VITE_AMAP_SERVICE_HOST?.trim();
  if (serviceHost) return { key, serviceHost };
  const securityCode = env.VITE_AMAP_SECURITY_CODE?.trim() ?? "";
  if (!securityCode) throw new Error(CONFIG_ERROR);
  return { key, securityCode };
}

function poisFromResult(result: unknown): SelectedPoi[] {
  if (typeof result !== "object" || result === null || !("poiList" in result)) return [];
  const poiList = (result as Partial<AMapPlaceSearchResult>).poiList;
  return normalizeSelectedPois(poiList?.pois);
}

function tipsFromResult(result: unknown): SelectedPoi[] {
  if (typeof result !== "object" || result === null || !("tips" in result)) return [];
  return normalizeSelectedPois((result as Partial<AMapAutocompleteResult>).tips);
}

interface PendingRequest {
  readonly resolve: (pois: readonly SelectedPoi[]) => void;
  readonly reject: (error: Error) => void;
}

class AmapLandmarkAdapter implements LandmarkMapAdapter {
  private readonly map;
  private readonly placeSearch;
  private readonly autoComplete;
  private markers: Array<{ marker: AMapMarker; click: AMapEventHandler }> = [];
  private suggestionSequence = 0;
  private readonly pendingSearches = new Set<PendingRequest>();
  private readonly pendingSuggestions = new Map<number, PendingRequest>();
  private destroyed = false;

  constructor(
    private readonly amap: AmapNamespace,
    container: HTMLElement,
    private readonly onPoiSelect: (poi: SelectedPoi) => void,
    signal: AbortSignal,
  ) {
    throwIfAborted(signal);
    this.map = new amap.Map(container, { center: [118.0894, 24.4798], zoom: 14 });
    try {
      throwIfAborted(signal);
      this.placeSearch = new amap.PlaceSearch({ pageSize: 20 });
      throwIfAborted(signal);
      this.autoComplete = new amap.AutoComplete({ datatype: "poi" });
      throwIfAborted(signal);
    } catch (error) {
      try {
        this.map.destroy();
      } catch {
        // Preserve the construction/abort failure that initiated cleanup.
      }
      throw error;
    }
  }

  suggest(query: string): Promise<readonly SelectedPoi[]> {
    if (this.destroyed) return Promise.resolve([]);
    this.settleSuggestions();
    const request = ++this.suggestionSequence;
    return new Promise((resolve, reject) => {
      this.pendingSuggestions.set(request, { resolve, reject });
      try {
        this.autoComplete.search(query, (status, result) => {
          const pending = this.pendingSuggestions.get(request);
          if (!pending) return;
          this.pendingSuggestions.delete(request);
          if (this.destroyed || request !== this.suggestionSequence) return pending.resolve([]);
          if (status === "complete") return pending.resolve(tipsFromResult(result));
          if (status === "no_data") return pending.resolve([]);
          pending.reject(new Error("AMap landmark suggestions failed"));
        });
      } catch {
        const pending = this.pendingSuggestions.get(request);
        this.pendingSuggestions.delete(request);
        pending?.reject(new Error("AMap landmark suggestions failed"));
      }
    });
  }

  search(query: string): Promise<readonly SelectedPoi[]> {
    if (this.destroyed) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject };
      this.pendingSearches.add(pending);
      try {
        this.placeSearch.search(query, (status, result) => {
          if (!this.pendingSearches.delete(pending)) return;
          if (this.destroyed) return resolve([]);
          if (status === "complete") return resolve(poisFromResult(result));
          if (status === "no_data") return resolve([]);
          reject(new Error("AMap landmark search failed"));
        });
      } catch {
        this.pendingSearches.delete(pending);
        reject(new Error("AMap landmark search failed"));
      }
    });
  }

  showPois(pois: readonly SelectedPoi[]): void {
    if (this.destroyed) return;
    this.clearMarkers();
    const nextMarkers: Array<{ marker: AMapMarker; click: AMapEventHandler }> = [];
    try {
      for (const poi of pois) {
        const marker = new this.amap.Marker({
          map: this.map,
          position: [poi.longitude, poi.latitude],
          title: poi.name,
        });
        const click = () => this.onPoiSelect(poi);
        nextMarkers.push({ marker, click });
        marker.on("click", click);
      }
    } catch (error) {
      this.removeMarkers(nextMarkers);
      throw error;
    }
    try {
      if (nextMarkers.length > 0) this.map.setFitView(nextMarkers.map(({ marker }) => marker));
    } catch (error) {
      this.removeMarkers(nextMarkers);
      throw error;
    }
    this.markers = nextMarkers;
  }

  focus(poi: SelectedPoi): void {
    if (!this.destroyed) this.map.setCenter([poi.longitude, poi.latitude]);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.suggestionSequence += 1;
    for (const { resolve } of this.pendingSearches) resolve([]);
    this.pendingSearches.clear();
    this.settleSuggestions();
    const markers = this.markers;
    this.markers = [];
    let result = this.removeMarkers(markers);
    result = attemptCleanup(result, () => this.map.destroy());
    if (!result.ok) throw result.error;
  }

  private settleSuggestions(): void {
    for (const { resolve } of this.pendingSuggestions.values()) resolve([]);
    this.pendingSuggestions.clear();
  }

  private clearMarkers(): void {
    const markers = this.markers;
    this.markers = [];
    const result = this.removeMarkers(markers);
    if (!result.ok) throw result.error;
  }

  private removeMarkers(markers: Array<{ marker: AMapMarker; click: AMapEventHandler }>): CleanupResult {
    let result: CleanupResult = { ok: true };
    for (const { marker, click } of markers) {
      result = attemptCleanup(result, () => marker.off("click", click));
      result = attemptCleanup(result, () => marker.setMap(null));
    }
    return result;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw new DOMException("AMap setup was aborted", "AbortError");
}

export function createAmapLandmarkMapFactory(
  dependencies: AmapLandmarkFactoryDependencies,
): LandmarkMapFactory {
  return async (container, onPoiSelect, signal) => {
    throwIfAborted(signal);
    const amap = await dependencies.load(dependencies.config());
    throwIfAborted(signal);
    return new AmapLandmarkAdapter(amap, container, onPoiSelect, signal);
  };
}

export const createAmapLandmarkMap = createAmapLandmarkMapFactory({
  load: loadAmap,
  config: () => loaderConfigFromEnv(import.meta.env),
});
