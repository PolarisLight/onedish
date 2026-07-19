# Map-First Honest Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real AMap landmark selection, honest cold-start evidence, fixed 3 km discovery, candidate-specific alternative reasons, and a correctly aligned navigation action.

**Architecture:** Keep AMap and POI state in a focused frontend adapter/component boundary, then pass only a selected coordinate into the existing stateless API. Extend the request with signal availability and the response with recommendation mode; rank using only available evidence with dynamic normalization. Precise location, selected POI, and active sessions remain memory-only.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Vitest/Testing Library, FastAPI, Pydantic 2, pytest, AMap JavaScript API 2.0, Playwright.

---

## File map

- `backend/src/onedish_api/restaurant_domain.py`: request, response, mode, and reason contracts.
- `backend/src/onedish_api/restaurants/scoring.py`: eligibility, signals, comparative reasons, ordering.
- `backend/src/onedish_api/restaurants/service.py`: one 3 km discovery call and orchestration.
- `web/src/location/amap-loader.ts`: single-load typed AMap boundary.
- `web/src/location/LandmarkPicker.tsx`: map, POI search, markers, selection, confirmation.
- `web/src/home/HomePage.tsx`: current-location and landmark entry points.
- `web/src/restaurants/RestaurantWinnerPage.tsx`: current-candidate mode, evidence, and actions.
- `web/src/i18n/messages.ts`, `web/src/styles/global.css`: bilingual product copy and responsive presentation.

### Task 1: Make signal availability and recommendation mode explicit

**Files:**
- Modify: `backend/src/onedish_api/restaurant_domain.py`
- Modify: `backend/tests/test_restaurant_domain.py`
- Modify: `backend/tests/test_restaurant_api.py`

- [ ] **Step 1: Write failing domain tests**

```python
def test_profile_distinguishes_default_from_explicit_budget() -> None:
    assert RestaurantProfile(budget_minor=6000).budget_is_explicit is False
    assert RestaurantProfile(budget_minor=6000, budget_is_explicit=True).budget_is_explicit is True


def test_response_exposes_exploration_mode_and_fixed_radius() -> None:
    response = RestaurantRecommendResponse(
        schema_version="restaurant-recommendation.v1",
        session_id="a" * 32,
        ranked=(ranked_restaurant(reason_codes=("higher_rating",)),),
        trace=valid_trace(),
        selection_source="deterministic",
        model_status="disabled",
        recommendation_mode="exploration",
        radius_m=3000,
    )
    assert response.recommendation_mode == "exploration"
    assert response.radius_m == 3000
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && .venv/bin/pytest tests/test_restaurant_domain.py tests/test_restaurant_api.py -q`

Expected: FAIL because the new profile flag, mode, reason, and fixed-radius contract do not exist.

- [ ] **Step 3: Implement the minimal contract**

```python
RestaurantReasonCode = Literal[
    "higher_rating", "budget_match", "taste_match",
    "history_diversity", "closer_than_typical", "high_confidence",
]
RecommendationMode = Literal["exploration", "personalized"]

class RestaurantProfile(StrictFrozenModel):
    budget_minor: int | None = Field(default=None, ge=100, le=1_000_000)
    budget_is_explicit: bool = False
    currency: Literal["CNY", "USD"] = "CNY"
    preferred_cuisines: tuple[str, ...] = Field(default=(), max_length=8)
    max_distance_m: Literal[3000] = 3000

class RestaurantRecommendResponse(StrictFrozenModel):
    schema_version: Literal["restaurant-recommendation.v1"]
    session_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    ranked: tuple[RankedRestaurant, ...] = Field(min_length=1, max_length=25)
    trace: tuple[RestaurantTraceStage, ...] = Field(min_length=1)
    selection_source: Literal["ai_rerank", "deterministic"]
    model_status: Literal["selected", "disabled", "timeout", "invalid", "error"]
    recommendation_mode: RecommendationMode
    radius_m: Literal[3000]
```

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/onedish_api/restaurant_domain.py backend/tests/test_restaurant_domain.py backend/tests/test_restaurant_api.py
git commit -m "feat: make restaurant evidence mode explicit"
```

### Task 2: Replace near-first scoring with honest dynamic evidence

**Files:**
- Modify: `backend/src/onedish_api/restaurants/scoring.py`
- Modify: `backend/src/onedish_api/restaurants/service.py`
- Modify: `backend/src/onedish_api/rerankers/openai.py`
- Modify: `backend/tests/test_restaurant_scoring.py`
- Modify: `backend/tests/test_restaurant_service.py`
- Modify: `backend/tests/test_restaurant_reranker.py`

- [ ] **Step 1: Write failing scoring and radius tests**

```python
def test_cold_start_does_not_claim_personalization_and_rating_can_beat_distance() -> None:
    cold = request(budget_minor=6000, budget_is_explicit=False, history=RestaurantHistorySummary())
    result = score_restaurants((
        candidate("rated", distance=2400, rating=4.9),
        candidate("near", distance=100, rating=3.0),
    ), cold)
    assert result.ranked[0].candidate.name == "rated"
    assert "budget_match" not in result.ranked[0].reason_codes
    assert "history_diversity" not in result.ranked[0].reason_codes


