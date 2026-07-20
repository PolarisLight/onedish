# Restaurant Decision V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading V1 restaurant sorter with a map-evidence-only V2 that supports a broad intent taxonomy, 2/3/5 km progressive discovery, transparent budget stretch, fixed scoring, controlled variety, and provider-safe local intent history.

**Architecture:** The backend owns taxonomy mapping, eligibility, scoring, progressive discovery, and the randomized session order. The frontend sends only current restaurant intent plus sanitized local intent events, strictly parses the V2 response, and renders real trace and budget evidence. AMap POI fields remain active-session data; IndexedDB stores only user-entered OneDish tags, budget bands, timestamps, and accepted actions.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, httpx/respx, pytest; React 19, TypeScript, Dexie, Vitest, Testing Library, Playwright; AMap Place Search v5.

**Design source:** `docs/superpowers/specs/2026-07-20-restaurant-decision-v2-design.md`

---

## File structure

### Backend

- Create `backend/src/onedish_api/restaurants/taxonomy.py`: canonical intent tags and AMap query/category mappings.
- Create `backend/src/onedish_api/restaurants/budget.py`: currency-aware stretch ceilings, states, and penalties.
- Rewrite `backend/src/onedish_api/restaurant_domain.py`: strict V2 request, response, error, trace, and budget contracts.
- Rewrite `backend/src/onedish_api/restaurants/scoring.py`: eligibility, fixed scoring, quality pool, and weighted permutation.
- Modify `backend/src/onedish_api/restaurants/service.py`: progressive 2/3/5 km discovery and structured failures.
- Modify `backend/src/onedish_api/providers/base.py`: pass AMap keywords and type codes without provider-specific coupling.
- Modify `backend/src/onedish_api/providers/amap.py`: preserve `typecode` and send taxonomy filters.
- Modify `backend/src/onedish_api/domain.py`: carry transient provider category codes.
- Modify `backend/src/onedish_api/restaurants/normalizer.py`: classify current-request candidates with the canonical taxonomy.
- Modify `backend/src/onedish_api/routes.py`: return V2 and sanitized `409 no_match` / `503 provider_unavailable` errors.
- Modify `backend/src/onedish_api/app.py`: remove restaurant AI reranker wiring.
- Delete `backend/src/onedish_api/rerankers/base.py`, `backend/src/onedish_api/rerankers/openai.py`, and their restaurant-only tests after service migration.

### Frontend

- Create `web/src/restaurants/intent-tags.ts`: TypeScript taxonomy, groups, shortcuts, and normalizer.
- Create `web/src/restaurants/preferences.ts`: current restaurant preferences and defaults.
- Create `web/src/restaurants/RestaurantPreferenceForm.tsx`: compact shortcuts plus grouped “More” selector and optional budget.
- Rewrite `web/src/restaurants/types.ts` and `web/src/restaurants/parser.ts`: strict V2 wire contract.
- Modify `web/src/restaurants/start.ts`: send selected tags and sanitized 14-day intent events.
- Modify `web/src/restaurants/session-store.ts`: keep V2 randomized order only in memory.
- Modify `web/src/restaurants/RestaurantEliminationPage.tsx`: render actual search/eligibility/pool stages.
- Modify `web/src/restaurants/RestaurantWinnerPage.tsx`: render radius, matched tags, and truthful budget state; persist only safe user intent.
- Modify `web/src/db/db.ts`: add a dedicated sanitized intent-event table and restaurant preference setting.
- Modify `web/src/home/HomePage.tsx` and `web/src/profile/ProfileSheet.tsx`: use restaurant-only controls and scoped no-match recovery.
- Modify `web/src/api/client.ts`: parse structured restaurant errors.
- Modify `web/src/i18n/messages.ts` and styles: complete bilingual taxonomy, budget states, and responsive grouped selector.

---

### Task 1: Canonical intent taxonomy and AMap query contract

**Files:**
- Create: `backend/src/onedish_api/restaurants/taxonomy.py`
- Modify: `backend/src/onedish_api/providers/base.py`
- Modify: `backend/src/onedish_api/providers/amap.py`
- Modify: `backend/src/onedish_api/domain.py`
- Modify: `backend/src/onedish_api/restaurants/normalizer.py`
- Test: `backend/tests/test_restaurant_taxonomy.py`
- Test: `backend/tests/test_places.py`
- Test: `backend/tests/test_restaurant_normalizer.py`

- [ ] **Step 1: Write failing taxonomy tests**

Create tests that require every shipped tag to have a query mapping and require conservative category matching:

```python
import pytest

from onedish_api.restaurants.taxonomy import INTENT_TAGS, query_filter, tags_for_place


def test_every_intent_tag_has_a_provider_filter() -> None:
    assert len(INTENT_TAGS) == 25
    assert all(spec.keywords or spec.type_codes for spec in INTENT_TAGS.values())


@pytest.mark.parametrize("tag", tuple(INTENT_TAGS))
def test_each_user_tag_builds_one_provider_filter(tag: str) -> None:
    filters = query_filter(tag)
    assert filters.keywords or filters.type_codes


def test_unknown_tag_is_rejected() -> None:
    with pytest.raises(KeyError):
        query_filter("not-a-tag")


def test_category_tokens_do_not_cross_match_unrelated_places() -> None:
    assert tags_for_place("寿司 · 餐饮服务;外国餐厅;日本料理", "050201") == (
        "japanese",
    )
    assert "japanese" not in tags_for_place("咖啡厅", "050500")
```

- [ ] **Step 2: Run the taxonomy tests and verify RED**

Run:

```bash
backend/.venv/bin/pytest -q backend/tests/test_restaurant_taxonomy.py
```

Expected: collection fails because `onedish_api.restaurants.taxonomy` does not exist.

- [ ] **Step 3: Add the canonical taxonomy**

Implement an immutable mapping with these exact keys:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class IntentTagSpec:
    keywords: tuple[str, ...]
    type_codes: tuple[str, ...]
    category_tokens: tuple[str, ...]


