"""Stateless orchestration for one active restaurant recommendation session."""

from __future__ import annotations

import asyncio
import secrets
from collections.abc import Callable, Sequence
from random import Random, SystemRandom
from typing import Literal

from onedish_api.providers.base import PlaceQuery, PlacesProvider
from onedish_api.restaurant_domain import (
    ExclusionCounts,
    RestaurantCandidate,
    RestaurantRecommendRequest,
    RestaurantRecommendResponse,
    SearchRound,
)
from onedish_api.restaurants.normalizer import deduplicate, normalize_places
from onedish_api.restaurants.scoring import build_quality_pool, score_restaurants, weighted_permutation
from onedish_api.restaurants.taxonomy import query_filter


SEARCH_RADII = (2000, 3000, 5000)
RecoveryAction = Literal["clear_tags", "ignore_budget"]


class ProviderUnavailable(RuntimeError):
    """Every live provider call failed for the request."""


class NoRestaurantMatch(RuntimeError):
    """At least one provider succeeded, but no candidate met the request."""

    def __init__(
        self,
        *,
        search_rounds: tuple[SearchRound, ...],
        exclusions: ExclusionCounts,
        recovery_actions: tuple[RecoveryAction, ...],
    ) -> None:
        super().__init__("no restaurant matched the current request")
        self.search_rounds = search_rounds
        self.exclusions = exclusions
        self.recovery_actions = recovery_actions


class RestaurantRecommendationService:
    def __init__(
        self,
        *,
        providers: Sequence[PlacesProvider],
        rng_factory: Callable[[], Random] = SystemRandom,
    ) -> None:
        if not providers:
            raise ValueError("at least one restaurant provider is required")
        self._providers = tuple(providers)
        self._rng_factory = rng_factory

    @staticmethod
    def _queries(request: RestaurantRecommendRequest, radius_m: int) -> tuple[PlaceQuery, ...]:
        if not request.profile.selected_tags:
            return (
                PlaceQuery(
                    latitude=request.latitude,
                    longitude=request.longitude,
                    radius_m=radius_m,
                    limit=50,
                    type_codes=("050000",),
                ),
            )
        queries: list[PlaceQuery] = []
        for tag in request.profile.selected_tags:
            filters = query_filter(tag)
            queries.append(
                PlaceQuery(
                    latitude=request.latitude,
                    longitude=request.longitude,
                    radius_m=radius_m,
                    limit=50,
                    keywords=filters.keywords,
                    type_codes=filters.type_codes,
                )
            )
        return tuple(queries)

    async def _discover_round(
        self,
        request: RestaurantRecommendRequest,
        radius_m: int,
    ) -> tuple[tuple[RestaurantCandidate, ...], int]:
        queries = self._queries(request, radius_m)
        results = await asyncio.gather(
            *(
                provider.nearby(query)
                for provider in self._providers
                for query in queries
            ),
            return_exceptions=True,
        )
        successful = tuple(result for result in results if not isinstance(result, BaseException))
        places = tuple(place for result in successful for place in result)
        candidates = deduplicate(normalize_places(places))
        return candidates, len(successful)

    async def recommend(
        self,
        request: RestaurantRecommendRequest,
    ) -> RestaurantRecommendResponse:
        search_rounds: list[SearchRound] = []
        successful_call_count = 0
        final_exclusions = ExclusionCounts()

        for radius_m in SEARCH_RADII:
            candidates, successful = await self._discover_round(request, radius_m)
            successful_call_count += successful
            scoring = score_restaurants(candidates, request, radius_m=radius_m)
            final_exclusions = scoring.exclusions
            search_rounds.append(
                SearchRound(
                    radius_m=radius_m,
                    discovered_count=len(candidates),
                    eligible_count=len(scoring.ranked),
                )
            )
            if not scoring.ranked:
                continue
            pool = build_quality_pool(
                scoring.ranked,
                budget_is_explicit=request.profile.budget_is_explicit,
            )
            randomized = weighted_permutation(pool, self._rng_factory())
            return RestaurantRecommendResponse(
                session_id=secrets.token_hex(16),
                active_radius_m=radius_m,
                search_rounds=tuple(search_rounds),
                exclusions=scoring.exclusions,
                quality_pool_count=len(randomized),
                ranked=randomized,
            )

        if successful_call_count == 0:
            raise ProviderUnavailable("restaurant providers unavailable")
        actions: list[RecoveryAction] = []
        if request.profile.selected_tags:
            actions.append("clear_tags")
        if request.profile.budget_is_explicit:
            actions.append("ignore_budget")
        raise NoRestaurantMatch(
            search_rounds=tuple(search_rounds),
            exclusions=final_exclusions,
            recovery_actions=tuple(actions),
        )
