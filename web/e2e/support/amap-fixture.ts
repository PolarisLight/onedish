import type { Page } from "@playwright/test";

export interface AmapFixturePoi {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
}

function fixtureScript(callback: string, pois: readonly AmapFixturePoi[]): string {
  return `(() => {
    const pois = ${JSON.stringify(pois)};
    window.__amapFixtureCalls = { autoComplete: 0, placeSearch: 0 };
    class FixtureMap {
      constructor(container) { this.container = container; }
      add() {}
      remove() {}
      on() {}
      off() {}
      setCenter() {}
      setFitView() {}
      destroy() { this.container.replaceChildren(); }
    }
    let markerIndex = 0;
    class FixtureMarker {
      constructor(options = {}) {
        this.handlers = new Map();
        // Test-only DOM surrogate: it validates OneDish's marker-selection wiring,
        // not the accessibility semantics of provider-rendered AMap markers.
        this.element = document.createElement("button");
        this.element.type = "button";
        this.element.setAttribute("aria-label", "Map marker: " + (options.title || "landmark"));
        const offset = markerIndex++ * 52;
        this.element.style.cssText = "position:absolute;left:calc(38% + " + offset + "px);top:42%;z-index:2";
        this.element.textContent = "\u25cf";
        options.map?.container.appendChild(this.element);
        this.element.addEventListener("click", () => this.handlers.get("click")?.({}));
      }
      on(name, handler) { this.handlers.set(name, handler); }
      off(name, handler) { if (this.handlers.get(name) === handler) this.handlers.delete(name); }
      setMap(map) { if (map === null) this.element.remove(); }
      getPosition() { return undefined; }
      setPosition() {}
    }
    class FixturePlaceSearch {
      search(_query, done) {
        window.__amapFixtureCalls.placeSearch += 1;
        setTimeout(() => done("complete", { poiList: { pois: pois.map((poi) => ({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          location: { getLng: () => poi.longitude, getLat: () => poi.latitude },
        })) } }), 80);
      }
    }
    class FixtureAutoComplete {
      search(_query, done) {
        window.__amapFixtureCalls.autoComplete += 1;
        queueMicrotask(() => done("complete", { tips: pois.map((poi) => ({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          location: { getLng: () => poi.longitude, getLat: () => poi.latitude },
        })) }));
      }
    }
    window.AMap = { Map: FixtureMap, Marker: FixtureMarker, PlaceSearch: FixturePlaceSearch, AutoComplete: FixtureAutoComplete };
    window[${JSON.stringify(callback)}]?.();
  })();`;
}

export async function installAmapFixture(page: Page, pois: readonly AmapFixturePoi[]): Promise<void> {
  await page.route("https://webapi.amap.com/maps**", async (route) => {
    const callback = new URL(route.request().url()).searchParams.get("callback");
    if (!callback) {
      await route.fulfill({ status: 400, body: "missing callback" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: fixtureScript(callback, pois),
    });
  });
}

export async function installFailingAmapFixture(page: Page): Promise<void> {
  await page.route("https://webapi.amap.com/maps**", (route) => route.abort("failed"));
}