INTENT_TAGS: dict[str, IntentTagSpec] = {
    "minnan_fujian": IntentTagSpec(("福建菜", "闽南菜"), (), ("闽菜", "闽南", "福建菜")),
    "sichuan_hunan": IntentTagSpec(("川菜", "湘菜"), (), ("川菜", "四川菜", "湘菜", "湖南菜")),
    "cantonese_dim_sum": IntentTagSpec(("粤菜", "早茶"), (), ("粤菜", "广东菜", "早茶")),
    "jiangzhe": IntentTagSpec(("江浙菜",), (), ("江浙菜", "江苏菜", "浙江菜", "本帮江浙菜")),
    "northeastern": IntentTagSpec(("东北菜",), (), ("东北菜",)),
    "yunnan_guizhou": IntentTagSpec(("云南菜", "贵州菜"), (), ("云南菜", "贵州菜", "云贵菜")),
    "northwestern_xinjiang": IntentTagSpec(("西北菜", "新疆菜"), (), ("西北菜", "新疆菜")),
    "home_style": IntentTagSpec(("家常菜",), (), ("家常菜",)),
    "vegetarian": IntentTagSpec(("素食",), (), ("素食", "素菜")),
    "japanese": IntentTagSpec(("日本料理",), (), ("日本料理", "日本菜", "日料")),
    "korean": IntentTagSpec(("韩国料理",), (), ("韩国料理", "韩国菜", "韩餐")),
    "western": IntentTagSpec(("西餐",), (), ("西餐",)),
    "southeast_asian": IntentTagSpec(("东南亚菜",), (), ("东南亚菜", "泰国菜", "越南菜")),
    "indian": IntentTagSpec(("印度菜",), (), ("印度菜", "印度料理")),
    "middle_eastern": IntentTagSpec(("中东菜",), (), ("中东菜", "阿拉伯餐厅")),
    "hot_pot": IntentTagSpec(("火锅",), ("050117",), ("火锅",)),
    "barbecue": IntentTagSpec(("烧烤", "烤肉"), (), ("烧烤", "烤串", "烤肉")),
    "seafood": IntentTagSpec(("海鲜",), (), ("海鲜",)),
    "noodles": IntentTagSpec(("面馆", "粉面"), (), ("面馆", "粉面", "米粉")),
    "dry_pot_grilled_fish": IntentTagSpec(("香锅", "烤鱼"), (), ("香锅", "烤鱼")),
    "snacks_fast_food": IntentTagSpec(("小吃快餐",), (), ("小吃", "快餐")),
    "buffet": IntentTagSpec(("自助餐",), (), ("自助餐",)),
    "coffee": IntentTagSpec(("咖啡厅",), (), ("咖啡厅", "咖啡店")),
    "bakery_dessert": IntentTagSpec(("面包甜点",), (), ("面包", "甜品", "甜点")),
    "drinks": IntentTagSpec(("饮品店",), (), ("饮品", "奶茶", "果汁")),
}
```

Add these exact pure helpers. One selected tag becomes one provider query; multiple selected tags are fanned out and unioned by the service in Task 4. This preserves the product's hard-OR semantics instead of relying on undocumented interaction between AMap's `keywords` and `types` parameters.

```python
@dataclass(frozen=True)
class QueryFilters:
    keywords: tuple[str, ...]
    type_codes: tuple[str, ...]


def query_filter(tag: str) -> QueryFilters:
    spec = INTENT_TAGS[tag]
    return QueryFilters(keywords=spec.keywords, type_codes=spec.type_codes)


def tags_for_place(category: str | None, category_code: str | None) -> tuple[str, ...]:
    haystack = category or ""
    matches = []
    for tag, spec in INTENT_TAGS.items():
        token_match = any(token in haystack for token in spec.category_tokens)
        code_match = bool(category_code and category_code in spec.type_codes)
        if token_match or code_match:
            matches.append(tag)
    return tuple(matches)
```

- [ ] **Step 4: Preserve provider type codes and send one-tag filters**

Add `category_code: str | None = None` to `Place`, add `type_codes: tuple[str, ...] = ()` to `PlaceQuery`, and change the AMap request construction to:

```python
around_params["types"] = "|".join(query.type_codes) if query.type_codes else "050000"
if query.keywords:
    around_params["keywords"] = "|".join(query.keywords)[:80]
```

In `_normalize`, set `category_code=cls._text(raw.get("typecode"))`. In `normalize_places`, call `tags_for_place(place.category, place.category_code)` and place the result in `intent_tags`. Rename the transient candidate field in Task 2 in the same commit if needed to keep the suite compiling between commits.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
backend/.venv/bin/pytest -q \
  backend/tests/test_restaurant_taxonomy.py \
  backend/tests/test_places.py \
  backend/tests/test_restaurant_normalizer.py
```

Expected: all selected tests pass and AMap request assertions include the expected keywords and type codes.

- [ ] **Step 6: Commit taxonomy support**

```bash
git add backend/src/onedish_api/domain.py \
  backend/src/onedish_api/providers/base.py \
  backend/src/onedish_api/providers/amap.py \
  backend/src/onedish_api/restaurants/taxonomy.py \
  backend/src/onedish_api/restaurants/normalizer.py \
  backend/tests/test_restaurant_taxonomy.py \
  backend/tests/test_places.py \
  backend/tests/test_restaurant_normalizer.py
git commit -m "feat(onedish): add restaurant intent taxonomy"
```

### Task 2: Restaurant V2 wire contract

**Files:**
- Rewrite: `backend/src/onedish_api/restaurant_domain.py`
- Test: `backend/tests/test_restaurant_domain.py`
- Test: `backend/tests/test_restaurant_api.py`

- [ ] **Step 1: Write failing strict-contract tests**

Add tests for the V2 request and response shape:

```python
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from onedish_api.restaurant_domain import (
    AcceptedIntent,
    RestaurantProfile,
    RestaurantRecommendRequest,
)


def test_v2_request_accepts_only_user_owned_intent_history() -> None:
    request = RestaurantRecommendRequest(
        latitude=24.48,
        longitude=118.09,
        locale="zh-CN",
        profile=RestaurantProfile(
            selected_tags=("japanese", "barbecue"),
            budget_minor=5000,
            budget_is_explicit=True,
            currency="CNY",
        ),
        recent_intents=(
            AcceptedIntent(
                occurred_at=datetime(2026, 7, 19, tzinfo=UTC),
                selected_tags=("japanese",),
                budget_band_minor=5000,
            ),
        ),
    )
    assert request.schema_version == "restaurant-request.v2"
    assert not hasattr(request, "history")


def test_v2_request_rejects_provider_fields_inside_history() -> None:
    payload = {
        "schema_version": "restaurant-request.v2",
        "latitude": 24.48,
        "longitude": 118.09,
        "profile": {},
        "recent_intents": [{"occurred_at": "2026-07-19T00:00:00Z", "restaurant_name": "x"}],
    }
    with pytest.raises(ValidationError):
        RestaurantRecommendRequest.model_validate(payload)
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
backend/.venv/bin/pytest -q backend/tests/test_restaurant_domain.py backend/tests/test_restaurant_api.py
```

