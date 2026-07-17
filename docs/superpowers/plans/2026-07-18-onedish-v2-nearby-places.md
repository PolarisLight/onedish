# OneDish V2 Nearby Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users explicitly share current location or enter an area, then explore real nearby restaurants that likely match the recommended meal category on an accessible map and synchronized list.

**Architecture:** Browser geolocation and manual geocoding produce ephemeral coordinates. A configurable backend performs Foursquare place search with its secret key; MapLibre is lazy-loaded only after user intent and renders an OSM raster base with visible attribution. Restaurant results never alter the already chosen dish, and fixture places are rejected from the live nearby presentation.

**Tech Stack:** React 19, TypeScript 5.8, MapLibre GL JS, FastAPI, Pydantic, httpx, Foursquare Places API, OpenStreetMap tiles, Nominatim user-triggered geocoding, Vitest, respx, Playwright

---

**Command convention:** Run test, build, and package commands from the product directory `onedish/`. Run the shown `git add` and `git commit` commands from the worktree root that contains the `onedish/` directory.

## File map

- Modify `backend/src/onedish_api/domain.py`: optional place coordinates and evidence fields.
- Modify `backend/src/onedish_api/providers/base.py`: meal-category query and typed provider failures.
- Modify `backend/src/onedish_api/providers/foursquare.py`: category query, coordinates, and failure classification.
- Modify `backend/src/onedish_api/routes.py`: typed place-search responses.
- Modify `backend/src/onedish_api/settings.py`: public web origin configuration.
- Modify `backend/src/onedish_api/app.py`: production CORS for the configured static site.
- Modify `backend/src/onedish_api/privacy.py`: allow an origin referrer required by the OSM tile service.
- Modify `backend/tests/test_places.py`: normalization, key privacy, and rate limits.
- Modify `backend/tests/test_api.py`: status mapping and CORS.
- Create `web/src/location/geolocation.ts`: permission-on-action location wrapper.
- Create `web/src/location/geocoder.ts`: bounded, user-triggered manual geocoder with memory cache.
- Create `web/src/nearby/types.ts`: location and nearby state machine.
- Create `web/src/nearby/NearbyPage.tsx`: route-level state and recovery.
- Create `web/src/nearby/NearbyMap.tsx`: lazy MapLibre map and markers.
- Create `web/src/nearby/RestaurantList.tsx`: accessible synchronized list.
- Create `web/src/nearby/ManualAreaForm.tsx`: submit-only area search without autocomplete.
- Modify `web/src/api/client.ts`: configured API base and typed place errors.
- Modify `web/src/app/router.tsx`: `/nearby/:decisionId` route.
- Modify `web/src/winner/WinnerPage.tsx`: navigate to nearby route.
- Modify `web/src/db/db.ts`: store only last search timestamp, never coordinates.
- Modify `web/src/styles/global.css`: desktop split and mobile map sheet.
- Modify `web/package.json` and `web/pnpm-lock.yaml`: MapLibre dependency.
- Create `web/tests/geolocation.test.ts`: success, denial, timeout, unsupported.
- Create `web/tests/geocoder.test.ts`: submit-only request, cache, and rate bound.
- Create `web/tests/nearby.test.tsx`: state-machine and synchronization.
- Create `web/e2e/nearby.spec.ts`: permission, manual fallback, mobile sheet.

### Task 1: Real-place coordinates and typed provider failures

**Files:**
- Modify: `backend/src/onedish_api/domain.py`
- Modify: `backend/src/onedish_api/providers/base.py`
- Modify: `backend/src/onedish_api/providers/foursquare.py`
- Modify: `backend/src/onedish_api/routes.py`
- Modify: `backend/tests/test_places.py`
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing provider tests**

Extend the mocked Foursquare result with `latitude: 40.713` and `longitude: -74.005`, then assert:

```python
assert places[0].latitude == 40.713
assert places[0].longitude == -74.005
assert route.calls[0].request.url.params["query"] == "noodles"
```

Add separate 401, 429, and timeout cases expecting `PlacesProviderError.kind` values `unauthorized`, `rate_limited`, and `unavailable`. Add API tests expecting HTTP 502, 429, and 503 without response bodies containing provider tokens or raw upstream content.

- [ ] **Step 2: Run and verify failure**

Run: `backend/.venv/bin/pytest backend/tests/test_places.py backend/tests/test_api.py -q`
Expected: FAIL because places have no coordinates, queries have no category, and failures collapse to `RuntimeError`.

- [ ] **Step 3: Extend strict contracts**

Add optional `latitude` and `longitude` to `Place`; both must be present together. Add optional `menu_evidence_url` and keep it `None` for Foursquare category matches. Extend `PlaceQuery` with `meal_category: str = Field(min_length=1, max_length=80)`. Define:

```python
class PlacesProviderError(RuntimeError):
    def __init__(self, kind: Literal["unauthorized", "rate_limited", "unavailable"]):
        super().__init__(kind)
        self.kind = kind
```

- [ ] **Step 4: Normalize real coordinates and classify errors**

Request `latitude,longitude` in Foursquare `fields`, pass `query.meal_category` as `query`, and reject results without valid coordinates. Map upstream 401/403 to `unauthorized`, 429 to `rate_limited`, and network, timeout, malformed JSON, or 5xx to `unavailable`. Never include upstream text, request headers, or the API key in the exception.

- [ ] **Step 5: Map provider failures at the API boundary**

Return a stable JSON shape:

```json
{ "code": "places_rate_limited", "message": "Nearby search is temporarily busy." }
```

Use 502 for provider authorization failure, 429 for provider rate limit, and 503 for unavailable. Demo fixture results remain supported for backend tests but retain `source_kind: fixture_place` and no coordinates.

- [ ] **Step 6: Run tests**

Run: `backend/.venv/bin/pytest backend/tests/test_places.py backend/tests/test_api.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add onedish/backend/src/onedish_api/domain.py onedish/backend/src/onedish_api/providers/base.py onedish/backend/src/onedish_api/providers/foursquare.py onedish/backend/src/onedish_api/routes.py onedish/backend/tests/test_places.py onedish/backend/tests/test_api.py
git commit -m "feat: return mappable nearby places"
```

### Task 2: Configurable public backend origin

**Files:**
- Modify: `backend/src/onedish_api/settings.py`
- Modify: `backend/src/onedish_api/app.py`
- Modify: `backend/src/onedish_api/privacy.py`
- Modify: `backend/tests/test_api.py`
- Modify: `web/src/api/client.ts`
- Test: `web/tests/api-client.test.ts`

- [ ] **Step 1: Write failing origin and client tests**

```python
settings = Settings(environment="production", web_origins=("https://polarislight.github.io",), root_path=ROOT, allowed_hosts=("testserver",))
with TestClient(create_app(settings)) as browser:
    response = browser.options("/api/v1/places/nearby", headers={"origin": "https://polarislight.github.io", "access-control-request-method": "POST"})
assert response.headers["access-control-allow-origin"] == "https://polarislight.github.io"
assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
```

```ts
vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
await searchNearby({ latitude: 1, longitude: 2, radius_m: 5000, meal_category: "noodles" });
expect(fetch).toHaveBeenCalledWith("https://api.example.test/api/v1/places/nearby", expect.anything());
```

- [ ] **Step 2: Run and verify failure**

Run: `backend/.venv/bin/pytest backend/tests/test_api.py -q && pnpm --dir web test -- --run tests/api-client.test.ts`
Expected: FAIL because production CORS and configured API base do not exist.

- [ ] **Step 3: Add explicit production origins**

Add `web_origins: tuple[str, ...] = ()` to settings. Install CORS middleware whenever the tuple is non-empty, and append loopback origins only in development. Keep allowed headers limited to `Content-Type` and `X-Request-ID`; never enable credentials.

Change the application response header from `Referrer-Policy: no-referrer` to `strict-origin-when-cross-origin`. This preserves only the site origin on cross-origin tile requests and satisfies the OSM tile policy requirement for a valid browser referrer without exposing the full page path.

- [ ] **Step 4: Add typed browser place search**

`searchNearby()` posts to `${normalizedApiBase}/api/v1/places/nearby`, validates that every live result has `source_kind === "foursquare_place"` and coordinates, and maps stable API codes to `NearbyApiError` kinds. If `VITE_API_BASE_URL` is empty in a static build, throw `backend_unconfigured` without issuing a fetch.

- [ ] **Step 5: Run tests and commit**

Run: `backend/.venv/bin/pytest backend/tests/test_api.py -q && pnpm --dir web test -- --run tests/api-client.test.ts`
Expected: PASS.

```bash
git add onedish/backend/src/onedish_api/settings.py onedish/backend/src/onedish_api/app.py onedish/backend/src/onedish_api/privacy.py onedish/backend/tests/test_api.py onedish/web/src/api/client.ts onedish/web/tests/api-client.test.ts
git commit -m "feat: configure the nearby API origin"
```

### Task 3: Permission-on-action geolocation

**Files:**
- Create: `web/src/location/geolocation.ts`
- Create: `web/src/nearby/types.ts`
- Test: `web/tests/geolocation.test.ts`

- [ ] **Step 1: Write failing geolocation tests**

