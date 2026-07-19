# Restaurant-First Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OneDish's primary journey a one-tap, location-first flow that recommends one real nearby restaurant, while retaining the existing dish-first experience as an explicitly labeled offline demo.

**Architecture:** The FastAPI backend discovers AMap observations and locally stored Overture records concurrently, normalizes and deduplicates them, creates a complete deterministic ranking, and optionally lets an OpenAI Responses API adapter choose only from the top ten IDs. The React client receives a ranked active-session response, keeps all provider records and precise coordinates in module memory only, renders real elimination counts, and rotates to the next restaurant without another network call. A feature flag keeps the old offline demo independently reachable during rollout.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, httpx, OpenAI Python SDK, pytest/respx; React 19, TypeScript 5.8, Vite, Motion, Vitest/Testing Library, Playwright.

---

## Contract and privacy invariants

These invariants apply to every task below:

- `POST /api/v1/restaurants/recommend` is the only new recommendation call. It receives precise coordinates in the request body, never in a URL.
- The response may contain active AMap observations, but the frontend must never pass it to `saveDecision`, Dexie, local/session storage, analytics, or logs.
- AMap records are never cached by the backend. Overture records are read from a licensed local artifact.
- The deterministic scorer always returns a usable ranked list. AI is optional, receives at most ten minimized candidates without coordinates, and has an exact 2,000 ms budget.
- AI can return only a candidate ID and allowlisted reason codes. The backend validates both against evidence before changing the winner.
- `Pick another` is an in-memory list rotation and performs zero network requests.
- Missing provider values are omitted; they are never guessed. Allergy safety is never claimed without menu evidence.

### Task 1: Add restaurant-first wire contracts

**Files:**
- Create: `backend/src/onedish_api/restaurant_domain.py`
- Modify: `backend/src/onedish_api/domain.py`
- Test: `backend/tests/test_restaurant_domain.py`

- [ ] **Step 1: Write failing strict-contract tests**

```python
# backend/tests/test_restaurant_domain.py
import pytest
from pydantic import ValidationError

from onedish_api.restaurant_domain import (
    RestaurantCandidate,
    RestaurantEvidence,
    RestaurantProfile,
    RestaurantRecommendRequest,
)


def candidate() -> RestaurantCandidate:
    return RestaurantCandidate(
        id="amap:B0TEST",
        name="沙茶里",
        category="闽南菜",
        cuisine_tags=("fujian",),
        distance_m=620,
        rating=4.6,
        average_cost_minor=5200,
        currency="CNY",
        open_state="unknown",
        navigation_url="https://uri.amap.com/marker?position=118.1,24.4",
        source_kind="amap_place",
        attribution="高德地图",
        evidence=RestaurantEvidence(
            distance=True, rating=True, average_cost=True, category=True,
            open_state=False, menu=False,
        ),
    )


def test_request_rejects_unknown_profile_fields() -> None:
    with pytest.raises(ValidationError):
        RestaurantRecommendRequest(
            latitude=24.4798,
            longitude=118.0894,
            locale="zh-CN",
            meal_period="lunch",
            profile={"budget_minor": 6000, "weight": 70},
        )


def test_amap_candidate_is_explicitly_active_only() -> None:
    value = candidate()
    assert value.persistence == "active_only"
    assert value.id.startswith("amap:")


def test_profile_defaults_are_one_tap_safe() -> None:
    profile = RestaurantProfile()
    assert profile.max_distance_m == 1500
    assert profile.preferred_cuisines == ()
```

- [ ] **Step 2: Run the test and verify it fails on the missing module**

Run: `backend/.venv/bin/pytest backend/tests/test_restaurant_domain.py -q`

Expected: `ModuleNotFoundError: onedish_api.restaurant_domain`.

- [ ] **Step 3: Implement immutable contracts**

Create these Pydantic models in `restaurant_domain.py` using the existing `StrictFrozenModel`:

```python
RestaurantSource = Literal["amap_place", "overture_place"]
RestaurantPersistence = Literal["active_only", "licensed_open_data"]
RestaurantReasonCode = Literal[
    "nearby", "budget_match", "meal_period_match", "taste_match",
    "history_diversity", "high_confidence",
]

class RestaurantEvidence(StrictFrozenModel):
    distance: bool = True
    rating: bool = False
    average_cost: bool = False
    category: bool = False
    open_state: bool = False
    menu: bool = False

class RestaurantCandidate(StrictFrozenModel):
    id: str = Field(pattern=r"^(amap|overture):[^\s]{1,120}$")
    name: str = Field(min_length=1, max_length=160)
    category: str | None = Field(default=None, max_length=100)
    cuisine_tags: tuple[str, ...] = Field(default=(), max_length=6)
    distance_m: int = Field(ge=0, le=50_000)
    rating: float | None = Field(default=None, ge=0, le=10)
    average_cost_minor: int | None = Field(default=None, ge=0, le=1_000_000)
    currency: Literal["CNY", "USD"] | None = None
    open_state: Literal["open", "closed", "unknown"] = "unknown"
    navigation_url: str | None = None
    source_kind: RestaurantSource
    attribution: str = Field(min_length=1, max_length=160)
    confidence: float = Field(default=0.5, ge=0, le=1)
    persistence: RestaurantPersistence = "active_only"
    evidence: RestaurantEvidence

class RestaurantProfile(StrictFrozenModel):
    budget_minor: int | None = Field(default=None, ge=100, le=1_000_000)
    currency: Literal["CNY", "USD"] = "CNY"
    preferred_cuisines: tuple[str, ...] = Field(default=(), max_length=8)
    max_distance_m: int = Field(default=1500, ge=500, le=3000)

class RestaurantHistorySummary(StrictFrozenModel):
    recent_cuisines: dict[str, int] = Field(default_factory=dict)
    cuisine_preferences: dict[str, float] = Field(default_factory=dict)

class RestaurantRecommendRequest(StrictFrozenModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    locale: Literal["en", "zh-CN"] = "zh-CN"
    meal_period: Literal["breakfast", "lunch", "dinner"]
    profile: RestaurantProfile = Field(default_factory=RestaurantProfile)
    history: RestaurantHistorySummary = Field(default_factory=RestaurantHistorySummary)

class RestaurantTraceStage(StrictFrozenModel):
    id: Literal["nearby", "constraints", "habits", "winner"]
    input_count: int = Field(ge=0)
    survivor_count: int = Field(ge=0)

class RankedRestaurant(StrictFrozenModel):
    candidate: RestaurantCandidate
    score: float = Field(ge=0, le=100)
    reason_codes: tuple[RestaurantReasonCode, ...] = Field(max_length=3)

class RestaurantRecommendResponse(StrictFrozenModel):
    schema_version: Literal["restaurant-recommendation.v1"]
    session_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    ranked: tuple[RankedRestaurant, ...] = Field(min_length=1, max_length=25)
    trace: tuple[RestaurantTraceStage, ...] = Field(min_length=1)
    selection_source: Literal["ai_rerank", "deterministic"]
    model_status: Literal["selected", "disabled", "timeout", "invalid", "error"]
    radius_m: Literal[1500, 3000]
```

Add `"overture_place"` to `Place.source_kind` in `domain.py`, because provider adapters share the existing minimized `Place` observation type before normalization.

- [ ] **Step 4: Run contract tests**