Expected: failures mention missing V2 schema fields and the old V1 literals.

- [ ] **Step 3: Define the V2 models**

Replace cuisine-specific profile/history models with these bounded concepts:

```python
RestaurantIntentTag = Literal[
    "minnan_fujian", "sichuan_hunan", "cantonese_dim_sum", "jiangzhe",
    "northeastern", "yunnan_guizhou", "northwestern_xinjiang", "home_style",
    "vegetarian", "japanese", "korean", "western", "southeast_asian",
    "indian", "middle_eastern", "hot_pot", "barbecue", "seafood", "noodles",
    "dry_pot_grilled_fish", "snacks_fast_food", "buffet", "coffee",
    "bakery_dessert", "drinks",
]
BudgetState = Literal["not_requested", "within", "stretch", "unknown"]
RestaurantReasonCode = Literal[
    "tag_match", "within_budget", "budget_stretch", "budget_unknown",
    "above_median_rating", "nearby", "intent_diversity",
]


class AcceptedIntent(StrictFrozenModel):
    occurred_at: datetime
    selected_tags: tuple[RestaurantIntentTag, ...] = Field(min_length=1, max_length=6)
    budget_band_minor: int | None = Field(default=None, ge=100, le=1_000_000)


class RestaurantProfile(StrictFrozenModel):
    selected_tags: tuple[RestaurantIntentTag, ...] = Field(default=(), max_length=6)
    budget_minor: int | None = Field(default=None, ge=100, le=1_000_000)
    budget_is_explicit: bool = False
    currency: Literal["CNY", "USD"] = "CNY"


class RestaurantRecommendRequest(StrictFrozenModel):
    schema_version: Literal["restaurant-request.v2"] = "restaurant-request.v2"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    locale: Literal["en", "zh-CN"] = "zh-CN"
    profile: RestaurantProfile = Field(default_factory=RestaurantProfile)
    recent_intents: tuple[AcceptedIntent, ...] = Field(default=(), max_length=100)
```

Define the response-side models with these exact bounded fields (retain the existing strict candidate identifiers, provider attribution, evidence, and HTTPS navigation validator, while renaming `cuisine_tags` to `intent_tags`):

```python
class SearchRound(StrictFrozenModel):
    radius_m: Literal[2000, 3000, 5000]
    discovered_count: int = Field(ge=0, le=500)
    eligible_count: int = Field(ge=0, le=500)


class ExclusionCounts(StrictFrozenModel):
    closed: int = Field(default=0, ge=0, le=500)
    tag_mismatch: int = Field(default=0, ge=0, le=500)
    excessive_budget: int = Field(default=0, ge=0, le=500)


class RankedRestaurant(StrictFrozenModel):
    candidate: RestaurantCandidate
    score: float = Field(ge=0, le=100, allow_inf_nan=False)
    matched_tags: tuple[RestaurantIntentTag, ...] = Field(default=(), max_length=6)
    budget_state: BudgetState
    budget_overage_minor: int | None = Field(default=None, ge=1, le=1_000_000)
    reason_codes: tuple[RestaurantReasonCode, ...] = Field(default=(), max_length=4)


class RestaurantRecommendResponse(StrictFrozenModel):
    schema_version: Literal["restaurant-recommendation.v2"] = "restaurant-recommendation.v2"
    session_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    active_radius_m: Literal[2000, 3000, 5000]
    search_rounds: tuple[SearchRound, ...] = Field(min_length=1, max_length=3)
    exclusions: ExclusionCounts
    quality_pool_count: int = Field(ge=1, le=5)
    ranked: tuple[RankedRestaurant, ...] = Field(min_length=1, max_length=5)
```

Remove AI/model and fake-personalization fields.

- [ ] **Step 4: Add model validators**

Validators must enforce: explicit budget requires a value; timestamps are timezone-aware; `budget_overage_minor` is present iff state is `stretch`; unknown budget cannot claim `within_budget` or `budget_stretch`; response candidate IDs are unique; `quality_pool_count == len(ranked)`; and search radii are an ordered prefix of `(2000, 3000, 5000)` ending at `active_radius_m`. The client performs the 14-day cutoff before sending, while the server applies the max-100 bound and uses only events within the last 14 days for diversity.

- [ ] **Step 5: Run the domain tests and verify GREEN**

```bash
backend/.venv/bin/pytest -q backend/tests/test_restaurant_domain.py backend/tests/test_restaurant_api.py
```

Expected: all strict contract tests pass.

- [ ] **Step 6: Commit the V2 contract**

```bash
git add backend/src/onedish_api/restaurant_domain.py \
  backend/tests/test_restaurant_domain.py backend/tests/test_restaurant_api.py
git commit -m "feat(onedish): define restaurant recommendation v2 contract"
```

### Task 3: Budget policy, eligibility, fixed scoring, and controlled variety

**Files:**
- Create: `backend/src/onedish_api/restaurants/budget.py`
- Rewrite: `backend/src/onedish_api/restaurants/scoring.py`
- Test: `backend/tests/test_restaurant_budget.py`
- Rewrite: `backend/tests/test_restaurant_scoring.py`

- [ ] **Step 1: Write failing budget-policy tests**

```python
from onedish_api.restaurants.budget import budget_assessment, stretch_ceiling


def test_cny_stretch_is_percent_limited_then_absolute_capped() -> None:
    assert stretch_ceiling(5000, "CNY") == 6250
    assert stretch_ceiling(20_000, "CNY") == 23_000
    assert stretch_ceiling(50_000, "CNY") == 53_000


def test_budget_states_are_truthful() -> None:
    assert budget_assessment(None, "CNY", 5000).state == "unknown"
    assert budget_assessment(4800, "CNY", 5000).state == "within"
    stretch = budget_assessment(6000, "CNY", 5000)
    assert (stretch.state, stretch.overage_minor) == ("stretch", 1000)
    assert budget_assessment(7000, "CNY", 5000).state == "excessive"
```