def test_reasons_are_candidate_specific() -> None:
    result = score_restaurants((
        candidate("rated", distance=2200, rating=4.9, confidence=0.7),
        candidate("close", distance=200, rating=3.2, confidence=0.95),
    ), request(history=RestaurantHistorySummary()))
    reasons = {item.candidate.name: item.reason_codes for item in result.ranked}
    assert "higher_rating" in reasons["rated"]
    assert "closer_than_typical" in reasons["close"]
    assert reasons["rated"] != reasons["close"]


@pytest.mark.asyncio
async def test_discovers_once_at_three_kilometers() -> None:
    provider = Provider((open_place("farther-better", 2200),))
    response = await RestaurantRecommendationService(providers=(provider,)).recommend(request())
    assert [query.radius_m for query in provider.queries] == [3000]
    assert response.radius_m == 3000
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && .venv/bin/pytest tests/test_restaurant_scoring.py tests/test_restaurant_service.py tests/test_restaurant_reranker.py -q`

Expected: FAIL because the old scorer uses distance weight 25, invents history diversity, emits old reasons, and discovers at 1500 m first.

- [ ] **Step 3: Implement dynamic signals and mode**

```python
WEIGHTS = {"rating": 40.0, "budget": 25.0, "taste": 25.0,
           "history": 15.0, "confidence": 10.0, "distance": 10.0}

def recommendation_mode(request: RestaurantRecommendRequest) -> str:
    return "personalized" if (
        request.profile.budget_is_explicit
        or request.profile.preferred_cuisines
        or request.history.recent_cuisines
        or request.history.cuisine_preferences
    ) else "exploration"

signals = {
    "confidence": candidate.confidence,
    "distance": max(0.0, 1.0 - candidate.distance_m / 3000),
}
if candidate.evidence.rating and candidate.rating is not None:
    signals["rating"] = min(1.0, candidate.rating / 5.0)
if request.profile.budget_is_explicit and candidate.evidence.average_cost and request.profile.budget_minor:
    signals["budget"] = min(1.0, request.profile.budget_minor / max(candidate.average_cost_minor or 1, request.profile.budget_minor))
if request.profile.preferred_cuisines and candidate.cuisine_tags:
    signals["taste"] = float(bool(set(candidate.cuisine_tags) & set(request.profile.preferred_cuisines)))
if request.history.recent_cuisines and candidate.cuisine_tags:
    recent = sum(request.history.recent_cuisines.get(tag, 0) for tag in candidate.cuisine_tags)
    signals["history"] = 1 / (1 + recent)