Run: `backend/.venv/bin/pytest backend/tests/test_restaurant_domain.py backend/tests/test_domain.py -q`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/onedish_api/domain.py backend/src/onedish_api/restaurant_domain.py backend/tests/test_restaurant_domain.py
git commit -m "feat: add restaurant recommendation contracts"
```

### Task 2: Enforce provider privacy and load licensed Overture data

**Files:**
- Modify: `backend/src/onedish_api/providers/amap.py`
- Create: `backend/src/onedish_api/providers/overture.py`
- Create: `data/restaurants.xiamen.v1.json`
- Create: `scripts/build_xiamen_restaurants.py`
- Modify: `backend/src/onedish_api/settings.py`
- Test: `backend/tests/test_places.py`
- Test: `backend/tests/test_overture.py`

- [ ] **Step 1: Add a failing test proving AMap does not cache**

In `test_places.py`, make two identical `nearby` calls under `respx` and assert both coordinate-conversion and around-search routes receive two calls. Also assert the provider has no `_cache` attribute.

- [ ] **Step 2: Remove every cache path from AMap**

Delete the `monotonic` import, `cache_seconds` argument, `_cache_seconds`, `_cache`, lookup, and write. Keep the five-second bounded provider timeout and existing key-redaction behavior.

- [ ] **Step 3: Write failing Overture radius tests**

Create a temporary JSON artifact with two Xiamen records, instantiate `OverturePlacesProvider(path)`, and assert a 1,500 m query includes the nearby record, excludes the far record, computes distance, uses `source_kind="overture_place"`, and preserves the artifact's attribution.

- [ ] **Step 4: Implement the local Overture provider**

`OverturePlacesProvider` must load and validate the JSON once at construction, calculate Haversine distance at query time, sort by `(distance_m, name.casefold(), id)`, and return at most `query.limit`. Its output uses an HTTPS OpenStreetMap marker URL containing only the restaurant destination coordinates, never the user's origin, and never needs network access.

The artifact root contains `schema_version="onedish-overture.v1"`, an ISO-8601 `generated_at`, fixed Xiamen `bbox=[117.85, 24.38, 118.30, 24.75]`, an artifact-level attribution string, and a `places` array. Every place contains the real upstream ID, name, category, WGS84 latitude/longitude, confidence, and non-empty upstream-source list. The committed artifact is generated from licensed upstream records; do not handwrite demo restaurants into it.

The build script uses DuckDB only as a CLI-time tool, accepts `--input` and `--output`, filters the fixed Xiamen bbox and food/restaurant categories, writes the schema above, and never becomes a production dependency. Commit only records whose upstream license permits this artifact; keep all attribution fields.

- [ ] **Step 5: Add the artifact setting**

Add `overture_places_path` to `Settings`, defaulting to `data/restaurants.xiamen.v1.json`.

- [ ] **Step 6: Run provider tests**

Run: `backend/.venv/bin/pytest backend/tests/test_places.py backend/tests/test_overture.py -q`

Expected: all tests pass and the identical AMap query makes two upstream request pairs.

- [ ] **Step 7: Commit**

```bash
git add backend/src/onedish_api/providers backend/src/onedish_api/settings.py backend/tests/test_places.py backend/tests/test_overture.py data/restaurants.xiamen.v1.json scripts/build_xiamen_restaurants.py
git commit -m "feat: add privacy-safe restaurant discovery sources"
```

### Task 3: Normalize, deduplicate, relax, and score candidates

**Files:**
- Create: `backend/src/onedish_api/restaurants/normalizer.py`
- Create: `backend/src/onedish_api/restaurants/scoring.py`
- Create: `backend/src/onedish_api/restaurants/__init__.py`
- Test: `backend/tests/test_restaurant_normalizer.py`
- Test: `backend/tests/test_restaurant_scoring.py`

- [ ] **Step 1: Write failing normalization tests**

Cover source-scoped IDs, punctuation/spacing normalization for Chinese and English names, and deduplication when normalized names match within 80 metres. When AMap and Overture duplicate, return one active-only AMap candidate for the live response; do not copy AMap fields into a persistent Overture record.

- [ ] **Step 2: Implement pure normalization**

Expose `normalize_name(value: str) -> str`, `normalize_places(places: Iterable[Place])`, and `deduplicate(candidates: Iterable[RestaurantCandidate])` as pure functions. Both collection functions return immutable tuples of `RestaurantCandidate`.

Use Unicode NFKC, `casefold`, removal of whitespace and punctuation, and Haversine distance. Cuisine tags come only from a conservative category map committed in the module; unknown categories produce `()`.

- [ ] **Step 3: Write failing scoring tests**

Test all six weights, missing-field weight renormalization, deterministic ID tie-breaking, closed-place removal, preferred-cuisine/budget/radius relaxation order, and real monotonic trace counts. Explicitly test that missing menu evidence produces no allergen-safety reason.

- [ ] **Step 4: Implement deterministic scoring**

Expose:

```python
WEIGHTS = {
    "distance": 25.0, "budget": 20.0, "meal_period": 20.0,
    "history": 15.0, "taste": 15.0, "confidence": 5.0,
}

