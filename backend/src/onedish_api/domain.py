"""Strict, immutable wire and catalog contracts for OneDish."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


Identifier = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")]
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
Sha256 = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


class StrictFrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Confidence(StrEnum):
    authoritative = "authoritative"
    high = "high"
    medium = "medium"
    low = "low"


Allergen = Literal[
    "celery",
    "crustaceans",
    "eggs",
    "fish",
    "gluten",
    "lupin",
    "milk",
    "molluscs",
    "mustard",
    "peanuts",
    "sesame",
    "soy",
    "sulphites",
    "tree-nuts",
]
CuisineTag = Literal[
    "american",
    "asian",
    "indian",
    "latin",
    "mediterranean",
    "middle-eastern",
    "mixed",
]
TasteTag = Literal[
    "cold",
    "comforting",
    "crisp",
    "filling",
    "fresh",
    "light",
    "mild",
    "rich",
    "spicy",
    "warm",
]


class NutritionRange(StrictFrozenModel):
    min: int = Field(ge=0, le=10_000)
    max: int = Field(ge=0, le=10_000)

    @model_validator(mode="after")
    def ordered(self) -> "NutritionRange":
        if self.min > self.max:
            raise ValueError("range minimum must not exceed maximum")
        return self


class Restaurant(StrictFrozenModel):
    id: Identifier
    name: str = Field(min_length=1, max_length=100)
    cuisine_tags: tuple[CuisineTag, ...] = Field(min_length=1)
    source_kind: Literal["demo_restaurant"]


class Place(StrictFrozenModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=100)
    distance_m: int = Field(ge=0, le=100_000)
    price_tier: int | None = Field(default=None, ge=1, le=4)
    rating: float | None = Field(default=None, ge=0, le=10)
    open_state: Literal["open", "closed", "unknown"]
    order_destination: str | None = None
    source_kind: Literal[
        "amap_place", "foursquare_place", "fixture_place", "overture_place"
    ]
    attribution: str = Field(min_length=1, max_length=100)
    address: str | None = Field(default=None, max_length=300)
    average_cost_minor: int | None = Field(default=None, ge=0, le=10_000_000)
    currency: Currency | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    photo_url: str | None = None


class LocalizedDishText(StrictFrozenModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=500)


class Dish(StrictFrozenModel):
    id: Identifier
    restaurant_id: Identifier
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=500)
    price_minor: int = Field(gt=0, le=100_000)
    currency: Currency
    energy_kcal: NutritionRange
    protein_g: NutritionRange
    confidence: Confidence
    allergens: tuple[Allergen, ...] = ()
    possible_allergens: tuple[Allergen, ...] = ()
    ingredients: tuple[str, ...] = Field(min_length=1, max_length=30)
    cuisine_tags: tuple[CuisineTag, ...] = Field(min_length=1, max_length=4)
    taste_tags: tuple[TasteTag, ...] = Field(min_length=1, max_length=6)
    base_ingredient: str = Field(min_length=1, max_length=60)
    image: str = Field(pattern=r"^/food/[A-Za-z0-9._-]+$")
    nutrition_provenance: Literal["authoritative_demo", "estimated_demo"]
    source_kind: Literal["demo_menu"]
    estimated_minutes: int = Field(ge=5, le=180)
    translations: dict[Literal["zh-CN"], LocalizedDishText] = Field(default_factory=dict)


class Candidate(StrictFrozenModel):
    dish: Dish
    place: Place


class Catalog(StrictFrozenModel):
    version: Literal["catalog.v1"]
    restaurants: tuple[Restaurant, ...] = Field(min_length=8, max_length=12)
    dishes: tuple[Dish, ...] = Field(min_length=80, max_length=120)
    image_attribution: dict[str, str]


class DailyContextEntry(StrictFrozenModel):
    source: Literal["manual", "synthetic"]
    energy_consumed_kcal: int | None = Field(default=None, ge=0, le=20_000)
    protein_consumed_g: int | None = Field(default=None, ge=0, le=1_000)
    daily_energy_goal_kcal: int | None = Field(default=None, ge=800, le=10_000)
    daily_protein_goal_g: int | None = Field(default=None, ge=0, le=1_000)
    meal_energy_range_kcal: NutritionRange | None = None
    sleep_minutes: int | None = Field(default=None, ge=0, le=1_440)
    comfort_from_sleep_enabled: bool = False


class MealContext(StrictFrozenModel):
    protein_gap_g: int | None = Field(default=None, ge=0, le=1_000)
    energy_range_kcal: NutritionRange | None = None
    recent_categories_to_avoid: tuple[str, ...] = ()
    comfort_preference: Literal["warm"] | None = None
    source_freshness: Literal["today", "unavailable"]
    wellness_context_used: bool
    context_source: Literal["manual", "synthetic", "none"]


class MealConstraints(StrictFrozenModel):
    max_price_minor: int | None = Field(default=None, gt=0, le=100_000)
    currency: Currency = "USD"
    energy_range_kcal: NutritionRange | None = None
    minimum_protein_g: int | None = Field(default=None, ge=0, le=1_000)
    excluded_allergens: tuple[Allergen, ...] = ()
    excluded_ingredients: tuple[str, ...] = ()
    desired_taste_tags: tuple[TasteTag, ...] = ()
    max_duration_minutes: int | None = Field(default=None, ge=5, le=180)
    allowed_relaxations: tuple[
        Literal[
            "energy_range",
            "protein_floor",
            "recent_repetition",
            "taste",
            "duration",
            "budget",
        ], ...
    ] = ()


class MealHistoryEvent(StrictFrozenModel):
    id: Identifier
    occurred_at: datetime
    kind: Literal["accepted", "rejected", "dismissed", "eaten", "corrected", "reset"]
    dish_id: Identifier | None = None
    cuisine_tags: tuple[CuisineTag, ...] = ()
    taste_tags: tuple[TasteTag, ...] = ()
    base_ingredient: str | None = None
    energy_kcal: NutritionRange | None = None
    protein_g: NutritionRange | None = None
    price_minor: int | None = Field(default=None, gt=0)
    rejection_reason: Literal[
        "too_heavy", "not_craving", "too_expensive", "had_recently"
    ] | None = None


class EliminationReason(StrictFrozenModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    count: int = Field(ge=0)


StageId = Literal[
    "found",
    "available",
    "safety_budget",
    "safety",
    "nutrition",
    "repetition",
    "taste_confidence",
    "taste",
    "duration",
    "budget",
    "winner",
]


class EliminationStage(StrictFrozenModel):
    id: StageId
    input_count: int = Field(ge=0)
    survivor_count: int = Field(ge=0)
    reason_counts: dict[str, int]
    representative_removed_ids: tuple[Identifier, ...] = Field(max_length=3)

    @model_validator(mode="after")
    def count_does_not_grow(self) -> "EliminationStage":
        if self.survivor_count > self.input_count:
            raise ValueError("stage survivor count cannot exceed input count")
        if any(count < 0 for count in self.reason_counts.values()):
            raise ValueError("reason counts cannot be negative")
        return self


class DecisionRecord(StrictFrozenModel):
    decision_id: Identifier
    engine_version: Literal["engine.v1", "engine.v2"]
    catalog_version: str = Field(pattern=r"^catalog\.v[0-9]+$")
    input_sha256: Sha256
    created_at: datetime
    stages: tuple[EliminationStage, ...] = Field(min_length=1)
    winner_id: Identifier
    reserve_id: Identifier | None
    relaxations: tuple[str, ...] = ()


class DecisionScoreRules(StrictFrozenModel):
    taste_match: int = Field(ge=0)
    comfort_match: int = Field(ge=0)
    confidence: dict[Confidence, int]
    distance_divisor: int = Field(gt=0)
    price_divisor: int = Field(gt=0)
    recent_dish: int = Field(ge=0)
    recent_base_ingredient: int = Field(ge=0)
    preference_scale: int = Field(ge=0)


class DecisionLocaleRules(StrictFrozenModel):
    currency: Currency
    budget_minor: int = Field(gt=0)
    duration_minutes: int = Field(ge=5, le=180)
    distance_unit: Literal["mile", "kilometer"]
    usd_multiplier: float = Field(gt=0)


class DecisionRules(StrictFrozenModel):
    version: Literal["decision.v2"]
    stage_order: tuple[str, ...]
    score: DecisionScoreRules
    relaxation_order: tuple[Literal["recent_repetition", "taste", "duration", "budget"], ...]
    meal_period_tastes: dict[str, tuple[TasteTag, ...]]
    locales: dict[Literal["en", "zh-CN"], DecisionLocaleRules]
    quick_states: dict[str, dict[str, object]]
    reasons: dict[str, dict[Literal["en", "zh-CN"], str]]