score = sum(WEIGHTS[key] * value for key, value in signals.items()) / sum(WEIGHTS[key] for key in signals) * 100
```

Compute pool median rating and distance once. Emit at most three reasons: `higher_rating` above median, `budget_match` only for an explicit in-budget value, `taste_match` only for explicit overlap, `history_diversity` only when real history exists and the recent count is zero, `closer_than_typical` below median distance, and `high_confidence` at confidence ≥ 0.8.

- [ ] **Step 4: Make discovery one fixed 3 km call**

```python
radius_m = 3000
candidates = await self._discover(request, radius_m)
scoring = score_restaurants(candidates, request)
# preserve empty-result and bounded reranker handling
return RestaurantRecommendResponse(
    schema_version="restaurant-recommendation.v1",
    session_id=secrets.token_hex(16),
    ranked=ranked[:25],
    trace=scoring.trace,
    selection_source=selection_source,
    model_status=model_status,
    recommendation_mode=recommendation_mode(request),
    radius_m=3000,
)
```

Update `openai.py` to allow only the six new reason codes. The model may reorder only supplied candidates and may return only reasons already attached to its selected candidate.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/onedish_api/restaurants backend/src/onedish_api/rerankers/openai.py backend/tests/test_restaurant_scoring.py backend/tests/test_restaurant_service.py backend/tests/test_restaurant_reranker.py
git commit -m "feat: rank restaurants with honest cold-start evidence"
```

### Task 3: Mirror the contract and explicit budget in the web app

**Files:**
- Modify: `web/src/recommendation/types.ts`
- Modify: `web/src/home/HomePage.tsx`
- Modify: `web/src/restaurants/types.ts`
- Modify: `web/src/restaurants/parser.ts`
- Modify: `web/src/restaurants/start.ts`
- Modify: `web/tests/restaurant-start.test.ts`
- Modify: `web/tests/restaurant-parser.test.ts`
- Modify: `web/tests/support/restaurant-fixtures.ts`

- [ ] **Step 1: Write failing projection/parser tests**

```ts
test("marks the display-default budget as non-explicit", async () => {
  const request = vi.fn().mockResolvedValue(restaurantResponse());
  await startRestaurantRecommendation({
    point: { latitude: 24.48, longitude: 118.09 }, locale: "zh-CN",
    profile: profile({ budget_is_explicit: false }), history: [],
    now: new Date("2026-07-19T12:00:00+08:00"),
  }, request);
  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    profile: expect.objectContaining({ budget_is_explicit: false, max_distance_m: 3000 }),
  }));
});

test("parses exploration mode and fixed radius", () => {
  expect(parseRestaurantRecommendation(restaurantResponse())).toMatchObject({
    recommendation_mode: "exploration", radius_m: 3000,
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir web test --run tests/restaurant-start.test.ts tests/restaurant-parser.test.ts`

Expected: FAIL on missing fields and the obsolete radius/reason unions.

- [ ] **Step 3: Implement TypeScript mirrors**

Add `budget_is_explicit: boolean` to `UserProfile`, initialize it to `false` in `newProfile`, and set it to `true` when saved adjustments are accepted. Replace the reason union and response fields:

```ts
export type RestaurantReasonCode =
  | "higher_rating" | "budget_match" | "taste_match"
  | "history_diversity" | "closer_than_typical" | "high_confidence";

export interface RestaurantRecommendResponse {
  readonly schema_version: "restaurant-recommendation.v1";
  readonly session_id: string;
  readonly ranked: readonly RankedRestaurant[];
  readonly trace: readonly RestaurantTraceStage[];
  readonly selection_source: "ai_rerank" | "deterministic";
  readonly model_status: "selected" | "disabled" | "timeout" | "invalid" | "error";
  readonly recommendation_mode: "exploration" | "personalized";
  readonly radius_m: 3000;
}
```

In `start.ts`, send the real profile availability:

```ts
profile: {
  budget_minor: input.profile.budget_minor,
  budget_is_explicit: input.profile.budget_is_explicit,
  currency: input.locale === "en" ? "USD" : "CNY",
  preferred_cuisines: input.profile.desired_taste_tags,
  max_distance_m: 3000,
}
```