class ScoringResult(NamedTuple):
    ranked: Sequence[RankedRestaurant]
    trace: Sequence[RestaurantTraceStage]
```

Expose `score_restaurants(candidates, request) -> ScoringResult`, accepting an immutable candidate sequence and a `RestaurantRecommendRequest`.

For each candidate, include only supported signals, divide its weighted sum by the sum of included weights, and multiply by 100. Sort by `(-score, distance_m, id)`. Generate at most three supported reasons in descending contribution order. Relax only when a soft filter would yield zero candidates, in the order cuisine, budget, preferred radius. Definitely closed places are never relaxed.

- [ ] **Step 5: Run focused tests**

Run: `backend/.venv/bin/pytest backend/tests/test_restaurant_normalizer.py backend/tests/test_restaurant_scoring.py -q`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/onedish_api/restaurants backend/tests/test_restaurant_normalizer.py backend/tests/test_restaurant_scoring.py
git commit -m "feat: rank normalized nearby restaurants"
```

### Task 4: Add the optional, constrained OpenAI reranker

**Files:**
- Create: `backend/src/onedish_api/rerankers/base.py`
- Create: `backend/src/onedish_api/rerankers/openai.py`
- Create: `backend/src/onedish_api/rerankers/__init__.py`
- Modify: `backend/src/onedish_api/settings.py`
- Test: `backend/tests/test_restaurant_reranker.py`

- [ ] **Step 1: Write failing adapter and validation tests**

Use a fake reranker for valid selection, foreign candidate ID, unsupported reason code, evidence-unsupported reason, malformed response, exception, and a coroutine exceeding 2.0 seconds. Assert every invalid case keeps deterministic rank zero.

- [ ] **Step 2: Define the narrow protocol and result**

```python
class RerankChoice(StrictFrozenModel):
    restaurant_id: str
    reason_codes: Sequence[RestaurantReasonCode] = Field(max_length=3)

class RestaurantReranker(Protocol):
    async def choose(
        self,
        candidates: Sequence[RankedRestaurant],
        request: RestaurantRecommendRequest,
    ) -> RerankChoice:
        raise NotImplementedError
```

- [ ] **Step 3: Implement OpenAI Responses structured output**

Use the installed OpenAI SDK's async Responses API. Send at most ten objects containing only `id`, category/cuisine tags, distance bucket, cost bucket, rating when present, deterministic score, and supported reason codes. Do not send coordinates, address, navigation URL, complete history, or provider payloads. Build a strict JSON schema whose `restaurant_id.enum` is the supplied IDs and whose reason enum is the allowlist.

Add settings:

```python
openai_rerank_model: str = "gpt-5-mini"
restaurant_rerank_timeout_seconds: float = Field(default=2.0, ge=2.0, le=2.0)
```

- [ ] **Step 4: Implement one validator used for AI and fake adapters**

`validate_choice(choice, ranked)` returns the selected `RankedRestaurant` only when the ID exists and each reason appears in that candidate's deterministic `reason_codes`. Otherwise it returns `None`. The orchestrator passes the `reranker.choose` coroutine to `asyncio.wait_for` with `timeout=2.0` and maps outcomes to `selected`, `timeout`, `invalid`, or `error`.

- [ ] **Step 5: Run focused tests**

Run: `backend/.venv/bin/pytest backend/tests/test_restaurant_reranker.py -q`