- [ ] **Step 2: Write failing scoring property tests**

Cover hard tag enforcement, closed filtering, excessive-budget filtering, neutral missing rating, the eight-point pool, unknown-price fill only below three known candidates, seeded variation, and no repeats. Define explicit factories at the top of the test module so the cases remain readable:

```python
from random import Random

from onedish_api.restaurant_domain import (
    RankedRestaurant,
    RestaurantCandidate,
    RestaurantEvidence,
    RestaurantProfile,
    RestaurantRecommendRequest,
)
from onedish_api.restaurants.scoring import (
    build_quality_pool,
    score_candidate,
    weighted_permutation,
)


def candidate(candidate_id: str, *, rating: float | None = 4.0) -> RestaurantCandidate:
    return RestaurantCandidate(
        id=f"overture:{candidate_id}",
        name=candidate_id,
        category="日本料理",
        intent_tags=("japanese",),
        distance_m=1000,
        rating=rating,
        average_cost_minor=4000,
        currency="CNY",
        open_state="open",
        source_kind="overture_place",
        attribution="Overture Maps Foundation",
        persistence="licensed_open_data",
        evidence=RestaurantEvidence(
            rating=rating is not None,
            average_cost=True,
            category=True,
        ),
    )


def request() -> RestaurantRecommendRequest:
    return RestaurantRecommendRequest(
        latitude=24.48,
        longitude=118.09,
        profile=RestaurantProfile(selected_tags=("japanese",)),
    )


def scored(*scores: float) -> tuple[RankedRestaurant, ...]:
    return tuple(
        RankedRestaurant(
            candidate=candidate(str(index)),
            score=score,
            matched_tags=("japanese",),
            budget_state="not_requested",
        )
        for index, score in enumerate(scores)
    )


def test_missing_rating_uses_the_fixed_neutral_signal() -> None:
    missing = score_candidate(candidate("missing", rating=None), request(), radius_m=2000)
    rated = score_candidate(candidate("rated", rating=4.0), request(), radius_m=2000)
    assert missing.score == 50.0
    assert rated.score == 66.5


def test_random_order_is_seeded_and_never_leaves_quality_band() -> None:
    pool = build_quality_pool(scored(90, 86, 82, 81))
    assert [item.score for item in pool] == [90, 86, 82]
    first = weighted_permutation(pool, Random(7))
    second = weighted_permutation(pool, Random(7))
    assert [item.candidate.id for item in first] == [item.candidate.id for item in second]
    assert len({item.candidate.id for item in first}) == len(first)
```

- [ ] **Step 3: Run focused tests and verify RED**

```bash
backend/.venv/bin/pytest -q \
  backend/tests/test_restaurant_budget.py \
  backend/tests/test_restaurant_scoring.py
```

Expected: failures identify missing budget module and old dynamic scoring behavior.

- [ ] **Step 4: Implement the budget module**

Use integer minor units only:

```python
ABSOLUTE_STRETCH_CAP = {"CNY": 3000, "USD": 500}


def stretch_ceiling(budget_minor: int, currency: str) -> int:
    percent = budget_minor // 4
    return budget_minor + min(percent, ABSOLUTE_STRETCH_CAP[currency])


def budget_penalty(cost_minor: int | None, budget_minor: int | None, currency: str) -> float:
    if budget_minor is None:
        return 0.0
    if cost_minor is None:
        return 5.0
    if cost_minor <= budget_minor:
        return 0.0
    ceiling = stretch_ceiling(budget_minor, currency)
    return 10.0 * (cost_minor - budget_minor) / (ceiling - budget_minor)
```

Return a typed assessment so excessive values are excluded before penalty calculation. `budget_assessment` returns `unknown` when comparable cost is absent, `within` at or below budget, `stretch` up to and including the ceiling, and the internal-only `excessive` state above it. Convert `excessive` into an exclusion; it never enters the wire response.

- [ ] **Step 5: Implement fixed scoring and pool construction**

Implement pure functions with no provider calls. The exact score is:

```python
def score_candidate(candidate, request, *, radius_m: int, recent_tag_counts=None):
    rating_signal = candidate.rating / 5 if candidate.evidence.rating and candidate.rating is not None else 0.5
    distance_signal = max(0.0, min(1.0, 1 - candidate.distance_m / radius_m))
    if request.profile.selected_tags:
        diversity_signal = 0.5
    else:
        counts = recent_tag_counts or {}
        recent_count = sum(counts.get(tag, 0) for tag in candidate.intent_tags)
        diversity_signal = 1 / (1 + recent_count)
    assessment = budget_assessment(
        candidate.average_cost_minor if candidate.evidence.average_cost else None,
        request.profile.currency,
        request.profile.budget_minor if request.profile.budget_is_explicit else None,
    )
    score = (
        55 * rating_signal
        + 35 * distance_signal
        + 10 * diversity_signal
        - assessment.penalty
    )
    return make_ranked(candidate, request, assessment, max(0.0, min(100.0, score)))
```

`eligible_candidates` first removes closed candidates, then enforces `candidate.intent_tags ∩ selected_tags != ∅` when tags are explicit, then removes known `excessive` budget candidates. `build_quality_pool` sorts by `(-score, distance_m, id)`, takes at most five candidates satisfying `score >= top_score - 8`, and—under explicit budget—starts from known-price candidates and adds unknown-price candidates only when fewer than three known candidates qualify. `weighted_permutation` repeatedly selects one item with weight `1 + score - minimum_pool_score`, removes it, and continues until empty, so selection is without replacement.

- [ ] **Step 6: Run focused and property tests and verify GREEN**

```bash
backend/.venv/bin/pytest -q \
  backend/tests/test_restaurant_budget.py \
  backend/tests/test_restaurant_scoring.py
```

Expected: all budget, eligibility, score, quality-band, and seeded-random tests pass.

- [ ] **Step 7: Commit the decision core**

```bash
git add backend/src/onedish_api/restaurants/budget.py \
  backend/src/onedish_api/restaurants/scoring.py \
  backend/tests/test_restaurant_budget.py \
  backend/tests/test_restaurant_scoring.py
git commit -m "feat(onedish): add evidence-first restaurant decision core"
```