Update parser allowlists and fixtures. Do not keep a compatibility fallback for the obsolete in-branch restaurant response.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/recommendation/types.ts web/src/home/HomePage.tsx web/src/restaurants web/tests/restaurant-start.test.ts web/tests/restaurant-parser.test.ts web/tests/support/restaurant-fixtures.ts
git commit -m "feat: project explicit restaurant signals in web requests"
```

### Task 4: Fix result actions and current-candidate evidence

**Files:**
- Modify: `web/src/restaurants/RestaurantWinnerPage.tsx`
- Modify: `web/src/restaurants/RestaurantEvidence.tsx`
- Modify: `web/src/i18n/messages.ts`
- Modify: `web/src/styles/global.css`
- Modify: `web/tests/restaurant-winner.test.tsx`

- [ ] **Step 1: Write failing result-page tests**

```tsx
it("changes evidence with Pick another", () => {
  const id = createRestaurantSession(parseRestaurantRecommendation(restaurantResponse({
    recommendation_mode: "exploration",
    ranked: [ranked("First", ["higher_rating"]), ranked("Second", ["closer_than_typical"])],
  })));
  renderWinner(id);
  expect(screen.getByText("Higher rated than most nearby options")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Pick another" }));
  expect(screen.getByText("Closer than the typical option in this search")).toBeVisible();
  expect(screen.queryByText("Higher rated than most nearby options")).not.toBeInTheDocument();
});

it("labels cold start without pretending to know the user", () => {
  renderWinner(createExplorationSession());
  expect(screen.getByText("Selected from real nearby place data")).toBeVisible();
  expect(screen.queryByText(/your taste/i)).not.toBeInTheDocument();
});

it("uses the link-button alignment contract", () => {
  renderWinner(createExplorationSession());
  expect(screen.getByRole("link", { name: "Go here" })).toHaveClass("action-link-button");
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --dir web test --run tests/restaurant-winner.test.tsx`

Expected: FAIL because mode copy, new reasons, and the link layout class are absent.

- [ ] **Step 3: Implement candidate-bound evidence and alignment**

Read mode from the session response, and render reasons only from `current.reason_codes`:

```tsx
<p className="restaurant-mode-note">{t(`restaurant.mode.${session.response.recommendation_mode}`)}</p>
<RestaurantEvidence reasons={current.reason_codes} />
<a className="primary-button action-link-button" href={safeNavigation} target="_blank" rel="noopener noreferrer">
  {t("restaurant.goHere")}
</a>
```

Add bilingual copy for all six reasons and:

```css
.action-link-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
}
```

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/restaurants/RestaurantWinnerPage.tsx web/src/restaurants/RestaurantEvidence.tsx web/src/i18n/messages.ts web/src/styles/global.css web/tests/restaurant-winner.test.tsx
git commit -m "fix: keep restaurant evidence honest when rotating"
```

### Task 5: Add a single-load AMap adapter

**Files:**
- Create: `web/src/location/amap-loader.ts`
- Create: `web/src/location/amap-types.ts`
- Create: `web/tests/amap-loader.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing loader tests**

```ts
test("loads once and configures security before the script", async () => {
  const append = vi.spyOn(document.head, "appendChild");
  const first = loadAmap({ key: "js-key", securityCode: "js-code" });
  const second = loadAmap({ key: "js-key", securityCode: "js-code" });
  expect(first).toBe(second);
  expect(window._AMapSecurityConfig).toEqual({ securityJsCode: "js-code" });
  expect(append).toHaveBeenCalledTimes(1);
  window.AMap = fakeAmap();
  appendedScript(append).dispatchEvent(new Event("load"));
  await expect(first).resolves.toBe(window.AMap);
});

test("rejects when credentials are absent", async () => {
  await expect(loadAmap({ key: "", securityCode: "" })).rejects.toThrow("AMap JS credentials are not configured");
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --dir web test --run tests/amap-loader.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the typed loader**

Define only used AMap surfaces (`Map`, `Marker`, `PlaceSearch`, `AutoComplete`, `LngLat`, POI result, events) in `amap-types.ts`. Keep one module promise:

```ts
let amapPromise: Promise<AmapNamespace> | null = null;

export function loadAmap(config: { key: string; securityCode: string }): Promise<AmapNamespace> {
  if (!config.key || !config.securityCode) return Promise.reject(new Error("AMap JS credentials are not configured"));
  if (amapPromise) return amapPromise;
  window._AMapSecurityConfig = { securityJsCode: config.securityCode };
  amapPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.key)}&plugin=AMap.PlaceSearch,AMap.AutoComplete`;
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error("AMap failed to initialize"));
    script.onerror = () => reject(new Error("AMap failed to load"));
    document.head.append(script);
  });
  return amapPromise;
}
```

Document names only in `.env.example`:

```env
AMAP_WEB_KEY=
VITE_AMAP_JS_KEY=
VITE_AMAP_SECURITY_CODE=
```

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .env.example web/src/location/amap-loader.ts web/src/location/amap-types.ts web/tests/amap-loader.test.ts
git commit -m "feat: add bounded AMap browser adapter"
```

