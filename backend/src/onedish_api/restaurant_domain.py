"""Strict contracts for active restaurant recommendation sessions."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from onedish_api.domain import StrictFrozenModel


RestaurantIntentTag = Literal[
    "minnan_fujian",
    "sichuan_hunan",
    "cantonese_dim_sum",
    "jiangzhe",
    "northeastern",
    "yunnan_guizhou",
    "northwestern_xinjiang",
    "home_style",
    "vegetarian",
    "japanese",
    "korean",
    "western",
    "southeast_asian",
    "indian",
    "middle_eastern",
    "hot_pot",
    "barbecue",
    "seafood",
    "noodles",
    "dry_pot_grilled_fish",
    "snacks_fast_food",
    "buffet",
    "coffee",
    "bakery_dessert",
    "drinks",
]
RestaurantSource = Literal["amap_place", "overture_place"]
RestaurantPersistence = Literal["active_only", "licensed_open_data"]
BudgetState = Literal["not_requested", "within", "stretch", "unknown"]
RestaurantReasonCode = Literal[
    "tag_match",
    "within_budget",
    "budget_stretch",
    "budget_unknown",
    "above_median_rating",
    "nearby",
    "intent_diversity",
]


class RestaurantEvidence(StrictFrozenModel):
    distance: bool = True
    rating: bool = False
    average_cost: bool = False
    category: bool = False
    open_state: bool = False


class RestaurantCandidate(StrictFrozenModel):
    id: str = Field(pattern=r"^(amap|overture):[^\s]{1,120}$")
    name: str = Field(min_length=1, max_length=160)
    category: str | None = Field(default=None, max_length=100)
    intent_tags: tuple[RestaurantIntentTag, ...] = Field(default=(), max_length=6)
    distance_m: int = Field(ge=0, le=50_000)
    rating: float | None = Field(default=None, ge=0, le=5, allow_inf_nan=False)
    average_cost_minor: int | None = Field(default=None, ge=0, le=1_000_000)
    currency: Literal["CNY", "USD"] | None = None
    open_state: Literal["open", "closed", "unknown"] = "unknown"
    navigation_url: str | None = Field(default=None, pattern=r"^https://")
    source_kind: RestaurantSource
    attribution: str = Field(min_length=1, max_length=160)
    persistence: RestaurantPersistence = "active_only"
    evidence: RestaurantEvidence

    @model_validator(mode="after")
    def source_matches_persistence(self) -> Self:
        expected = "active_only" if self.source_kind == "amap_place" else "licensed_open_data"
        if self.persistence != expected:
            raise ValueError("source and persistence policy do not match")
        if len(set(self.intent_tags)) != len(self.intent_tags):
            raise ValueError("candidate intent tags must be unique")
        return self


class AcceptedIntent(StrictFrozenModel):
    occurred_at: datetime
    selected_tags: tuple[RestaurantIntentTag, ...] = Field(min_length=1, max_length=6)
    budget_band_minor: int | None = Field(default=None, ge=100, le=1_000_000)

    @field_validator("occurred_at")
    @classmethod
    def timestamp_is_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("intent timestamp must be timezone-aware")
        return value

    @model_validator(mode="after")
    def tags_are_unique(self) -> Self:
        if len(set(self.selected_tags)) != len(self.selected_tags):
            raise ValueError("intent tags must be unique")
        return self


class RestaurantProfile(StrictFrozenModel):
    selected_tags: tuple[RestaurantIntentTag, ...] = Field(default=(), max_length=6)
    budget_minor: int | None = Field(default=None, ge=100, le=1_000_000)
    budget_is_explicit: bool = False
    currency: Literal["CNY", "USD"] = "CNY"

    @model_validator(mode="after")
    def profile_is_consistent(self) -> Self:
        if self.budget_is_explicit and self.budget_minor is None:
            raise ValueError("an explicit budget requires a budget value")
        if len(set(self.selected_tags)) != len(self.selected_tags):
            raise ValueError("selected tags must be unique")
        return self


class RestaurantRecommendRequest(StrictFrozenModel):
    schema_version: Literal["restaurant-request.v2"] = "restaurant-request.v2"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    locale: Literal["en", "zh-CN"] = "zh-CN"
    profile: RestaurantProfile = Field(default_factory=RestaurantProfile)
    recent_intents: tuple[AcceptedIntent, ...] = Field(default=(), max_length=100)


class SearchRound(StrictFrozenModel):
    radius_m: Literal[2000, 3000, 5000]
    discovered_count: int = Field(ge=0, le=500)
    eligible_count: int = Field(ge=0, le=500)

    @model_validator(mode="after")
    def eligible_does_not_exceed_discovered(self) -> Self:
        if self.eligible_count > self.discovered_count:
            raise ValueError("eligible count cannot exceed discovered count")
        return self


class ExclusionCounts(StrictFrozenModel):
    closed: int = Field(default=0, ge=0, le=500)
    outside_radius: int = Field(default=0, ge=0, le=500)
    tag_mismatch: int = Field(default=0, ge=0, le=500)
    excessive_budget: int = Field(default=0, ge=0, le=500)


class RankedRestaurant(StrictFrozenModel):
    candidate: RestaurantCandidate
    score: float = Field(ge=0, le=100, allow_inf_nan=False)
    matched_tags: tuple[RestaurantIntentTag, ...] = Field(default=(), max_length=6)
    budget_state: BudgetState
    budget_overage_minor: int | None = Field(default=None, ge=1, le=1_000_000)
    reason_codes: tuple[RestaurantReasonCode, ...] = Field(default=(), max_length=4)

    @model_validator(mode="after")
    def evidence_is_consistent(self) -> Self:
        if (self.budget_state == "stretch") != (self.budget_overage_minor is not None):
            raise ValueError("stretch overage must be present if and only if budget is stretched")
        budget_reasons = set(self.reason_codes) & {
            "within_budget",
            "budget_stretch",
            "budget_unknown",
        }
        allowed = {
            "not_requested": set(),
            "within": {"within_budget"},
            "stretch": {"budget_stretch"},
            "unknown": {"budget_unknown"},
        }[self.budget_state]
        if not budget_reasons <= allowed:
            raise ValueError("budget reason does not match budget state")
        if not set(self.matched_tags) <= set(self.candidate.intent_tags):
            raise ValueError("matched tags require candidate category evidence")
        if len(set(self.matched_tags)) != len(self.matched_tags):
            raise ValueError("matched tags must be unique")
        return self


class RestaurantRecommendResponse(StrictFrozenModel):
    schema_version: Literal["restaurant-recommendation.v2"] = "restaurant-recommendation.v2"
    session_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    active_radius_m: Literal[2000, 3000, 5000]
    search_rounds: tuple[SearchRound, ...] = Field(min_length=1, max_length=3)
    exclusions: ExclusionCounts
    quality_pool_count: int = Field(ge=1, le=5)
    ranked: tuple[RankedRestaurant, ...] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def response_is_consistent(self) -> Self:
        radii = tuple(item.radius_m for item in self.search_rounds)
        if radii != (2000, 3000, 5000)[: len(radii)]:
            raise ValueError("search rounds must be an ordered radius prefix")
        if radii[-1] != self.active_radius_m:
            raise ValueError("active radius must equal the final search round")
        if self.quality_pool_count != len(self.ranked):
            raise ValueError("quality pool count must equal ranked candidate count")
        identifiers = tuple(item.candidate.id for item in self.ranked)
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("ranked candidates must be unique")
        return self
