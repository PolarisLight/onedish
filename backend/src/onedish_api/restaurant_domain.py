"""Strict contracts for active restaurant recommendation sessions."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from onedish_api.domain import StrictFrozenModel


RestaurantSource = Literal["amap_place", "overture_place"]
RestaurantPersistence = Literal["active_only", "licensed_open_data"]
RestaurantReasonCode = Literal[
    "higher_rating",
    "budget_match",
    "taste_match",
    "history_diversity",
    "closer_than_typical",
    "high_confidence",
]
RecommendationMode = Literal["exploration", "personalized"]
RecentCuisineCount = Annotated[int, Field(ge=0, le=1000)]
CuisinePreference = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
NormalizedRestaurantCuisine = Literal[
    "fujian", "sichuan", "cantonese", "japanese", "western"
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

    @model_validator(mode="after")
    def source_matches_persistence(self) -> "RestaurantCandidate":
        expected = "active_only" if self.source_kind == "amap_place" else "licensed_open_data"
        if self.persistence != expected:
            raise ValueError("source and persistence policy do not match")
        return self


class RestaurantProfile(StrictFrozenModel):
    budget_minor: int | None = Field(default=None, ge=100, le=1_000_000)
    budget_is_explicit: bool = False
    currency: Literal["CNY", "USD"] = "CNY"
    preferred_cuisines: tuple[NormalizedRestaurantCuisine, ...] = Field(default=(), max_length=8)
    max_distance_m: Literal[3000] = 3000

    @model_validator(mode="after")
    def explicit_budget_has_value(self) -> "RestaurantProfile":
        if self.budget_is_explicit and self.budget_minor is None:
            raise ValueError("an explicit budget requires a budget value")
        return self


class RestaurantHistorySummary(StrictFrozenModel):
    recent_cuisines: dict[NormalizedRestaurantCuisine, RecentCuisineCount] = Field(
        default_factory=dict
    )
    cuisine_preferences: dict[NormalizedRestaurantCuisine, CuisinePreference] = Field(
        default_factory=dict
    )


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

    @model_validator(mode="after")
    def count_does_not_grow(self) -> "RestaurantTraceStage":
        if self.survivor_count > self.input_count:
            raise ValueError("stage survivor count cannot exceed input count")
        return self


class RankedRestaurant(StrictFrozenModel):
    candidate: RestaurantCandidate
    score: float = Field(ge=0, le=100)
    reason_codes: tuple[RestaurantReasonCode, ...] = Field(default=(), max_length=3)


class RestaurantRecommendResponse(StrictFrozenModel):
    schema_version: Literal["restaurant-recommendation.v1"]
    session_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    ranked: tuple[RankedRestaurant, ...] = Field(min_length=1, max_length=25)
    trace: tuple[RestaurantTraceStage, ...] = Field(min_length=1)
    selection_source: Literal["ai_rerank", "deterministic"]
    model_status: Literal["selected", "disabled", "timeout", "invalid", "error"]
    recommendation_mode: RecommendationMode
    radius_m: Literal[3000]

    @model_validator(mode="after")
    def trace_is_monotonic(self) -> "RestaurantRecommendResponse":
        counts = [stage.survivor_count for stage in self.trace]
        if any(after > before for before, after in zip(counts, counts[1:])):
            raise ValueError("trace counts must be non-increasing")
        return self
