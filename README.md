# OneDish

**English** | [简体中文](README.zh-CN.md)

![OneDish: one real nearby restaurant](docs/assets/onedish-devpost-thumbnail.png)

**Stop browsing. Go here.** OneDish turns the restaurants around you—or around a landmark you choose—into one grounded choice with evidence-backed reasons.

[Use the map-first product](https://onedish.cyhao.space/) | [Open the static offline demo](https://polarislight.github.io/onedish/)

The VPS product uses the live FastAPI and AMap integrations. GitHub Pages keeps the fixture-backed 90-dish offline showcase as a durable fallback.

## Map-first restaurant flow

Current location stays the one-tap default, while a map-backed meeting-place flow supports plans away from where you are now:

1. **See what to eat** explains why location is needed, then requests the device position once.
2. **Choose another place** opens AMap. Search for a station, park, school, mall, or other real POI, select its marker or result, then confirm it.
3. OneDish discovers restaurants once within a fixed **3 km** radius of that coordinate. It never silently starts at 1.5 km or expands beyond 3 km.
4. Deterministic scoring uses only available rating, explicit budget, explicit taste, real history, confidence, and distance evidence. Distance is a weak signal, not the main rule.
5. The response is labeled `exploration` when no supported personal signal exists, and `personalized` only when an explicit preference or meaningful history is actually available.
6. OpenAI may select only from the top ten real candidate IDs. Invalid or late output is discarded after 2,000 ms.
7. **Pick another** rotates the complete active in-memory record—restaurant, facts, and candidate-specific reasons—without another provider or model request.

The original 90-dish deterministic experience remains available at `/demo`, clearly labeled as an offline showcase.

## Deployment topology

- **GitHub Pages:** static offline demo, built with `VITE_RESTAURANT_FIRST=0`; it makes no restaurant API claim.
- **Map-first product:** `onedish.cyhao.space` serves FastAPI and the PWA from one origin, with `/api` routed locally and `/_AMapService` handled by the documented same-origin security proxy.

## Architecture

```text
Current location (after consent) or confirmed AMap POI
        │
        ▼
FastAPI restaurant service
  ├─ AMap live observations (active use only, never cached or saved)
  └─ Overture local artifact (licensed open data + attribution)
        │
        ▼
fixed 3 km discovery → normalize → deduplicate → evidence-only score
        │
        ├─ optional constrained OpenAI rerank (≤ 2,000 ms)
        └─ complete deterministic fallback
        │
        ▼
React active-memory session → real elimination trace → one restaurant
```

## Run locally

Requirements: Python 3.12+, Node.js 22+, and pnpm.

```bash
make install
cp .env.example .env.local
```

Configure the server-side restaurant provider and the browser map separately in `.env.local`:

```text
AMAP_WEB_KEY=your_server_side_key
VITE_AMAP_JS_KEY=your_browser_js_key
VITE_AMAP_SECURITY_CODE=development_only_security_code
VITE_RESTAURANT_FIRST=1
```

- `AMAP_WEB_KEY` is used only by FastAPI for AMap Web Service restaurant discovery. Do not expose it to the browser.
- `VITE_AMAP_JS_KEY` loads AMap JavaScript API 2.0 for map display, POI search, and marker selection. Restrict the key to the intended domains in AMap.
- `VITE_AMAP_SECURITY_CODE` is supported for local development only. Any `VITE_` value is compiled into browser assets, so never use this mode for a public production build.

For production, omit `VITE_AMAP_SECURITY_CODE` and configure the browser to use a same-origin AMap security proxy:

```text
VITE_AMAP_JS_KEY=your_domain_restricted_browser_js_key
VITE_AMAP_SERVICE_HOST=/_AMapService
```

The service host must be same-origin and end at `/_AMapService`; deploy that proxy according to AMap's security configuration. Keep the security code on the proxy side—never commit it, print it, or return it to the browser.

From the repository root, start the API and web app in separate terminals:

```bash
make dev-api
make dev-web
```

Both commands load the same repository-root `.env.local`: FastAPI resolves it by absolute repository path, and Vite uses the repository root as its `envDir`. No manual `export` is required. Vite proxies `/api` to the backend in development. Open <http://127.0.0.1:5173>, then use current location or **Choose another place**. Set `VITE_RESTAURANT_FIRST=0` to make the offline demo the root experience; `/demo` always remains available.

When running an installed wheel, container image, or another layout without the source-checkout markers, set `ONEDISH_ROOT_PATH` to the runtime asset root containing `data/`, `web/public/`, and `web/dist/` when FastAPI serves the production frontend. Supply deployment secrets through the platform environment or secret manager. Installed deployments do not search virtual-environment parent directories and do not automatically load a nearby `.env.local`. Code that embeds the application may instead pass `Settings(root_path=...)` explicitly.

## Optional OpenAI reranking

Set `OPENAI_API_KEY` to enable the constrained Responses API adapter. `ONEDISH_OPENAI_API_KEY` remains a backward-compatible fallback; when both are set, the standard name wins. The model receives only candidate IDs, coarse distance/cost buckets, supported fields, deterministic scores, summarized preferences, and allowlisted reason codes. It never receives the requested meal period, coordinates, addresses, navigation URLs, or the complete profile. The product works without this key.

## Open restaurant artifact

`data/restaurants.xiamen.v1.json` is the licensed local place artifact. Regenerate it from an Overture places Parquet file with:

```bash
backend/.venv/bin/python scripts/build_xiamen_restaurants.py \
  --input /path/to/overture-places.parquet \
  --output data/restaurants.xiamen.v1.json
```

Upstream attribution must be retained per record. An empty artifact is valid during AMap-only development but does not provide the open-data fallback.

## Privacy and honest limits

- Device coordinates, a selected POI, and AMap observations are active-use only. OneDish does not persist, cache, analyze, or log their IDs, names, addresses, coordinates, or provider payloads.
- Restaurant sessions live in JavaScript module memory and disappear on reload.
- Licensed open-place records may be stored with attribution.
- Local preferences and abstract meal-history signals remain in IndexedDB.
- Dragging the map changes only the viewport. OneDish accepts only a real POI marker or map-backed result, never an arbitrary coordinate.
- OneDish does not claim live menu inventory, delivery, ordering, nutrition, opening status, price, rating, or allergen safety unless the active provider evidence supports that field.

Read [privacy](docs/privacy.md), [operations](docs/runbook.md), the approved [restaurant-first design](docs/superpowers/specs/2026-07-19-onedish-restaurant-first-design.md), and the [map-selection and cold-start design](docs/superpowers/specs/2026-07-19-restaurant-map-cold-start-design.md).

## Verify

```bash
make test
make lint
make build
pnpm --dir web e2e
```

## Built with

OpenAI Responses API, React, TypeScript, Vite, Motion, FastAPI, Pydantic, httpx, AMap, Overture Maps, Vitest, and Playwright.

## License

[MIT](LICENSE)