### Task 6: Build POI-only landmark selection

**Files:**
- Create: `web/src/location/LandmarkPicker.tsx`
- Create: `web/src/location/landmark-selection.ts`
- Create: `web/tests/landmark-picker.test.tsx`
- Modify: `web/src/i18n/messages.ts`
- Modify: `web/src/styles/global.css`

- [ ] **Step 1: Write failing interaction tests with an injected adapter**

```tsx
it("does not select an arbitrary coordinate when the map moves or is clicked", () => {
  const adapter = fakeLandmarkMap();
  render(<LandmarkPicker adapter={adapter} onConfirm={vi.fn()} onClose={vi.fn()} />);
  adapter.emit("moveend", { center: [118.1, 24.5] });
  adapter.emit("click", { lnglat: [118.2, 24.6] });
  expect(screen.getByRole("button", { name: "Choose this place" })).toBeDisabled();
});

it("selects only a real POI marker or search result", async () => {
  const onConfirm = vi.fn();
  const adapter = fakeLandmarkMap({ results: [poi("厦门万象城", "B0FF", 118.1, 24.5)] });
  render(<LandmarkPicker adapter={adapter} onConfirm={onConfirm} onClose={vi.fn()} />);
  await userEvent.type(screen.getByRole("searchbox"), "万象城");
  await userEvent.click(await screen.findByRole("button", { name: /厦门万象城/ }));
  await userEvent.click(screen.getByRole("button", { name: "Choose this place" }));
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "B0FF", name: "厦门万象城" }));
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --dir web test --run tests/landmark-picker.test.tsx`

Expected: FAIL because the component and selection model do not exist.

- [ ] **Step 3: Implement the POI-only contract and picker**

```ts
export interface SelectedPoi {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
}
```

`LandmarkPicker` must load `VITE_AMAP_JS_KEY`/`VITE_AMAP_SECURITY_CODE`, render a full-screen map and search box, debounce search by 250 ms, render results as markers and accessible buttons, set selection only from a result with a POI ID, keep `moveend`/background `click` selection-neutral, disable confirmation until selected, destroy map/listeners on unmount, and show recoverable load/search errors.

The confirmation sheet displays the selected POI name/address and the copy “Search restaurants within 3 km of this place.” No coordinate-only confirmation path exists.