```ts
await expect(requestCurrentLocation({ timeoutMs: 5_000 })).resolves.toEqual({ latitude: 31.23, longitude: 121.47, accuracy_m: 30, source: "device" });
await expect(requestCurrentLocation({ timeoutMs: 5_000 })).rejects.toMatchObject({ kind: "denied" });
await expect(requestCurrentLocation({ timeoutMs: 10 })).rejects.toMatchObject({ kind: "timeout" });
```

Add an unsupported case with `navigator.geolocation` removed. Assert no call happens merely by importing the module.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/geolocation.test.ts`
Expected: FAIL because the wrapper is missing.

- [ ] **Step 3: Implement a bounded wrapper**

Export `LocationPoint`, `LocationErrorKind`, `LocationRequestError`, and:

```ts
export function requestCurrentLocation(options: { readonly timeoutMs: number }): Promise<LocationPoint>;
```

Call `navigator.geolocation.getCurrentPosition` only inside this function. Set `enableHighAccuracy: false`, `maximumAge: 300_000`, and the supplied timeout. Map browser error codes 1, 2, and 3 to denied, unavailable, and timeout. Return only latitude, longitude, rounded accuracy, and source; do not write to DB.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm --dir web test -- --run tests/geolocation.test.ts`
Expected: PASS.

```bash
git add onedish/web/src/location/geolocation.ts onedish/web/src/nearby/types.ts onedish/web/tests/geolocation.test.ts
git commit -m "feat: request location only after intent"
```

### Task 4: Manual area geocoding without autocomplete

**Files:**
- Create: `web/src/location/geocoder.ts`
- Create: `web/src/nearby/ManualAreaForm.tsx`
- Test: `web/tests/geocoder.test.ts`
- Test: `web/tests/manual-area-form.test.tsx`

- [ ] **Step 1: Write failing geocoder tests**

Assert one submit produces one request to:

```text
https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Shanghai
```

Assert repeated identical input uses the in-memory cache, a second distinct request inside one second yields a typed `rate_bound` error, empty input does not fetch, and typing never calls the geocoder.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/geocoder.test.ts tests/manual-area-form.test.tsx`
Expected: FAIL because the geocoder and form are missing.

- [ ] **Step 3: Implement bounded geocoding**

Normalize whitespace, cap input at 120 characters, use `URLSearchParams`, send `Accept-Language`, abort after 8 seconds, and parse only the first result's `lat`, `lon`, and `display_name`. Keep a module-level cache keyed by normalized query and locale. Enforce at least 1,100ms between uncached requests. Do not implement suggestions, background lookup, or grid search.

- [ ] **Step 4: Implement the submit-only form**

Use a visible label, helper text saying the request is sent only on submit, inline error text, `Search area`, and `Use current location` recovery. Do not attach `onChange` network behavior.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm --dir web test -- --run tests/geocoder.test.ts tests/manual-area-form.test.tsx`
Expected: PASS.

```bash
git add onedish/web/src/location/geocoder.ts onedish/web/src/nearby/ManualAreaForm.tsx onedish/web/tests/geocoder.test.ts onedish/web/tests/manual-area-form.test.tsx
git commit -m "feat: add manual area fallback"
```

### Task 5: Nearby route state machine

**Files:**
- Create: `web/src/nearby/NearbyPage.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/winner/WinnerPage.tsx`
- Modify: `web/src/db/db.ts`
- Create: `web/tests/nearby.test.tsx`

- [ ] **Step 1: Write failing route-state tests**

Cover these explicit states: `idle`, `requesting_location`, `searching_places`, `success`, `denied`, `timeout`, `manual`, `backend_unconfigured`, `rate_limited`, `unavailable`, and `empty`.

```tsx
expect(screen.getByRole("button", { name: "Use current location" })).toBeVisible();
expect(mockGeolocation).not.toHaveBeenCalled();
fireEvent.click(screen.getByRole("button", { name: "Use current location" }));
expect(mockGeolocation).toHaveBeenCalledTimes(1);
```

On success assert the request category comes from `winner.dish.cuisine_tags` plus the dish's base ingredient, not from generated free text.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/nearby.test.tsx`
Expected: FAIL because no nearby route exists.

- [ ] **Step 3: Implement the route and reducer**

Load and validate the stored decision before showing location actions. Use a discriminated union reducer so every state renders a specific heading, action, and recovery. Location denial and timeout reveal `ManualAreaForm`; backend failure keeps the recommended dish visible and offers retry. Save only `lastPlaceSearchAt` in settings after a request, never coordinates or the area query.

- [ ] **Step 4: Wire routing and winner navigation**