Expected: all tests pass; timeout test completes just over two seconds, not the fake adapter's full delay.

- [ ] **Step 6: Commit**

```bash
git add backend/src/onedish_api/rerankers backend/src/onedish_api/settings.py backend/tests/test_restaurant_reranker.py
git commit -m "feat: constrain AI restaurant reranking"
```

### Task 5: Orchestrate discovery and expose the restaurant endpoint

**Files:**
- Create: `backend/src/onedish_api/restaurants/service.py`
- Modify: `backend/src/onedish_api/routes.py`
- Modify: `backend/src/onedish_api/app.py`
- Test: `backend/tests/test_restaurant_service.py`
- Test: `backend/tests/test_restaurant_api.py`

- [ ] **Step 1: Write failing service tests**

Use recording fake providers to assert: providers run concurrently; one provider failure is isolated; zero merged candidates at 1,500 m triggers exactly one retry at 3,000 m; both failures return a typed unavailable error; reranker failure falls back; response winner is always in `ranked`; no request coordinate or restaurant detail is emitted through a captured application logger.

- [ ] **Step 2: Implement orchestration**

`RestaurantRecommendationService.recommend(request)` must:

1. issue Overture and optional AMap `nearby` calls together with `asyncio.gather`, setting `return_exceptions=True`;
2. try 1,500 m first, then 3,000 m only if the normalized merged set is empty;
3. normalize, deduplicate, and deterministically score;
4. pass only `ranked[:10]` to the optional reranker;
5. if AI validly selects rank `n`, return `(ranked[n], *ranked[:n], *ranked[n+1:])` so rank zero is the displayed winner;
6. generate `session_id=secrets.token_hex(16)`;
7. return no server-side session or cache handle.

- [ ] **Step 3: Write failing API contract tests**

Assert success, 422 for unknown/invalid fields, 503 for no usable provider, deterministic mode without an OpenAI key, and that the old `/api/v1/recommend` demo endpoint still behaves unchanged.

- [ ] **Step 4: Wire the app**

Construct `OverturePlacesProvider` whenever the artifact exists. Construct `AmapPlacesProvider` only with a key. Construct `OpenAIRestaurantReranker` only with `openai_api_key`. Inject the service into `build_router` and add:

```python
@router.post(
    "/api/v1/restaurants/recommend",
    response_model=RestaurantRecommendResponse,
)
async def recommend_restaurant(
    request: RestaurantRecommendRequest,
) -> RestaurantRecommendResponse:
    try:
        return await restaurant_service.recommend(request)
    except RestaurantDiscoveryUnavailable:
        raise HTTPException(
            status_code=503,
            detail="restaurant discovery unavailable",
        ) from None
```

- [ ] **Step 5: Run backend regression suite**

Run: `backend/.venv/bin/pytest backend/tests -q`

Expected: all tests pass, including existing dish-first API tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/onedish_api backend/tests/test_restaurant_service.py backend/tests/test_restaurant_api.py
git commit -m "feat: expose restaurant-first recommendation API"
```

### Task 6: Add frontend contracts, API parsing, and active-only session state

**Files:**
- Create: `web/src/restaurants/types.ts`
- Create: `web/src/restaurants/parser.ts`
- Create: `web/src/restaurants/session-store.ts`
- Modify: `web/src/api/client.ts`
- Test: `web/tests/restaurant-parser.test.ts`
- Test: `web/tests/restaurant-session-store.test.ts`

- [ ] **Step 1: Write failing parser tests**

Test valid parsing, winner membership, non-increasing trace counts, foreign source kinds, invalid navigation schemes, and missing ranked candidates. The parser must accept only `https://` navigation URLs.

- [ ] **Step 2: Mirror the backend types and implement runtime validation**

Define `RestaurantRecommendRequest`, `RestaurantCandidate`, `RankedRestaurant`, `RestaurantTraceStage`, and `RestaurantRecommendResponse` as readonly interfaces. `parseRestaurantRecommendation` validates `schema_version`, unique IDs, `ranked.length` from 1–25, valid source/persistence combinations, score bounds, and real trace counts.