### Task 4: Progressive discovery service and structured errors

**Files:**
- Rewrite: `backend/src/onedish_api/restaurants/service.py`
- Modify: `backend/src/onedish_api/routes.py`
- Modify: `backend/src/onedish_api/app.py`
- Delete: `backend/src/onedish_api/rerankers/base.py`
- Delete: `backend/src/onedish_api/rerankers/openai.py`
- Rewrite: `backend/tests/test_restaurant_service.py`
- Modify: `backend/tests/test_restaurant_api.py`
- Delete: `backend/tests/test_restaurant_reranker.py`

- [ ] **Step 1: Write failing progressive-search tests**

```python
from random import Random

import pytest

from onedish_api.domain import Place
from onedish_api.providers.base import PlaceQuery
from onedish_api.restaurant_domain import (
    RestaurantIntentTag,
    RestaurantProfile,
    RestaurantRecommendRequest,
)
from onedish_api.restaurants.service import RestaurantRecommendationService


def place(name: str, category: str) -> Place:
    return Place(
        id=name,
        name=name,
        category=category,
        distance_m=1000,
        open_state="open",
        source_kind="fixture_place",
        attribution="Test fixture",
    )


def request(*, selected_tags: tuple[RestaurantIntentTag, ...]) -> RestaurantRecommendRequest:
    return RestaurantRecommendRequest(
        latitude=24.48,
        longitude=118.09,
        profile=RestaurantProfile(selected_tags=selected_tags),
    )


class RadiusProvider:
    def __init__(self, values: dict[int, tuple[Place, ...]]) -> None:
        self.values = values
        self.queries: list[PlaceQuery] = []

    async def nearby(self, query: PlaceQuery) -> tuple[Place, ...]:
        self.queries.append(query)
        return self.values.get(query.radius_m, ())


@pytest.mark.asyncio
async def test_searches_2_then_3_then_5_km_and_stops_on_first_eligible_set() -> None:
    provider = RadiusProvider({2000: (), 3000: (place("wrong", "咖啡厅"),), 5000: (place("match", "日本料理"),)})
    service = RestaurantRecommendationService(providers=(provider,), rng_factory=lambda: Random(3))
    response = await service.recommend(request(selected_tags=("japanese",)))
    assert [query.radius_m for query in provider.queries] == [2000, 3000, 5000]
    assert [round.radius_m for round in response.search_rounds] == [2000, 3000, 5000]
    assert response.active_radius_m == 5000
    assert response.ranked[0].candidate.name == "match"


@pytest.mark.asyncio
async def test_never_expands_after_an_eligible_2km_set() -> None:
    provider = RadiusProvider({2000: (place("match", "火锅店"),)})
    response = await RestaurantRecommendationService(
        providers=(provider,), rng_factory=lambda: Random(1)
    ).recommend(request(selected_tags=("hot_pot",)))
    assert [query.radius_m for query in provider.queries] == [2000]
    assert response.active_radius_m == 2000
```

- [ ] **Step 2: Write failing API error tests**

Require `409` with `code=no_match`, attempted radii, exclusion counts, and allowed recovery actions; require `503` with only `code=provider_unavailable` when every live provider fails. Assert neither error echoes coordinates, user tags, keys, or upstream bodies.

- [ ] **Step 3: Run service/API tests and verify RED**

```bash
backend/.venv/bin/pytest -q backend/tests/test_restaurant_service.py backend/tests/test_restaurant_api.py
```

Expected: old one-shot discovery and V1 errors fail the new assertions.

- [ ] **Step 4: Implement progressive discovery**

Give `RestaurantRecommendationService` an injected `rng_factory: Callable[[], Random]`. For each radius in `(2000, 3000, 5000)`:

1. If tags are explicit, build one `PlaceQuery` per `(provider, selected_tag)` using `query_filter(tag)`; if no tags are explicit, build one broad `050000` query per provider.
2. Run those calls concurrently with `return_exceptions=True`, isolate individual failures, union and deduplicate successful places by provider-qualified ID, then normalize them.
3. Run hard eligibility, append one aggregate `SearchRound`, and stop on the first eligible set.

This fan-out is what guarantees `japanese OR hot_pot`: candidates may match either explicit tag, while a coffee shop that matches neither can never enter scoring. Track `successful_call_count` across the whole request. Raise `ProviderUnavailable` only when it remains zero; raise `NoRestaurantMatch` after the 5 km eligible set is empty. Build the quality pool and weighted permutation only after a non-empty eligible set is found.

- [ ] **Step 5: Return sanitized structured errors**

Map exceptions in `routes.py`:

```python
except NoRestaurantMatch as exc:
    raise HTTPException(
        status_code=409,
        detail={
            "code": "no_match",
            "search_rounds": [item.model_dump() for item in exc.search_rounds],
            "exclusions": exc.exclusions.model_dump(),
            "recovery_actions": ["clear_tags", "ignore_budget"],
        },
    ) from None
except ProviderUnavailable:
    raise HTTPException(
        status_code=503,
        detail={"code": "provider_unavailable"},
    ) from None
```

- [ ] **Step 6: Remove restaurant AI reranking**

Remove `OpenAIRestaurantReranker` construction from `app.py`, remove reranker parameters and branches from the restaurant service, delete the two restaurant reranker modules and their test, and verify that OpenAI settings used by the separate dish demo remain untouched.

- [ ] **Step 7: Run the full backend suite**

```bash
backend/.venv/bin/pytest -q backend/tests
backend/.venv/bin/ruff check backend/src backend/tests
```

Expected: all backend tests pass, the live AMap test remains opt-in/skipped, and Ruff reports no violations.

- [ ] **Step 8: Commit service orchestration**

```bash
git add -A backend/src/onedish_api backend/tests
git commit -m "feat(onedish): add progressive restaurant discovery"
```

### Task 5: Frontend taxonomy, restaurant-only preferences, and safe intent storage

