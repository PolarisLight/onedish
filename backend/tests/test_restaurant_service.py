import asyncio

import pytest

from onedish_api.domain import Place
from onedish_api.providers.base import PlaceQuery
from onedish_api.rerankers.base import RerankChoice
from onedish_api.restaurant_domain import RestaurantRecommendRequest
from onedish_api.restaurants.service import (
    RestaurantDiscoveryUnavailable,
    RestaurantRecommendationService,
)


def open_place(identifier: str, distance: int = 300, rating: float | None = None) -> Place:
    return Place(
        id=identifier,
        name=identifier,
        category="闽菜",
        distance_m=distance,
        rating=rating,
        open_state="unknown",
        source_kind="overture_place",
        attribution="Overture",
        latitude=24.48,
        longitude=118.09,
        order_destination="https://www.openstreetmap.org/",
    )


class Provider:
    def __init__(self, values=(), *, fail=False):
        self.values = values
        self.fail = fail
        self.queries: list[PlaceQuery] = []

    async def nearby(self, query):
        self.queries.append(query)
        await asyncio.sleep(0)
        if self.fail:
            raise RuntimeError("provider unavailable")
        return tuple(item for item in self.values if item.distance_m <= query.radius_m)


class Reranker:
    async def choose(self, candidates, request):
        return RerankChoice(
            restaurant_id=candidates[-1].candidate.id,
            reason_codes=candidates[-1].reason_codes,
        )


def request(**profile) -> RestaurantRecommendRequest:
    return RestaurantRecommendRequest(
        latitude=24.4798,
        longitude=118.0894,
        meal_period="lunch",
        profile=profile,
    )


@pytest.mark.asyncio
async def test_isolates_provider_failure_and_reranks_supplied_candidates() -> None:
    service = RestaurantRecommendationService(
        providers=(
            Provider(fail=True),
            Provider((open_place("far", 500), open_place("near", 100))),
        ),
        reranker=Reranker(),
    )
    response = await service.recommend(request())
    assert response.selection_source == "ai_rerank"
    assert response.model_status == "selected"
    assert response.ranked[0].candidate.id in {"overture:near", "overture:far"}
    assert len(response.session_id) == 32
    assert response.recommendation_mode == "exploration"


@pytest.mark.asyncio
async def test_discovers_once_at_fixed_radius() -> None:
    provider = Provider((open_place("expanded", 2200),))
    response = await RestaurantRecommendationService(providers=(provider,)).recommend(request())
    assert [query.radius_m for query in provider.queries] == [3000]
    assert response.radius_m == 3000


@pytest.mark.asyncio
async def test_explicit_cuisine_expands_discovery_and_passes_provider_keyword() -> None:
    provider = Provider((
        open_place("near-other", 300),
        Place(
            id="japanese",
            name="远一点的日料",
            category="日本料理",
            distance_m=6200,
            open_state="unknown",
            source_kind="overture_place",
            attribution="Overture",
            latitude=24.48,
            longitude=118.09,
            order_destination="https://www.openstreetmap.org/",
        ),
    ))

    response = await RestaurantRecommendationService(providers=(provider,)).recommend(
        request(preferred_cuisines=("japanese",), max_distance_m=10_000)
    )

    assert provider.queries[0].radius_m == 10_000
    assert provider.queries[0].keywords == ("日本料理",)
    assert [item.candidate.name for item in response.ranked] == ["远一点的日料"]
    assert response.radius_m == 10_000


@pytest.mark.asyncio
async def test_serializes_successful_provider_backed_response() -> None:
    provider = Provider(
        (
            open_place("near", 100, rating=3.0),
            open_place("rated", 2400, rating=4.9),
        )
    )
    response = await RestaurantRecommendationService(providers=(provider,)).recommend(request())
    payload = response.model_dump(mode="json")

    assert payload["recommendation_mode"] == "exploration"
    assert payload["radius_m"] == 3000
    assert payload["ranked"][0]["candidate"]["id"] == "overture:rated"
    assert payload["ranked"][0]["reason_codes"] == ["higher_rating"]


@pytest.mark.asyncio
async def test_raises_when_no_provider_returns_candidates() -> None:
    with pytest.raises(RestaurantDiscoveryUnavailable):
        await RestaurantRecommendationService(
            providers=(Provider(fail=True), Provider(()))
        ).recommend(request())