- [ ] **Step 3: Write failing active-session tests**

Assert `createRestaurantSession(response)` stores the response by session ID in module memory, `getCurrentRestaurant` returns rank zero, repeated `pickAnotherRestaurant` returns unique later ranks, exhaustion is explicit, `clearRestaurantSessions` removes all data, and no Dexie/localStorage/sessionStorage method is called.

- [ ] **Step 4: Implement the memory-only store**

```ts
interface ActiveRestaurantSession {
  readonly response: RestaurantRecommendResponse;
  index: number;
}

const sessions = new Map<string, ActiveRestaurantSession>();

export function createRestaurantSession(response: RestaurantRecommendResponse): string;
export function getRestaurantSession(id: string): ActiveRestaurantSession | null;
export function getCurrentRestaurant(id: string): RankedRestaurant | null;
export function pickAnotherRestaurant(id: string): RankedRestaurant | null;
export function clearRestaurantSessions(): void;
```

Do not import anything from `db/db.ts` in this module.

- [ ] **Step 5: Add the API call**

Add `recommendRestaurant(payload, signal)` to `client.ts`, POSTing to `/api/v1/restaurants/recommend`, awaiting `boundedFetch`, and passing its decoded value to `parseRestaurantRecommendation`.

- [ ] **Step 6: Run frontend focused tests**

Run: `pnpm --dir web test -- --run web/tests/restaurant-parser.test.ts web/tests/restaurant-session-store.test.ts`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/restaurants web/src/api/client.ts web/tests/restaurant-parser.test.ts web/tests/restaurant-session-store.test.ts
git commit -m "feat: add active-only restaurant sessions"
```

### Task 7: Turn the home action into one-tap location-first discovery

**Files:**
- Create: `web/src/restaurants/start.ts`
- Modify: `web/src/home/HomePage.tsx`
- Modify: `web/src/privacy/LocationConsentDialog.tsx`
- Modify: `web/src/location/geolocation.ts`
- Modify: `web/src/recommendation/context.ts`
- Test: `web/tests/restaurant-start.test.ts`
- Test: `web/tests/home.test.tsx`

- [ ] **Step 1: Write failing journey tests**

Test: primary tap opens the purpose notice; allow triggers one geolocation request then one restaurant request; deny shows only `Use central Xiamen` and `Try location again`; central Xiamen uses `{latitude: 24.4798, longitude: 118.0894}`; success creates an active session and navigates to `/restaurants/choose/:sessionId`; old demo link remains available and labeled offline.

- [ ] **Step 2: Implement the start coordinator**

`startRestaurantRecommendation` accepts coordinates, current locale/profile/history, and `now`; derives meal period; sends only summarized cuisines/preferences; creates the memory session; returns the session ID. It must not save a decision or location.

- [ ] **Step 3: Update HomePage state flow**

Add states `idle | consent | locating | recommending | location_error`. The main action starts at `consent`. `onAllow` calls the browser geolocation wrapper and then the coordinator. Location denial renders the two recovery actions. Keep profile adjustments optional and silent. Add a secondary link to `/demo` for the old experience.

- [ ] **Step 4: Keep privacy access records abstract**

Recording that location was accessed is allowed, but the event contains only category, purpose, recipient, and timestamp. It must contain no location or place fields. Update the recipient label to the sources actually configured by the backend rather than promising both every time.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --dir web test -- --run web/tests/restaurant-start.test.ts web/tests/home.test.tsx web/tests/geolocation.test.ts web/tests/privacy-store.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/restaurants/start.ts web/src/home/HomePage.tsx web/src/privacy/LocationConsentDialog.tsx web/src/location/geolocation.ts web/src/recommendation/context.ts web/tests
git commit -m "feat: start nearby discovery with one tap"
```

### Task 8: Render real elimination counts and the restaurant winner