**Files:**
- Create: `web/src/restaurants/intent-tags.ts`
- Create: `web/src/restaurants/preferences.ts`
- Create: `web/src/restaurants/RestaurantPreferenceForm.tsx`
- Modify: `web/src/db/db.ts`
- Modify: `web/src/profile/ProfileSheet.tsx`
- Modify: `web/src/recommendation/types.ts`
- Delete: `web/src/restaurants/cuisines.ts`
- Test: `web/tests/restaurant-intent-tags.test.ts`
- Test: `web/tests/restaurant-preferences.test.ts`
- Test: `web/tests/restaurant-intent-store.test.ts`
- Rewrite: `web/tests/daily-context-form.test.tsx`

- [ ] **Step 1: Write failing taxonomy and form tests**

Require 25 tags, three groups, the exact eight shortcuts, OR-capable checkbox selection, “More” expansion, and no allergen/ingredient/taste/duration controls in the restaurant form:

```tsx
expect(screen.getByRole("checkbox", { name: "日本料理" })).toBeVisible();
expect(screen.getByRole("checkbox", { name: "火锅" })).toBeVisible();
expect(screen.queryByText("绝不包含")).not.toBeInTheDocument();
expect(screen.queryByLabelText("可用时间")).not.toBeInTheDocument();
```

- [ ] **Step 2: Write failing persistence-boundary tests**

```typescript
it("stores only user-owned intent fields", async () => {
  await saveRestaurantIntent({
    id: "intent-1",
    occurred_at: "2026-07-20T10:00:00.000Z",
    action: "accepted",
    selected_tags: ["japanese"],
    budget_band_minor: 5000,
  });
  const raw = JSON.stringify(await getRecentRestaurantIntents(14, new Date("2026-07-20T12:00:00Z")));
  for (const forbidden of ["restaurant", "poi", "address", "latitude", "longitude", "rating", "price", "photo", "navigation"]) {
    expect(raw.toLowerCase()).not.toContain(forbidden);
  }
});

it("rejects provider-derived fields at runtime", async () => {
  await expect(saveRestaurantIntent({
    id: "bad",
    occurred_at: "2026-07-20T10:00:00.000Z",
    action: "accepted",
    selected_tags: ["japanese"],
    restaurant_name: "provider value",
  } as never)).rejects.toThrow("Invalid restaurant intent");
});
```

- [ ] **Step 3: Run focused frontend tests and verify RED**

```bash
pnpm --dir web exec vitest run \
  tests/restaurant-intent-tags.test.ts \
  tests/restaurant-preferences.test.ts \
  tests/restaurant-intent-store.test.ts \
  tests/daily-context-form.test.tsx
```

Expected: failures identify missing restaurant-only taxonomy, form, and event table.

- [ ] **Step 4: Add frontend taxonomy and preferences**

Export the same 25 string literals as the backend, three group definitions, and:

```typescript
export const RESTAURANT_SHORTCUTS = [
  "minnan_fujian", "seafood", "snacks_fast_food", "hot_pot",
  "barbecue", "japanese", "western", "coffee",
] as const;

export interface RestaurantPreferences {
  readonly selected_tags: readonly RestaurantIntentTag[];
  readonly budget_minor: number;
  readonly budget_is_explicit: boolean;
}
```

The form submits only these fields. Keep the legacy dish-demo `UserProfile` type and controls isolated from the production restaurant journey rather than deleting demo behavior.

- [ ] **Step 5: Add strict Dexie storage**

Add database version 4 with `restaurantIntentEvents: "id, occurred_at, action"`. Do not reuse `HistoryEventRow`, because it permits dish/provider-adjacent fields. Use this exact narrow record and reject extra keys before writing:

```typescript
export interface RestaurantIntentEventRow {
  readonly id: string;
  readonly occurred_at: string;
  readonly action: "accepted";
  readonly selected_tags: readonly RestaurantIntentTag[];
  readonly budget_band_minor: number | null;
}

const INTENT_EVENT_KEYS = new Set([
  "id", "occurred_at", "action", "selected_tags", "budget_band_minor",
]);

export function assertRestaurantIntentEvent(value: unknown): asserts value is RestaurantIntentEventRow {
  if (!isPlainObject(value) || Object.keys(value).some((key) => !INTENT_EVENT_KEYS.has(key))) {
    throw new Error("Invalid restaurant intent");
  }
  if (typeof value.id !== "string" || !isIsoTimestamp(value.occurred_at) || value.action !== "accepted") {
    throw new Error("Invalid restaurant intent");
  }
  if (!isIntentTagArray(value.selected_tags) || value.selected_tags.length === 0 || value.selected_tags.length > 6) {
    throw new Error("Invalid restaurant intent");
  }
  if (value.budget_band_minor !== null && !isSafePositiveInteger(value.budget_band_minor)) {
    throw new Error("Invalid restaurant intent");
  }
}
```

Add `saveRestaurantIntent`, `getRecentRestaurantIntents`, `saveRestaurantPreferences`, and `getRestaurantPreferences`. `getRecentRestaurantIntents(14, now)` filters on parsed timestamps in `[now - 14 days, now]`, sorts newest first, and caps the result at 100.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
pnpm --dir web exec vitest run \
  tests/restaurant-intent-tags.test.ts \
  tests/restaurant-preferences.test.ts \
  tests/restaurant-intent-store.test.ts \
  tests/daily-context-form.test.tsx
```

Expected: all taxonomy, form, migration, and forbidden-field tests pass.

- [ ] **Step 7: Commit frontend intent ownership**

```bash
git add web/src/restaurants/intent-tags.ts \
  web/src/restaurants/preferences.ts \
  web/src/restaurants/RestaurantPreferenceForm.tsx \
  web/src/db/db.ts web/src/profile/ProfileSheet.tsx \
  web/src/recommendation/types.ts web/src/restaurants/cuisines.ts \
  web/tests/restaurant-intent-tags.test.ts \
  web/tests/restaurant-preferences.test.ts \
  web/tests/restaurant-intent-store.test.ts \
  web/tests/daily-context-form.test.tsx
