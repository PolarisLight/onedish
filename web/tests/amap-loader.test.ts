import type { AmapNamespace } from "../src/location/amap-types";
import type { AMapLoaderConfig } from "../src/location/amap-loader";

const credentials = { key: "public-key", securityCode: "security-code" } as const;

async function importLoader() {
  return import("../src/location/amap-loader");
}

function installScriptCapture() {
  const scripts: HTMLScriptElement[] = [];
  const appendNode = document.head.appendChild.bind(document.head);
  const append = vi.spyOn(document.head, "appendChild").mockImplementation((node: Node) => {
    if (node instanceof HTMLScriptElement) scripts.push(node);
    return appendNode(node);
  });
  return { append, scripts };
}

function exposeAmap(overrides: Partial<Record<keyof AmapNamespace, unknown>> = {}) {
  class Constructor {}
  const namespace = {
    Map: Constructor,
    Marker: Constructor,
    PlaceSearch: Constructor,
    AutoComplete: Constructor,
    ...overrides,
  } as unknown as AmapNamespace;
  window.AMap = namespace;
  return namespace;
}

function callbackFor(script: HTMLScriptElement) {
  const callbackName = new URL(script.src).searchParams.get("callback");
  expect(callbackName).toMatch(/^__onedishAmapReady_\d+$/);
  const callback = Reflect.get(window, callbackName as string);
  expect(callback).toBeTypeOf("function");
  return { callbackName: callbackName as string, invoke: callback as () => void };
}