**Files:**
- Create: `web/src/restaurants/RestaurantEliminationPage.tsx`
- Create: `web/src/restaurants/RestaurantWinnerPage.tsx`
- Create: `web/src/restaurants/RestaurantEvidence.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/elimination/EliminationStack.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/src/styles/motion.css`
- Test: `web/tests/restaurant-elimination.test.tsx`
- Test: `web/tests/restaurant-winner.test.tsx`

- [ ] **Step 1: Write failing page tests**

Assert elimination renders the response's exact counts and never `99` unless the response contains 99; skip reveals the final state; reduced motion starts final; a missing memory session shows `Start again`; winner renders only supported rating/cost/open fields; invalid navigation URL is absent; AI fallback label is visible; `Pick another` changes the winner with no fetch; exhaustion disables the button.

- [ ] **Step 2: Implement the elimination page**

Read the active session synchronously from the memory store, animate its `trace` stages using the existing 360 ms cadence and `AnimatedCount`, and navigate to `/restaurants/winner/:sessionId`. Do not read Dexie. Update `EliminationStack` to accept generic display names and IDs without assuming dishes.

- [ ] **Step 3: Implement the winner page**

Render restaurant name, category/cuisine, distance, and only evidenced rating/cost/open state. `Go here` opens the validated HTTPS navigation URL. `Pick another` calls the memory store, updates local state, and does not navigate or fetch. `Why this one` maps only the returned reason codes to fixed localized product copy.

- [ ] **Step 4: Add routes while preserving offline demo routes**

```tsx
{ path: "restaurants/choose/:sessionId", element: <RestaurantEliminationPage /> },
{ path: "restaurants/winner/:sessionId", element: <RestaurantWinnerPage /> },
{ path: "demo", element: <OfflineDemoHomePage /> },
```

Move the current dish-first `HomePage` behavior into `OfflineDemoHomePage`; keep its existing `/choose`, `/winner`, and `/nearby` routes functional.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --dir web test -- --run web/tests/restaurant-elimination.test.tsx web/tests/restaurant-winner.test.tsx web/tests/elimination-stack.test.tsx`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/restaurants web/src/app/router.tsx web/src/elimination/EliminationStack.tsx web/src/styles web/tests
git commit -m "feat: show real restaurant decision journey"
```

### Task 9: Finish bilingual product copy, privacy disclosure, and rollout flag

**Files:**
- Modify: `web/src/i18n/messages.ts`
- Modify: `web/src/privacy/PrivacyPage.tsx`
- Modify: `web/src/privacy/privacy-model.ts`
- Modify: `web/src/shared/Layout.tsx`
- Modify: `web/src/vite-env.d.ts`
- Create: `web/src/app/features.ts`
- Create: `web/src/demo/OfflineDemoHomePage.tsx`
- Modify: `.env.example`
- Test: `web/tests/product-copy.test.ts`
- Test: `web/tests/i18n-ui.test.tsx`
- Test: `web/tests/privacy.test.tsx`

- [ ] **Step 1: Write failing copy and locale tests**

Require complete English and Chinese keys for home, consent, location recovery, elimination, restaurant evidence, fallback status, navigation, empty state, and offline-demo labeling. Assert there is no mixed-language hard-coded UI string and English prices use USD formatting while Chinese prices use CNY.

- [ ] **Step 2: Add the feature flag**

```ts
export const restaurantFirstEnabled =
  import.meta.env.VITE_RESTAURANT_FIRST !== "0";
```

Declare the environment type, document `VITE_RESTAURANT_FIRST=1`, and route `/` to restaurant-first when enabled. When disabled, route `/` to the offline demo. `/demo` always remains available.

- [ ] **Step 3: Make privacy disclosure precise**

State in both locales that precise location and AMap place observations are active-use only and not saved by OneDish; open restaurant records may be stored with source attribution; abstract preference/history signals may be stored locally; the model receives only minimized candidate fields and not coordinates. Do not claim control over browser, map-provider, or network-provider retention.

- [ ] **Step 4: Replace implementation/reporting language with product language**

