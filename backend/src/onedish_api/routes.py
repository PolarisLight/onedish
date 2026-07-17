"""Minimal API surface for catalogs, places, interpretation, and decisions."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import Field

from onedish_api.domain import (
    Candidate,
    Catalog,
    DecisionRules,
    MealConstraints,
    MealContext,
    Place,
    StrictFrozenModel,
)
from onedish_api.engine import NoSafeCandidate, recommend
from onedish_api.history import PreferenceWeights, RepetitionProfile
from onedish_api.providers.base import PlaceQuery, PlacesProvider
from onedish_api.providers.gpt56 import deterministic_craving_fallback


class RepetitionPayload(StrictFrozenModel):
    dish_ids: dict[str, int] = Field(default_factory=dict)
    cuisines: dict[str, int] = Field(default_factory=dict)
    base_ingredients: dict[str, int] = Field(default_factory=dict)


class PreferencePayload(StrictFrozenModel):
    cuisine: dict[str, float] = Field(default_factory=dict)
    taste: dict[str, float] = Field(default_factory=dict)


class RecommendRequest(StrictFrozenModel):
    context: MealContext
    constraints: MealConstraints = Field(default_factory=MealConstraints)
    repetition: RepetitionPayload = Field(default_factory=RepetitionPayload)
    preferences: PreferencePayload = Field(default_factory=PreferencePayload)


class CravingRequest(StrictFrozenModel):
    text: str = Field(min_length=1, max_length=2_000)


def _candidates(catalog: Catalog, places: tuple[Place, ...]) -> tuple[Candidate, ...]:
    by_restaurant = {
        place.id.removeprefix("fixture-"): place
        for place in places
        if place.id.startswith("fixture-")
    }
    if not by_restaurant:
        by_name = {place.name.casefold(): place for place in places}
        restaurants = {restaurant.id: restaurant for restaurant in catalog.restaurants}
        by_restaurant = {
            restaurant_id: by_name[restaurant.name.casefold()]
            for restaurant_id, restaurant in restaurants.items()
            if restaurant.name.casefold() in by_name
        }
    return tuple(
        Candidate(dish=dish, place=by_restaurant[dish.restaurant_id])
        for dish in catalog.dishes
        if dish.restaurant_id in by_restaurant
    )


def build_router(
    *,
    catalog: Catalog,
    places_provider: PlacesProvider,
    decision_rules: DecisionRules,
) -> APIRouter:
    router = APIRouter()

    @router.get("/api/health")
    async def health() -> dict[str, str]:
        return {
            "status": "ready",
            "catalog_version": catalog.version,
            "engine_version": "engine.v2",
            "decision_rules_version": decision_rules.version,
        }

    @router.get("/api/v1/catalog")
    async def get_catalog() -> Catalog:
        return catalog

    @router.post("/api/v1/places/nearby")
    async def nearby(query: PlaceQuery) -> tuple[Place, ...]:
        try:
            return await places_provider.nearby(query)
        except RuntimeError:
            raise HTTPException(status_code=503, detail="place discovery unavailable") from None

    @router.post("/api/v1/interpret/craving")
    async def interpret_craving(request: CravingRequest) -> dict[str, Any]:
        profile = deterministic_craving_fallback(request.text)
        return {"source": "deterministic_fallback", "profile": profile.model_dump(mode="json")}

    @router.post("/api/v1/recommend")
    async def make_recommendation(request: RecommendRequest) -> Any:
        fixture_query = PlaceQuery(latitude=0, longitude=0, radius_m=100_000, limit=50)
        try:
            places = await places_provider.nearby(fixture_query)
            candidates = _candidates(catalog, places)
            if not candidates:
                raise HTTPException(
                    status_code=409,
                    detail="no reviewed demo menus match the discovered places",
                )
            decision = recommend(
                candidates,
                request.context,
                request.constraints,
                RepetitionProfile(**request.repetition.model_dump()),
                PreferenceWeights(**request.preferences.model_dump()),
                catalog_version=catalog.version,
                created_at=datetime.now(UTC),
                rules=decision_rules,
            )
        except NoSafeCandidate as exc:
            raise HTTPException(
                status_code=409,
                detail={"message": "no safe candidate", "reason_counts": exc.reason_counts},
            ) from None
        return decision

    return router
