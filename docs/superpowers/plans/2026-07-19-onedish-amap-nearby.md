# OneDish AMap Nearby Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Nearby page's fixture restaurant list with real nearby restaurant POIs from AMap while preserving the deterministic demo recommendation flow.

**Architecture:** Add an `AmapPlacesProvider` that converts browser WGS-84 coordinates to GCJ-02 and then calls AMap Place Around v5. Inject it only into `/api/v1/places/nearby`; keep fixture places for the fictional menu recommendation endpoint. The React page requests nearby places only after one-time location consent and renders a bounded, attributed result list with a safe fixture fallback when the live provider is unavailable.

**Tech Stack:** FastAPI, Pydantic Settings, httpx/respx, React, TypeScript, Vitest, Testing Library.

---

### Task 1: AMap provider and configuration

**Files:**
- Create: `backend/src/onedish_api/providers/amap.py`
- Modify: `backend/src/onedish_api/domain.py`
- Modify: `backend/src/onedish_api/settings.py`
- Modify: `backend/src/onedish_api/providers/__init__.py`
- Test: `backend/tests/test_places.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing provider tests**

Add respx tests proving that WGS-84 coordinates are converted through `/v3/assistant/coordinate/convert`, the converted point is passed to `/v5/place/around` with `types=050000`, and `business`/`photos` fields normalize into `Place` without exposing the key in errors.

- [ ] **Step 2: Run provider tests and verify RED**

Run: `backend/.venv/bin/pytest backend/tests/test_places.py -q`

Expected: collection fails because `onedish_api.providers.amap` does not exist.

- [ ] **Step 3: Implement the provider and settings contract**

Add `amap_web_key`, support `AMAP_WEB_KEY` and `ONEDISH_AMAP_WEB_KEY`, and extend `Place` with optional address, average cost, coordinates, photo URL, plus the `amap_place` source kind. The provider must use five-second timeouts, `trust_env=False`, a 15-minute coordinate-rounded cache, bounded responses, safe HTTPS image/link validation, and generic errors.

- [ ] **Step 4: Run provider tests and verify GREEN**

Run: `backend/.venv/bin/pytest backend/tests/test_places.py backend/tests/test_domain.py -q`

Expected: all selected tests pass.

### Task 2: Separate discovery from demo recommendation

**Files:**
- Modify: `backend/src/onedish_api/app.py`
- Modify: `backend/src/onedish_api/routes.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write a failing application wiring test**

Construct settings with an AMap key and assert `app.state.places_provider` is AMap while `app.state.recommendation_places_provider` remains fixture-backed.

- [ ] **Step 2: Run the wiring test and verify RED**

Run: `backend/.venv/bin/pytest backend/tests/test_api.py -q`

Expected: failure because separate providers are not wired.

- [ ] **Step 3: Implement split provider injection**

Select AMap for discovery whenever a key is configured, keep fixtures for recommendation, and pass both providers into `build_router`. Preserve Foursquare as the overseas live fallback when no AMap key exists.

- [ ] **Step 4: Run API tests and verify GREEN**

Run: `backend/.venv/bin/pytest backend/tests/test_api.py backend/tests/test_privacy.py -q`

Expected: all selected tests pass.

### Task 3: Fetch and render real nearby restaurants

**Files:**
- Modify: `web/src/domain/contracts.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/nearby/NearbyPage.tsx`
- Modify: `web/src/i18n/messages.ts`
- Modify: `web/src/styles/global.css`
- Test: `web/tests/nearby-page.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Mock `/api/v1/places/nearby`, allow location once, and assert the request contains the device coordinate without storing it; then assert an AMap restaurant name, rating, distance, average cost, attribution, and destination link render. Add a failure test proving the page shows a localized service message instead of silently displaying fixtures as live data.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `pnpm --dir web test -- --run tests/nearby-page.test.tsx`

Expected: failures because the page does not call the nearby API.

- [ ] **Step 3: Implement the client and live result panel**

Add a typed `findNearbyPlaces` POST client, fetch after device or area location succeeds, record `AMap Places` as the location recipient, render up to ten result cards, and keep the OSM map as a visual center. Use explicit loading, empty, and unavailable states; never label fixture candidates as live AMap results.

- [ ] **Step 4: Run UI tests and verify GREEN**

Run: `pnpm --dir web test -- --run tests/nearby-page.test.tsx tests/privacy-store.test.ts`

Expected: all selected tests pass.

### Task 4: Environment, documentation, and full verification

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Document private local configuration**

Document `AMAP_WEB_KEY`, `ONEDISH_MODE=demo`, the split between real nearby discovery and demo menus, and the command that starts the backend. Ignore `.env.local` in addition to `.env`.

- [ ] **Step 2: Run the full verification suite**

Run: `make test`, `make lint`, and `make build` with bundled Node on `PATH`.

Expected: backend tests, web tests, lint, and production builds all pass; no secret appears in `git diff` or tracked files.