git commit -m "feat(onedish): add safe restaurant intent preferences"
```

### Task 6: Frontend V2 API, parser, and session flow

**Files:**
- Rewrite: `web/src/restaurants/types.ts`
- Rewrite: `web/src/restaurants/parser.ts`
- Rewrite: `web/src/restaurants/start.ts`
- Modify: `web/src/restaurants/session-store.ts`
- Modify: `web/src/api/client.ts`
- Rewrite: `web/tests/support/restaurant-fixtures.ts`
- Rewrite: `web/tests/restaurant-parser.test.ts`
- Rewrite: `web/tests/restaurant-start.test.ts`
- Modify: `web/tests/restaurant-session-store.test.ts`

- [ ] **Step 1: Write failing V2 parser tests**

Require `restaurant-recommendation.v2`, ordered radii, per-candidate budget state, matched tags, exclusion counts, and absence of V1 AI/fake-personalization fields. Add table tests rejecting duplicate candidate IDs, invalid radii order, stretch without overage, unknown budget with a budget-match reason, and provider URLs that are not HTTPS.

- [ ] **Step 2: Write failing minimized-request tests**

```typescript
expect(recommend).toHaveBeenCalledWith({
  schema_version: "restaurant-request.v2",
  latitude: 24.48,
  longitude: 118.09,
  locale: "zh-CN",
  profile: {
    selected_tags: ["japanese", "hot_pot"],
    budget_minor: 5000,
    budget_is_explicit: true,
    currency: "CNY",
  },
  recent_intents: [{
    occurred_at: "2026-07-19T10:00:00.000Z",
    selected_tags: ["japanese"],
    budget_band_minor: 5000,
  }],
});
```

Assert the serialized request contains none of `restaurant_name`, `poi`, coordinates from history, dish history, allergens, ingredients, taste tags, duration, or health data.

- [ ] **Step 3: Run parser/start tests and verify RED**

```bash
pnpm --dir web exec vitest run \
  tests/restaurant-parser.test.ts \
  tests/restaurant-start.test.ts \
  tests/restaurant-session-store.test.ts
```

Expected: V1 fixtures and contracts fail.

- [ ] **Step 4: Implement strict V2 types and parser**

Mirror every backend literal. Keep parser helpers bounded and reject unknown keys where practical at the response root, trace, ranked item, and budget-state levels. Replace `selection_source`, `model_status`, `recommendation_mode`, and fixed radius with V2 search rounds and `active_radius_m`.

- [ ] **Step 5: Add structured request errors**

Define:

```typescript
export class RestaurantRequestError extends Error {
  constructor(
    readonly status: 409 | 503,
    readonly code: "no_match" | "provider_unavailable",
    readonly recoveryActions: readonly ("clear_tags" | "ignore_budget")[] = [],
  ) {
    super(code);
  }
}
```

In `recommendRestaurant`, parse only the bounded error detail for status 409/503; never expose the raw upstream response or coordinates in the message.

- [ ] **Step 6: Send sanitized intent events and keep order in memory**

Change `startRestaurantRecommendation` to accept `RestaurantPreferences` and `RestaurantIntentEventRow[]`, strip event IDs/actions before sending, and create the active session from the server's randomized `ranked` order. `pickAnotherRestaurant` continues to increment an in-memory index and can never wrap.

- [ ] **Step 7: Run focused tests and verify GREEN**

```bash
pnpm --dir web exec vitest run \
  tests/restaurant-parser.test.ts \
  tests/restaurant-start.test.ts \
  tests/restaurant-session-store.test.ts
```

Expected: all V2 parser, minimized payload, structured error, and no-repeat tests pass.

- [ ] **Step 8: Commit the V2 client boundary**

```bash
git add web/src/restaurants/types.ts web/src/restaurants/parser.ts \
  web/src/restaurants/start.ts web/src/restaurants/session-store.ts \
  web/src/api/client.ts web/tests/support/restaurant-fixtures.ts \
  web/tests/restaurant-parser.test.ts web/tests/restaurant-start.test.ts \
  web/tests/restaurant-session-store.test.ts
git commit -m "feat(onedish): adopt restaurant recommendation v2 client"
```

### Task 7: Honest decision UI, result evidence, and recovery

**Files:**
- Modify: `web/src/home/HomePage.tsx`
- Modify: `web/src/profile/ProfileSheet.tsx`
- Rewrite: `web/src/restaurants/RestaurantEliminationPage.tsx`
- Rewrite: `web/src/restaurants/RestaurantWinnerPage.tsx`
- Modify: `web/src/i18n/messages.ts`
- Modify: `web/src/styles/global.css`
- Test: `web/tests/home.test.tsx`
- Rewrite: `web/tests/restaurant-elimination.test.tsx`
- Rewrite: `web/tests/restaurant-winner.test.tsx`
- Modify: `web/tests/i18n-ui.test.tsx`
- Modify: `web/e2e/restaurant-first.spec.ts`
- Modify: `web/e2e/restaurant-production.spec.ts`

- [ ] **Step 1: Write failing elimination and winner tests**

Require visible text for actual radius, matched tag, within/stretch/unknown budget states, exact stretch overage, and only trace stages returned by V2. Assert the old “habits,” “taste match,” “personalized,” and AI copy is absent.

```tsx
expect(screen.getByText("搜索范围已扩大到 3 公里")).toBeVisible();
expect(screen.getByText("符合：日本料理")).toBeVisible();
expect(screen.getByText("比预算高 ¥8")).toBeVisible();
expect(screen.queryByText("已结合你的近期选择")).not.toBeInTheDocument();
```

- [ ] **Step 2: Write failing safe-acceptance and recovery tests**

Clicking “去这里” with explicit tags must call `saveRestaurantIntent` with only the safe fields before opening navigation. With no explicit tags it must not write an inferred tag. A `no_match` error must show “清除分类” and “忽略预算”; each action reruns from the already consented point without asking for location again. A provider error exposes only a retry action.

- [ ] **Step 3: Run UI tests and verify RED**

```bash
pnpm --dir web exec vitest run \
  tests/home.test.tsx \
  tests/restaurant-elimination.test.tsx \
  tests/restaurant-winner.test.tsx \
  tests/i18n-ui.test.tsx
