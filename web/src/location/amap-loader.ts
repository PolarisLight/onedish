import type { AmapNamespace, AMapSecurityConfig } from "./amap-types";

interface AMapLoaderBaseConfig {
  key: string;
  timeoutMs?: number;
}

export type AMapLoaderConfig = AMapLoaderBaseConfig & (
  | { securityCode: string; serviceHost?: never }
  | { serviceHost: string; securityCode?: never }
);

interface NormalizedSecurity {
  mode: "development" | "proxy";
  value: string;
  global: AMapSecurityConfig;
}

interface NormalizedConfig {
  key: string;
  timeoutMs: number;
  security: NormalizedSecurity;
}

interface ActiveLoad {
  key: string;
  security: NormalizedSecurity;
  promise: Promise<AmapNamespace>;
  script: HTMLScriptElement;
}

let activeLoad: ActiveLoad | undefined;
let callbackSequence = 0;

const DEFAULT_TIMEOUT_MS = 10_000;
const MISSING_CONFIG_MESSAGE = "AMap JS credentials are not configured";
const INVALID_CONFIG_MESSAGE = "AMap JS configuration is invalid";
const CONFLICTING_CONFIG_MESSAGE = "AMap is already configured with different credentials";
const SECURITY_CONFLICT_MESSAGE = "AMap security configuration conflicts with an existing value";
const SCRIPT_ERROR_MESSAGE = "AMap failed to load";
const INITIALIZATION_ERROR_MESSAGE = "AMap failed to initialize";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeConfig(config: AMapLoaderConfig): NormalizedConfig | Error {
  if (!isRecord(config) || typeof config.key !== "string" || !config.key.trim()) {
    return new Error(MISSING_CONFIG_MESSAGE);
  }

  const hasSecurityCode = Object.hasOwn(config, "securityCode");
  const hasServiceHost = Object.hasOwn(config, "serviceHost");
  if (hasSecurityCode === hasServiceHost) {
    return new Error(INVALID_CONFIG_MESSAGE);
  }

  let security: NormalizedSecurity;
  if (hasSecurityCode) {
    if (typeof config.securityCode !== "string" || !config.securityCode.trim()) {
      return new Error(MISSING_CONFIG_MESSAGE);
    }
    const value = config.securityCode.trim();
    security = { mode: "development", value, global: { securityJsCode: value } };
  } else {
    if (typeof config.serviceHost !== "string" || !config.serviceHost.trim()) {
      return new Error(INVALID_CONFIG_MESSAGE);
    }
    const value = config.serviceHost.trim();
    try {
      const serviceUrl = new URL(value, window.location.href);
      if (
        serviceUrl.origin !== window.location.origin ||
        serviceUrl.pathname !== "/_AMapService" ||
        serviceUrl.search ||
        serviceUrl.hash
      ) {
        return new Error(INVALID_CONFIG_MESSAGE);
      }
    } catch {
      return new Error(INVALID_CONFIG_MESSAGE);
    }
    security = { mode: "proxy", value, global: { serviceHost: value } };
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return new Error(INVALID_CONFIG_MESSAGE);
  }
  return { key: config.key.trim(), timeoutMs, security };
}

function sameSecurity(left: NormalizedSecurity, right: NormalizedSecurity): boolean {
  return left.mode === right.mode && left.value === right.value;
}

function sameGlobal(left: unknown, right: AMapSecurityConfig): boolean {
  if (!isRecord(left)) return false;
  if ("securityJsCode" in left && "securityJsCode" in right) {
    return left.securityJsCode === right.securityJsCode && !("serviceHost" in left) && !("serviceHost" in right);
  }
  if ("serviceHost" in left && "serviceHost" in right) {
    return left.serviceHost === right.serviceHost && !("securityJsCode" in left) && !("securityJsCode" in right);
  }
  return false;
}

function isAmapNamespace(value: unknown): value is AmapNamespace {
  return (
    isRecord(value) &&
    isConstructor(value.Map) &&
    isConstructor(value.Marker) &&
    isConstructor(value.PlaceSearch) &&
    isConstructor(value.AutoComplete)
  );
}

function isConstructor(value: unknown): value is new (...args: never[]) => unknown {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

function nextCallbackName(): string {
  let name: string;
  do {
    callbackSequence += 1;
    name = `__onedishAmapReady_${callbackSequence}`;
  } while (Reflect.has(window, name));
  return name;
}

export function loadAmap(config: AMapLoaderConfig): Promise<AmapNamespace> {
  const normalized = normalizeConfig(config);
  if (normalized instanceof Error) return Promise.reject(normalized);

  if (activeLoad) {
    if (activeLoad.key === normalized.key && sameSecurity(activeLoad.security, normalized.security)) {
      return activeLoad.promise;
    }
    return Promise.reject(new Error(CONFLICTING_CONFIG_MESSAGE));
  }

  const existingSecurity = window._AMapSecurityConfig;
  if (existingSecurity !== undefined && !sameGlobal(existingSecurity, normalized.security.global)) {
    return Promise.reject(new Error(SECURITY_CONFLICT_MESSAGE));
  }
  const ownsSecurityConfig = existingSecurity === undefined;
  if (ownsSecurityConfig) window._AMapSecurityConfig = normalized.security.global;

  let resolveLoad: (namespace: AmapNamespace) => void;
  let rejectLoad: (error: Error) => void;
  const promise = new Promise<AmapNamespace>((resolve, reject) => {
    resolveLoad = resolve;
    rejectLoad = reject;
  });
  const script = document.createElement("script");
  const callbackName = nextCallbackName();
  const url = new URL("https://webapi.amap.com/maps");
  url.searchParams.set("v", "2.0");
  url.searchParams.set("key", normalized.key);
  url.searchParams.set("plugin", "AMap.PlaceSearch,AMap.AutoComplete");
  url.searchParams.set("callback", callbackName);
  script.async = true;
  script.src = url.toString();

  const load: ActiveLoad = { key: normalized.key, security: normalized.security, promise, script };
  activeLoad = load;
  let settled = false;

  const removeTransientState = () => {
    script.removeEventListener("load", handleScriptLoad);
    script.removeEventListener("error", handleScriptError);
    window.clearTimeout(timer);
    Reflect.deleteProperty(window, callbackName);
  };
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    removeTransientState();
    script.remove();
    if (ownsSecurityConfig && window._AMapSecurityConfig === normalized.security.global) {
      Reflect.deleteProperty(window, "_AMapSecurityConfig");
    }
    if (activeLoad === load) activeLoad = undefined;
    rejectLoad(new Error(message));
  };
  const handleReady = () => {
    if (settled) return;
    if (!isAmapNamespace(window.AMap)) {
      fail(INITIALIZATION_ERROR_MESSAGE);
      return;
    }
    settled = true;
    removeTransientState();
    resolveLoad(window.AMap);
  };
  const handleScriptLoad = () => undefined;
  const handleScriptError = () => fail(SCRIPT_ERROR_MESSAGE);

  Object.defineProperty(window, callbackName, { configurable: true, value: handleReady });
  script.addEventListener("load", handleScriptLoad);
  script.addEventListener("error", handleScriptError);
  const timer = window.setTimeout(() => fail(INITIALIZATION_ERROR_MESSAGE), normalized.timeoutMs);

  try {
    document.head.appendChild(script);
  } catch {
    fail(SCRIPT_ERROR_MESSAGE);
  }

  return promise;
}
