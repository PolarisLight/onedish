"""Stateless orchestration for one restaurant recommendation."""

from __future__ import annotations

import asyncio
import secrets
from collections.abc import Sequence

from onedish_api.providers.base import PlaceQuery, PlacesProvider
from onedish_api.rerankers.base import RestaurantReranker, choose_with_timeout
from onedish_api.restaurant_domain import (
    RestaurantRecommendRequest,
    RestaurantRecommendResponse,
)
from onedish_api.restaurants.normalizer import deduplicate, normalize_places
from onedish_api.restaurants.scoring import recommendation_mode, score_restaurants


class RestaurantDiscoveryUnavailable(RuntimeError):
    pass


class RestaurantRecommendationService:
    def __init__(
        self,
        *,
        providers: Sequence[PlacesProvider],
        reranker: RestaurantReranker | None = None,
        rerank_timeout_seconds: float = 2.0,
    ) -> None:
        self._providers = tuple(providers)
        self._reranker = reranker
        self._rerank_timeout_seconds = rerank_timeout_seconds

    async def _discover(self, request: RestaurantRecommendRequest) -> tuple:
        query = PlaceQuery(
            latitude=request.latitude,
            longitude=request.longitude,
            radius_m=3000,
            limit=50,
        )
        results = await asyncio.gather(
            *(provider.nearby(query) for provider in self._providers),
            return_exceptions=True,
        )
        places = tuple(
            place for result in results if not isinstance(result, BaseException) for place in result
        )
        return deduplicate(normalize_places(places))

    async def recommend(self, request: RestaurantRecommendRequest) -> RestaurantRecommendResponse:
        candidates = await self._discover(request)
        scoring = score_restaurants(candidates, request)
        if not scoring.ranked:
            raise RestaurantDiscoveryUnavailable("no nearby restaurant candidates")

        ranked = scoring.ranked
        selection_source = "deterministic"
        model_status = "disabled"
        if self._reranker is not None:
            outcome = await choose_with_timeout(
                self._reranker,
                ranked[:10],
                request,
                timeout_seconds=self._rerank_timeout_seconds,
            )
            model_status = outcome.status
            if outcome.selected is not None:
                index = ranked.index(outcome.selected)
                ranked = (ranked[index], *ranked[:index], *ranked[index + 1 :])
                selection_source = "ai_rerank"

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