```

Expected: old fixed trace and winner copy fail the assertions.

- [ ] **Step 4: Implement current-point recovery and restaurant-only settings**

Keep the last consented point in component state only while the journey is active. Load/save `RestaurantPreferences`, pass the 14-day safe intent events to `startRestaurantRecommendation`, and handle `RestaurantRequestError` by code. Recovery mutates only the scoped current request: `clear_tags` sets selected tags to `[]`; `ignore_budget` sets `budget_is_explicit` to `false`.

- [ ] **Step 5: Render actual V2 trace and evidence**

Map response search rounds and eligibility/pool stages directly. Do not invent stages to preserve a fixed animation length. In the winner, use `budget_state` to select exactly one message, show `active_radius_m`, matched user tags, distance, rating when evidenced, provider attribution, and the active-only note. “Another” advances the in-memory order.

- [ ] **Step 6: Persist only explicit intent on acceptance**

Before opening the safe HTTPS navigation URL, save an event only when `session.request.profile.selected_tags.length > 0`. The stored event uses `crypto.randomUUID()`, current ISO time, `action:"accepted"`, the explicit tags, and a bucket derived solely from the user-entered budget. Define the bucket as `Math.floor(budget_minor / 2500) * 2500` for CNY and `Math.floor(budget_minor / 500) * 500` for USD, with a minimum of one bucket; use `null` when budget was not explicit. Never copy candidate fields into the event.

- [ ] **Step 7: Add bilingual copy and responsive styles**

Add all 25 taxonomy labels, group titles, “More/Less,” search-radius messages, four budget states, stretch overage, no-match recoveries, and provider failure copy in English and Chinese. Remove restaurant-flow claims about taste, health, duration, AI, or habits. Keep grouped controls usable at 320 px with a 44 px minimum touch target.

- [ ] **Step 8: Run UI tests and build**

```bash
pnpm --dir web test -- --run
pnpm --dir web run lint
pnpm --dir web run build
```

Expected: all Vitest files pass, ESLint has zero warnings, and the production PWA build succeeds.

- [ ] **Step 9: Run browser journeys**

```bash
pnpm --dir web run e2e -- --workers=2
```

Expected: desktop and mobile projects pass; explicit tags remain hard, no-match recovery reuses location, budget states are visible, and “Another” does not repeat.

- [ ] **Step 10: Commit the V2 experience**

```bash
git add web/src/home/HomePage.tsx web/src/profile/ProfileSheet.tsx \
  web/src/restaurants/RestaurantEliminationPage.tsx \
  web/src/restaurants/RestaurantWinnerPage.tsx \
  web/src/i18n/messages.ts web/src/styles/global.css \
  web/tests/home.test.tsx web/tests/restaurant-elimination.test.tsx \
  web/tests/restaurant-winner.test.tsx web/tests/i18n-ui.test.tsx \
  web/e2e/restaurant-first.spec.ts web/e2e/restaurant-production.spec.ts
git commit -m "feat(onedish): ship honest restaurant decision experience"
```

### Task 8: Privacy documentation, regression audit, and deployment readiness

**Files:**
- Modify: `docs/privacy.md`
- Modify: `docs/data-provenance.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `web/tests/privacy.test.tsx`
- Modify: `web/tests/product-copy.test.ts`
- Modify: `web/tests/production-deployment.test.ts`
- Modify: `backend/tests/test_live_amap.py`

- [ ] **Step 1: Write failing policy/copy tests**

Assert that public copy describes AMap results as active-request data, that persistent restaurant intent contains no provider fields, that AI restaurant reranking is not claimed, and that unsupported dish/menu preferences are absent from the production restaurant journey.

- [ ] **Step 2: Extend the opt-in live AMap contract test**

Use a synthetic Xiamen point and an explicit `japanese` tag. Assert attempted radii are a prefix of `(2000, 3000, 5000)`, every returned candidate matches `japanese`, all budget reason codes agree with budget state, and no response is written to disk by the test.

- [ ] **Step 3: Update documentation**

Document the exact persistent event schema, the no-POI persistence rule, controlled variety, budget stretch formula, live provider failure behavior, and the absence of menu/AI claims. Link the V2 design spec from both READMEs without presenting AMap data as OneDish-owned data.

- [ ] **Step 4: Run the complete verification matrix**

```bash
backend/.venv/bin/pytest -q backend/tests
backend/.venv/bin/ruff check backend/src backend/tests
pnpm --dir web test -- --run
pnpm --dir web run lint
pnpm --dir web run build
pnpm --dir web run e2e -- --workers=2
git diff --check
```

Expected: backend and frontend suites have zero failures, the live test is skipped unless explicitly enabled, lint/build/E2E pass, and Git reports no whitespace errors.

- [ ] **Step 5: Run the live provider smoke test without persisting output**

On the VPS or another environment containing the existing secret:

```bash
ONEDISH_LIVE_AMAP_TEST=1 backend/.venv/bin/pytest -q \
  backend/tests/test_live_amap.py::test_live_amap_contract_without_persisting_response
```

Expected: PASS within the test timeout; logs contain neither the API key nor coordinates beyond the fixed synthetic test point.

- [ ] **Step 6: Commit documentation and release checks**

```bash
git add docs/privacy.md docs/data-provenance.md README.md README.zh-CN.md \
  web/tests/privacy.test.tsx web/tests/product-copy.test.ts \
  web/tests/production-deployment.test.ts backend/tests/test_live_amap.py
git commit -m "docs(onedish): document restaurant decision v2 boundaries"
```

- [ ] **Step 7: Request code review before integration**

Invoke `superpowers:requesting-code-review`, address all correctness/privacy findings, rerun the complete verification matrix, then invoke `superpowers:finishing-a-development-branch`. Do not merge or deploy until those gates pass.

---

## Final acceptance checklist

- [ ] All 25 tags have backend query mappings and bilingual frontend labels.
- [ ] Explicit tags are hard OR constraints and cannot be crossed by randomness.
- [ ] Discovery attempts only 2 km, 3 km, then 5 km and stops on the first eligible set.
- [ ] Budget stretch follows `+min(25%, ¥30/$5)` and excessive known costs are excluded.
- [ ] Unknown price is explicitly unverified; it never receives a budget-match reason.
- [ ] Fixed rating/distance/diversity scoring has no dynamic denominator.
- [ ] The winner comes only from the five-item/eight-point quality pool.
- [ ] Seeded tests prove reproducibility, variation, and no repeats.
- [ ] Persistent events contain no provider-derived restaurant fields.
- [ ] Current explicit choices override diversity behavior.
- [ ] UI trace counts are API facts, not animation placeholders.
- [ ] Restaurant AI reranking and unsupported menu-level controls are absent.
- [ ] Full unit, lint, build, E2E, privacy, and live-smoke gates pass before deployment.