- [ ] **Step 4: Run test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/location/LandmarkPicker.tsx web/src/location/landmark-selection.ts web/tests/landmark-picker.test.tsx web/src/i18n/messages.ts web/src/styles/global.css
git commit -m "feat: select meeting landmarks from the map"
```

### Task 7: Integrate landmark selection into the one-tap journey

**Files:**
- Modify: `web/src/home/HomePage.tsx`
- Modify: `web/tests/home.test.tsx`
- Modify: `web/src/i18n/messages.ts`
- Modify: `web/src/styles/global.css`
- Modify: `web/src/privacy/LocationConsentDialog.tsx`
- Modify: `web/tests/privacy.test.tsx`

- [ ] **Step 1: Write failing home-flow tests**

```tsx
it("keeps current location primary and opens landmark selection secondarily", async () => {
  renderHome();
  expect(screen.getByRole("button", { name: "Pick for me" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Choose another place" }));
  expect(screen.getByRole("dialog", { name: "Choose a meeting place" })).toBeVisible();
});

it("starts from the confirmed POI without persisting it", async () => {
  const start = vi.mocked(startRestaurantRecommendation);
  renderHome({ pickerPoi: poi("厦门万象城", "B0FF", 118.1, 24.5) });
  await chooseLandmark();
  expect(start).toHaveBeenCalledWith(expect.objectContaining({
    point: { latitude: 24.5, longitude: 118.1 },
  }));
  expect(localStorage.length).toBe(0);
  expect(await db.settings.where("key").equals("selected_poi").count()).toBe(0);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir web test --run tests/home.test.tsx tests/privacy.test.tsx`

Expected: FAIL because the secondary entry and picker state do not exist.

- [ ] **Step 3: Integrate without changing the primary path**

Add `"landmark"` to `JourneyState`, add the secondary action, and reuse `startAt`:

```tsx
<button className="text-button choose-place-button" onClick={() => setState("landmark")}> 
  {t("restaurant.choosePlace")}
</button>
{state === "landmark" ? (
  <LandmarkPicker
    onClose={() => setState("idle")}
    onConfirm={(poi) => void startAt({ latitude: poi.latitude, longitude: poi.longitude })}
  />
) : null}
```

Do not record a typed public landmark as device precise-location access. Update current-location consent to name AMap only and remove obsolete OpenStreetMap wording from this active journey.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/home/HomePage.tsx web/tests/home.test.tsx web/src/i18n/messages.ts web/src/styles/global.css web/src/privacy/LocationConsentDialog.tsx web/tests/privacy.test.tsx
git commit -m "feat: start restaurant discovery from a chosen landmark"
```

### Task 8: Verify the complete journey and document configuration

**Files:**
- Modify: `web/e2e/restaurant-production.spec.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/privacy.md` only if it already exists

- [ ] **Step 1: Add failing E2E scenarios**

Use an injected AMap adapter fixture so CI does not depend on live credentials:

```ts
test("landmark selection reaches candidate-specific alternatives", async ({ page }) => {
  await installAmapFixture(page, [poiFixture("厦门万象城")]);
  await page.goto("/");
  await page.getByRole("button", { name: "Choose another place" }).click();
  await page.getByRole("searchbox").fill("万象城");
  await page.getByRole("button", { name: /厦门万象城/ }).click();
  await page.getByRole("button", { name: "Choose this place" }).click();
  await finishElimination(page);
  await expect(page.getByText("Selected from real nearby place data")).toBeVisible();
  const firstReasons = await reasonTexts(page);
  await page.getByRole("button", { name: "Pick another" }).click();
  expect(await reasonTexts(page)).not.toEqual(firstReasons);
});

test("map failure leaves current location usable", async ({ page }) => {
  await installFailingAmapFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Choose another place" }).click();
  await expect(page.getByRole("button", { name: "Retry map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pick for me" })).toBeVisible();
});
```

- [ ] **Step 2: Run E2E and verify RED**

Run: `pnpm --dir web e2e -- restaurant-production.spec.ts`

Expected: FAIL until fixture hooks and final accessible UI integration are complete.

- [ ] **Step 3: Close only E2E integration gaps and update docs**

Limit code changes to adapter injection, accessible names, and responsive defects revealed by E2E. Do not add production fixture restaurants or another map implementation.

Document the three environment names, backend-versus-browser purpose, production security-code proxy requirement, memory-only location/POI boundary, fixed 3 km radius, and exploration-mode semantics.

- [ ] **Step 4: Run full verification**

```bash
make test
make lint
make build
pnpm --dir web e2e
```

Expected: all backend/frontend tests and E2E pass; lint has zero warnings/errors; production build succeeds.

- [ ] **Step 5: Check repository hygiene**

```bash
git diff --check
git status --short
git ls-files .env.local
```

Expected: no whitespace errors; only intended tracked changes; `.env.local` produces no output.

- [ ] **Step 6: Commit**

```bash
git add web/e2e/restaurant-production.spec.ts README.md README.zh-CN.md
git commit -m "test: verify map-first restaurant journey"
```

If `docs/privacy.md` exists and changed, include it in `git add`. Do not create a redundant privacy document.