describe("loadAmap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.head.querySelectorAll('script[src^="https://webapi.amap.com/maps"]').forEach((script) => script.remove());
    Reflect.deleteProperty(window, "AMap");
    Reflect.deleteProperty(window, "_AMapSecurityConfig");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("configures security before append and resolves only through the named callback", async () => {
    let configAtAppend: typeof window._AMapSecurityConfig;
    const { scripts } = installScriptCapture();
    const append = vi.mocked(document.head.appendChild);
    append.mockImplementationOnce((node: Node) => {
      configAtAppend = window._AMapSecurityConfig;
      if (node instanceof HTMLScriptElement) scripts.push(node);
      return node;
    });
    const { loadAmap } = await importLoader();

    const pending = loadAmap(credentials);
    let settled = false;
    void pending.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    const script = scripts[0] as HTMLScriptElement;
    const ready = callbackFor(script);

    expect(configAtAppend).toEqual({ securityJsCode: credentials.securityCode });
    const url = new URL(script.src);
    expect(url.origin + url.pathname).toBe("https://webapi.amap.com/maps");
    expect(url.searchParams.get("v")).toBe("2.0");
    expect(url.searchParams.get("key")).toBe(credentials.key);
    expect(url.searchParams.get("plugin")).toBe("AMap.PlaceSearch,AMap.AutoComplete");
    script.dispatchEvent(new Event("load"));
    await Promise.resolve();
    expect(settled).toBe(false);

    const namespace = exposeAmap();
    ready.invoke();
    await expect(pending).resolves.toBe(namespace);
    expect(Reflect.has(window, ready.callbackName)).toBe(false);
  });

  it("returns one promise and appends one script for matching calls", async () => {
    const { append, scripts } = installScriptCapture();
    const { loadAmap } = await importLoader();
    const first = loadAmap(credentials);
    const second = loadAmap(credentials);

    expect(second).toBe(first);
    expect(append).toHaveBeenCalledTimes(1);
    exposeAmap();
    callbackFor(scripts[0] as HTMLScriptElement).invoke();
    await first;
    expect(loadAmap(credentials)).toBe(first);
  });

  it("rejects blank, missing, dual-mode, and cross-origin configuration before append", async () => {
    const { append } = installScriptCapture();
    const { loadAmap } = await importLoader();
    const invalid = [
      { key: "", securityCode: "security-code" },
      { key: "public-key", securityCode: "   " },
      { key: "public-key" },
      { key: "public-key", securityCode: "security-code", serviceHost: "/amap" },
      { key: "public-key", serviceHost: "https://private.example/amap" },
      { key: "public-key", serviceHost: "/amap" },
      { key: "public-key", serviceHost: "/_AMapService/" },
      { key: "public-key", serviceHost: "/_AMapService?debug=1" },
      { key: "public-key", serviceHost: "/_AMapService#debug" },
    ] as unknown as AMapLoaderConfig[];

    for (const config of invalid) {
      const error = await loadAmap(config).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain("security-code");
      expect(String(error)).not.toContain("private.example");
    }
    expect(append).not.toHaveBeenCalled();
  });

  it("supports a same-origin proxy and preserves an identical pre-existing global", async () => {
    const existing = { serviceHost: "/_AMapService" } as const;
    window._AMapSecurityConfig = existing;
    const { scripts } = installScriptCapture();
    const { loadAmap } = await importLoader();

    const pending = loadAmap({ key: "public-key", serviceHost: "/_AMapService" });

    expect(window._AMapSecurityConfig).toBe(existing);
    exposeAmap();
    callbackFor(scripts[0] as HTMLScriptElement).invoke();
    await pending;
    expect(window._AMapSecurityConfig).toBe(existing);
  });

  it("rejects a conflicting pre-existing security global without overwriting it", async () => {
    const existing = { securityJsCode: "another-code" } as const;
    window._AMapSecurityConfig = existing;
    const { append } = installScriptCapture();
    const { loadAmap } = await importLoader();

    const error = await loadAmap(credentials).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(existing.securityJsCode);
    expect(String(error)).not.toContain(credentials.securityCode);
    expect(window._AMapSecurityConfig).toBe(existing);
    expect(append).not.toHaveBeenCalled();
  });

  it("safely rejects a malformed pre-existing security global", async () => {
    const existing = "foreign-security-config";
    window._AMapSecurityConfig = existing as never;
    const { append } = installScriptCapture();
    const { loadAmap } = await importLoader();

    const pending = loadAmap(credentials);

    await expect(pending).rejects.toThrow("AMap security configuration conflicts");
    expect(window._AMapSecurityConfig as unknown).toBe(existing);
    expect(append).not.toHaveBeenCalled();
  });

  it("rejects script errors, removes owned state, and permits a fresh retry", async () => {
    const { append, scripts } = installScriptCapture();
    const { loadAmap } = await importLoader();
    const first = loadAmap(credentials);
    const firstScript = scripts[0] as HTMLScriptElement;
    const firstReady = callbackFor(firstScript);

    firstScript.dispatchEvent(new Event("error"));

    const error = await first.catch((reason: unknown) => reason);
    expect(String(error)).not.toContain(credentials.key);
    expect(String(error)).not.toContain(credentials.securityCode);
    expect(firstScript.isConnected).toBe(false);
    expect(Reflect.has(window, firstReady.callbackName)).toBe(false);
    expect(window._AMapSecurityConfig).toBeUndefined();

    const retry = loadAmap(credentials);
    expect(retry).not.toBe(first);
    expect(append).toHaveBeenCalledTimes(2);
    expect(callbackFor(scripts[1] as HTMLScriptElement).callbackName).not.toBe(firstReady.callbackName);
    exposeAmap();
    callbackFor(scripts[1] as HTMLScriptElement).invoke();
    await retry;
  });

  it("times out a hung load with full cleanup and allows retry", async () => {
    vi.useFakeTimers();
    const { append, scripts } = installScriptCapture();
    const { loadAmap } = await importLoader();
    const config = { ...credentials, timeoutMs: 10 };
    const first = loadAmap(config);
    const firstScript = scripts[0] as HTMLScriptElement;
    const firstReady = callbackFor(firstScript);
    const rejection = expect(first).rejects.toThrow("AMap failed to initialize");

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(firstScript.isConnected).toBe(false);
    expect(Reflect.has(window, firstReady.callbackName)).toBe(false);
    expect(window._AMapSecurityConfig).toBeUndefined();

    const retry = loadAmap(config);
    expect(append).toHaveBeenCalledTimes(2);
    exposeAmap();
    callbackFor(scripts[1] as HTMLScriptElement).invoke();
    await retry;
  });

  it("cleans up a synchronous append failure and permits retry", async () => {
    const appendNode = document.head.appendChild.bind(document.head);
    const scripts: HTMLScriptElement[] = [];
    const append = vi.spyOn(document.head, "appendChild")
      .mockImplementationOnce((node: Node) => {
        scripts.push(node as HTMLScriptElement);
        throw new Error("DOM failure with private detail");
      })
      .mockImplementation((node: Node) => {
        scripts.push(node as HTMLScriptElement);
        return appendNode(node);
      });
    const { loadAmap } = await importLoader();

    await expect(loadAmap(credentials)).rejects.toThrow("AMap failed to load");
    const failedReady = callbackForName(scripts[0] as HTMLScriptElement);
    expect(Reflect.has(window, failedReady)).toBe(false);
    expect(window._AMapSecurityConfig).toBeUndefined();

    const retry = loadAmap(credentials);
    expect(append).toHaveBeenCalledTimes(2);
    exposeAmap();
    callbackFor(scripts[1] as HTMLScriptElement).invoke();
    await retry;
  });

  it("rejects a callback when a required constructor is missing or non-constructable and cleans up", async () => {
    const { scripts } = installScriptCapture();
    const { loadAmap } = await importLoader();
    const pending = loadAmap(credentials);
    const script = scripts[0] as HTMLScriptElement;
    const ready = callbackFor(script);
    exposeAmap({ PlaceSearch: () => undefined });

    ready.invoke();

    await expect(pending).rejects.toThrow("AMap failed to initialize");
    expect(script.isConnected).toBe(false);
    expect(Reflect.has(window, ready.callbackName)).toBe(false);
    expect(window._AMapSecurityConfig).toBeUndefined();
  });

  it("preserves an identical external security global when a load fails", async () => {
    const existing = { securityJsCode: credentials.securityCode } as const;
    window._AMapSecurityConfig = existing;
    const { scripts } = installScriptCapture();
    const { loadAmap } = await importLoader();
    const pending = loadAmap(credentials);

    scripts[0]?.dispatchEvent(new Event("error"));

    await expect(pending).rejects.toThrow("AMap failed to load");
    expect(window._AMapSecurityConfig).toBe(existing);
  });

  it("rejects conflicting credentials while active or complete", async () => {
    const { append, scripts } = installScriptCapture();
    const { loadAmap } = await importLoader();
    const pending = loadAmap(credentials);
    const conflicting = { key: "different-key", securityCode: "different-code" } as const;

    await expect(loadAmap(conflicting)).rejects.toThrow("AMap is already configured");
    expect(append).toHaveBeenCalledTimes(1);
    exposeAmap();
    callbackFor(scripts[0] as HTMLScriptElement).invoke();
    await pending;
    await expect(loadAmap(conflicting)).rejects.toThrow("AMap is already configured");
    expect(append).toHaveBeenCalledTimes(1);
  });
});

function callbackForName(script: HTMLScriptElement): string {
  const callbackName = new URL(script.src).searchParams.get("callback");
  expect(callbackName).toBeTruthy();
  return callbackName as string;
}
