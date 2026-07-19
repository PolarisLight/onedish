export type AMapSearchStatus = "complete" | "error" | "no_data";

export interface AMapLngLat {
  getLng(): number;
  getLat(): number;
}

export type AMapLngLatLike = AMapLngLat | readonly [longitude: number, latitude: number];

export type AMapEventHandler = (event: unknown) => void;

export interface AMapEventTarget<EventName extends string> {
  on(eventName: EventName, handler: AMapEventHandler): void;
  off(eventName: EventName, handler: AMapEventHandler): void;
}

export interface AMapMapOptions {
  center?: AMapLngLatLike;
  zoom?: number;
}

export interface AMapMap extends AMapEventTarget<"click" | "moveend"> {
  add(overlay: AMapMarker | readonly AMapMarker[]): void;
  remove(overlay: AMapMarker | readonly AMapMarker[]): void;
  setCenter(center: AMapLngLatLike): void;
  setFitView(overlays?: readonly AMapMarker[]): void;
  destroy(): void;
}

export interface AMapMarkerOptions {
  map?: AMapMap;
  position?: AMapLngLatLike;
  title?: string;
}

export interface AMapMarker extends AMapEventTarget<"click"> {
  getPosition(): AMapLngLat | undefined;
  setPosition(position: AMapLngLatLike): void;
  setMap(map: AMapMap | null): void;
}

export interface AMapPoi {
  id: string;
  name: string;
  address?: string;
  location?: AMapLngLat;
  type?: string;
  tel?: string;
  distance?: number;
}

export interface AMapPlaceSearchResult {
  info?: string;
  count?: number;
  poiList: {
    count?: number;
    pageIndex?: number;
    pageSize?: number;
    pois: AMapPoi[];
  };
}

export interface AMapAutocompleteTip {
  id?: string;
  name: string;
  district?: string;
  address?: string;
  location?: AMapLngLat;
}

export interface AMapAutocompleteResult {
  info?: string;
  count?: number;
  tips: AMapAutocompleteTip[];
}

export type AMapSearchCallback = (status: AMapSearchStatus, result: unknown) => void;

export interface AMapPlaceSearchOptions {
  city?: string;
  citylimit?: boolean;
  pageIndex?: number;
  pageSize?: number;
  map?: AMapMap;
}

export interface AMapPlaceSearch {
  search(keyword: string, callback: AMapSearchCallback): void;
}

export interface AMapAutoCompleteOptions {
  city?: string;
  citylimit?: boolean;
  datatype?: "poi" | "all";
  input?: string | HTMLInputElement;
}

export interface AMapAutoComplete {
  search(keyword: string, callback: AMapSearchCallback): void;
}

export interface AmapNamespace {
  Map: new (container: string | HTMLElement, options?: AMapMapOptions) => AMapMap;
  Marker: new (options?: AMapMarkerOptions) => AMapMarker;
  PlaceSearch: new (options?: AMapPlaceSearchOptions) => AMapPlaceSearch;
  AutoComplete: new (options?: AMapAutoCompleteOptions) => AMapAutoComplete;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

export function isAmapLngLat(value: unknown): value is AMapLngLat {
  if (!isRecord(value) || typeof value.getLng !== "function" || typeof value.getLat !== "function") {
    return false;
  }
  try {
    const getLng = value.getLng as (this: unknown) => unknown;
    const getLat = value.getLat as (this: unknown) => unknown;
    return isFiniteNumber(getLng.call(value)) && isFiniteNumber(getLat.call(value));
  } catch {
    return false;
  }
}

export function isAmapPoi(value: unknown): value is AMapPoi {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isOptionalString(value.address) &&
    (value.location === undefined || isAmapLngLat(value.location)) &&
    isOptionalString(value.type) &&
    isOptionalString(value.tel) &&
    isOptionalFiniteNumber(value.distance)
  );
}

function isAutocompleteTip(value: unknown): value is AMapAutocompleteTip {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isOptionalString(value.id) &&
    isOptionalString(value.district) &&
    isOptionalString(value.address) &&
    (value.location === undefined || isAmapLngLat(value.location))
  );
}

export function isAmapPlaceSearchResult(value: unknown): value is AMapPlaceSearchResult {
  if (!isRecord(value) || !isRecord(value.poiList) || !Array.isArray(value.poiList.pois)) {
    return false;
  }
  return (
    isOptionalString(value.info) &&
    isOptionalFiniteNumber(value.count) &&
    isOptionalFiniteNumber(value.poiList.count) &&
    isOptionalFiniteNumber(value.poiList.pageIndex) &&
    isOptionalFiniteNumber(value.poiList.pageSize) &&
    value.poiList.pois.every(isAmapPoi)
  );
}

export function isAmapAutocompleteResult(value: unknown): value is AMapAutocompleteResult {
  return (
    isRecord(value) &&
    isOptionalString(value.info) &&
    isOptionalFiniteNumber(value.count) &&
    Array.isArray(value.tips) &&
    value.tips.every(isAutocompleteTip)
  );
}

export type AMapSecurityConfig =
  | { securityJsCode: string; serviceHost?: never }
  | { serviceHost: string; securityJsCode?: never };

declare global {
  interface Window {
    AMap?: AmapNamespace;
    _AMapSecurityConfig?: AMapSecurityConfig;
  }
}