Add `{ path: "nearby/:decisionId", element: <NearbyPage /> }`. `Find nearby` navigates there; browser Back returns to the unchanged winner.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm --dir web test -- --run tests/nearby.test.tsx tests/winner.test.tsx tests/privacy-repository.test.ts`
Expected: PASS.

```bash
git add onedish/web/src/nearby/NearbyPage.tsx onedish/web/src/app/router.tsx onedish/web/src/winner/WinnerPage.tsx onedish/web/src/db/db.ts onedish/web/tests/nearby.test.tsx
git commit -m "feat: add nearby search recovery states"
```

### Task 6: Lazy MapLibre map and synchronized list

**Files:**
- Modify: `web/package.json`
- Modify: `web/pnpm-lock.yaml`
- Create: `web/src/nearby/NearbyMap.tsx`
- Create: `web/src/nearby/RestaurantList.tsx`
- Modify: `web/src/nearby/NearbyPage.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/tests/nearby.test.tsx`

- [ ] **Step 1: Install the verified dependency**

Run: `pnpm --dir web add maplibre-gl`
Expected: `package.json` and lockfile add one MapLibre dependency without changing React versions.

- [ ] **Step 2: Add failing synchronization tests**

Mock the lazy map module. Click the second restaurant card and expect `selectedPlaceId` passed to the map to change. Trigger the mock map marker callback and expect the corresponding card to receive focus and `aria-current="true"`.

- [ ] **Step 3: Build the list first**

`RestaurantList` renders name, localized distance, category, opening state, price tier, `Likely matches`, and `Foursquare Places` attribution. It does not show a dish name, exact menu price, delivery state, or order button unless `menu_evidence_url` is present.

- [ ] **Step 4: Build the map as a lazy client leaf**

Import MapLibre and its CSS only inside `NearbyMap`. Create a raster style pointing at `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with `tileSize: 256` and exact visible attribution `© OpenStreetMap contributors`. Set `cooperativeGestures: true`; add user and restaurant markers; remove all markers and call `map.remove()` on cleanup. Do not add tile prefetch, offline download, service-worker tile caching, or a hidden attribution control.

- [ ] **Step 5: Synchronize selection**

List selection calls `map.easeTo` and enlarges one marker using a CSS transform. Marker selection sets list state, scrolls the card with `block: nearest`, and focuses it only for keyboard-triggered marker activation. The plain list remains a complete non-map alternative.

- [ ] **Step 6: Add responsive layout**

At 768px and above, use a two-column map/list grid. Below 768px, map fills the content area and the list is a bottom sheet with three snap heights implemented through CSS and pointer events. The sheet has a visible drag handle with an accessible `Expand restaurant list` button; reduced-motion mode snaps instantly.

- [ ] **Step 7: Run tests and commit**

Run: `pnpm --dir web test -- --run tests/nearby.test.tsx`
Expected: PASS.

```bash
git add onedish/web/package.json onedish/web/pnpm-lock.yaml onedish/web/src/nearby/NearbyMap.tsx onedish/web/src/nearby/RestaurantList.tsx onedish/web/src/nearby/NearbyPage.tsx onedish/web/src/styles/global.css onedish/web/tests/nearby.test.tsx
git commit -m "feat: map real nearby restaurants"
```

### Task 7: Nearby end-to-end and policy verification

**Files:**
- Create: `web/e2e/nearby.spec.ts`
- Modify: `docs/privacy.md`
- Modify: `docs/data-provenance.md`
- Modify: `README.md`

- [ ] **Step 1: Add mocked-live end-to-end coverage**

Intercept the backend request with two real-shaped Foursquare results. Grant browser geolocation, verify list and markers appear, click a card, click a marker, and confirm synchronization. In a second test deny geolocation, submit a manually intercepted Nominatim result, then verify place search proceeds.

- [ ] **Step 2: Add failure end-to-end coverage**

Cover provider 429, backend unavailable, no matches, and an unconfigured static build. In every case assert the recommended dish remains visible and no fixture restaurant is rendered as a real nearby result.

- [ ] **Step 3: Document provider boundaries and configuration**

Document `ONEDISH_FOURSQUARE_API_KEY`, `ONEDISH_WEB_ORIGINS`, and `VITE_API_BASE_URL`. State that MapLibre renders the map, OSM tiles are best effort with mandatory attribution, Nominatim is submit-only with a one-request-per-second bound, Foursquare supplies place data, and no menu availability is claimed without evidence. Link the four official provider references already listed in the V2 design spec.

- [ ] **Step 4: Run complete verification**

Run: `make test`
Expected: backend and frontend suites PASS.
Run: `make lint && make build`
Expected: lint and production builds PASS.
Run: `pnpm --dir web e2e -- --grep "nearby"`
Expected: location success, denial, manual fallback, synchronization, and failures PASS on mobile and desktop.

- [ ] **Step 5: Commit**

```bash
git add onedish/web/e2e/nearby.spec.ts onedish/docs/privacy.md onedish/docs/data-provenance.md onedish/README.md
git commit -m "test: verify nearby restaurant discovery"
```