Use short user-facing statements such as `Your recent choices shape the next pick` rather than `Repeated signals grow larger`, and `See why this restaurant fits now` rather than `Select a signal to inspect evidence`. Run the existing product-copy denylist tests after adding the new keys.

- [ ] **Step 5: Run locale/privacy tests**

Run: `pnpm --dir web test -- --run web/tests/product-copy.test.ts web/tests/i18n-ui.test.tsx web/tests/privacy.test.tsx`

Expected: all tests pass in both locales.

- [ ] **Step 6: Commit**

```bash
git add web/src .env.example web/tests
git commit -m "feat: polish restaurant rollout and privacy copy"
```

### Task 10: End-to-end verification, documentation, and rollout

**Files:**
- Create: `web/e2e/restaurant-first.spec.ts`
- Modify: `web/playwright.config.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/privacy.md`
- Modify: `docs/runbook.md`

- [ ] **Step 1: Add deterministic E2E fixtures**

Route-intercept the restaurant endpoint and browser geolocation. Cover one-tap approval, central-Xiamen fallback, exact trace counts, deterministic fallback label, different in-memory second pick with zero additional endpoint calls, valid map link, English/USD, Chinese/CNY, missing session recovery, and reduced motion.

- [ ] **Step 2: Add a live smoke test behind an explicit flag**

The live AMap test runs only when `ONEDISH_LIVE_AMAP_TEST=1` and `ONEDISH_AMAP_WEB_KEY` exist. It asserts only status, non-empty candidate IDs, source labels, and response time; it never snapshots or writes returned provider content.

- [ ] **Step 3: Update product and operator docs**

Document:

- local startup and required/optional keys;
- Overture artifact provenance and regeneration command;
- AMap active-only restriction and absence of cache;
- OpenAI's optional 2,000 ms constrained role;
- feature flag rollback with `VITE_RESTAURANT_FIRST=0`;
- `/demo` as the fixed offline dish showcase;
- metrics limited to durations, provider status classes, counts, and model outcome—never coordinates or restaurant details.

- [ ] **Step 4: Run the complete verification matrix**

```bash
make test
make lint
make build
pnpm --dir web e2e
git diff --check
git status --short
```

Expected:

- all backend and frontend unit tests pass;
- lint reports zero warnings/errors;
- backend package and frontend production build succeed;
- all Playwright scenarios pass;
- `git diff --check` emits nothing;
- status contains only the intended documentation and test changes before the final commit.

- [ ] **Step 5: Perform explicit privacy acceptance checks**

Search the implementation and assert:

```bash
rg "saveDecision|localStorage|sessionStorage|decisionSessions" web/src/restaurants
rg "_cache|cache_seconds|monotonic" backend/src/onedish_api/providers/amap.py
rg "latitude|longitude|navigation_url" backend/src/onedish_api/restaurants backend/src/onedish_api/rerankers
```

Expected:

- first command returns no matches;
- second command returns no matches;
- third command shows coordinates only in discovery/normalization, never in reranker payload construction or logs.

- [ ] **Step 6: Commit the verified rollout**

```bash
git add web/e2e web/playwright.config.ts README.md README.zh-CN.md docs
git commit -m "test: verify restaurant-first production journey"
```

## Final acceptance checklist

- [ ] One primary tap precedes the browser permission decision; no form or chat is required.
- [ ] The displayed winner belongs to the active provider-derived candidate set.
- [ ] The animation uses actual response counts.
- [ ] A missing or invalid model result cannot reach the UI.
- [ ] The flow works without an OpenAI key and survives either provider failing.
- [ ] `Pick another` changes the restaurant in under 200 ms with no network request.
- [ ] AMap records and precise coordinates are absent from all OneDish persistence and logs.
- [ ] Unsupported price, rating, open status, menu, nutrition, delivery, and allergen claims are omitted.
- [ ] English and Chinese pages contain no mixed-language product copy; currency follows locale.
- [ ] The old dish-first experience remains reachable as a clearly labeled offline demo.
