import asyncio
from random import Random

import pytest

from onedish_api.domain import Place
from onedish_api.providers.base import PlaceQuery
from onedish_api.restaurant_domain import RestaurantProfile, RestaurantRecommendRequest
from onedish_api.restaurants.service import (
    NoRestaurantMatch,
    ProviderUnavailable,
    RestaurantRecommendationService,
)


def place(
    identifier: str,
    category: str,
    *,
    distance: int = 300,
    rating: float | None = 4.0,
    cost: int | None = None,
) -> Place:
    return Place(
        id=identifier,
        name=identifier,
        category=category,
        distance_m=distance,
        rating=rating,
        average_cost_minor=cost,
        currency="CNY" if cost is not None else None,
        open_state="open",
        source_kind="overture_place",
        attribution="Overture",
        latitude=24.48,
        longitude=118.09,
        order_destination="https://www.openstreetmap.org/",
    )


class Provider:
    def __init__(
        self,
        values: dict[int, tuple[Place, ...]] | None = None,
        *,
        fail: bool = False,
        by_keyword: dict[str, tuple[Place, ...]] | None = None,
    ) -> None:
        self.values = values or {}
        self.fail = fail
        self.by_keyword = by_keyword or {}
        self.queries: list[PlaceQuery] = []

    async def nearby(self, query: PlaceQuery) -> tuple[Place, ...]:
        self.queries.append(query)
        await asyncio.sleep(0)
        if self.fail:
            raise RuntimeError("sensitive upstream failure")
        if query.keywords and query.keywords[0] in self.by_keyword:
            return self.by_keyword[query.keywords[0]]
        return self.values.get(query.radius_m, ())


def request(
    *,
    selected_tags: tuple[str, ...] = (),
    budget: int | None = None,
) -> RestaurantRecommendRequest:
    return RestaurantRecommendRequest(
        latitude=24.4798,
        longitude=118.0894,
        profile=RestaurantProfile(
            selected_tags=selected_tags,
            budget_minor=budget,
            budget_is_explicit=budget is not None,
        ),
    )


@pytest.mark.asyncio
async def test_searches_2_then_3_then_5_km_and_stops_on_first_eligible_set() -> None:
    provider = Provider(
        {
            2000: (),
            3000: (place("wrong", "咖啡厅"),),
            5000: (place("match", "日本料理", distance=4200),),
        }
    )
    service = RestaurantRecommendationService(
        providers=(provider,), rng_factory=lambda: Random(3)
    )
    response = await service.recommend(request(selected_tags=("japanese",)))
    assert [query.radius_m for query in provider.queries] == [2000, 3000, 5000]
    assert [round_.radius_m for round_ in response.search_rounds] == [2000, 3000, 5000]
    assert response.active_radius_m == 5000
    assert response.ranked[0].candidate.name == "match"


@pytest.mark.asyncio
async def test_never_expands_after_an_eligible_2km_set() -> None:
    provider = Provider({2000: (place("match", "火锅店"),)})
    response = await RestaurantRecommendationService(
        providers=(provider,), rng_factory=lambda: Random(1)
    ).recommend(request(selected_tags=("hot_pot",)))
    assert [query.radius_m for query in provider.queries] == [2000]
    assert response.active_radius_m == 2000


@pytest.mark.asyncio
async def test_multiple_explicit_tags_fan_out_as_or_and_never_admit_unrelated_places() -> None:
    provider = Provider(
        by_keyword={
            "日本料理": (place("japanese", "日本料理"), place("coffee", "咖啡厅")),
            "火锅": (place("hot-pot", "火锅店"),),
        }
    )
    response = await RestaurantRecommendationService(
        providers=(provider,), rng_factory=lambda: Random(4)
    ).recommend(request(selected_tags=("japanese", "hot_pot")))
    assert {query.keywords for query in provider.queries} == {("日本料理",), ("火锅",)}
    assert {item.candidate.name for item in response.ranked} == {"japanese", "hot-pot"}
    assert "coffee" not in {item.candidate.name for item in response.ranked}


@pytest.mark.asyncio
async def test_one_successful_provider_is_enough_when_another_fails() -> None:
    response = await RestaurantRecommendationService(
        providers=(Provider(fail=True), Provider({2000: (place("match", "日本料理"),)})),
        rng_factory=lambda: Random(2),
    ).recommend(request(selected_tags=("japanese",)))
    assert response.ranked[0].candidate.name == "match"


@pytest.mark.asyncio
async def test_all_failed_calls_raise_provider_unavailable() -> None:
    with pytest.raises(ProviderUnavailable):
        await RestaurantRecommendationService(providers=(Provider(fail=True),)).recommend(
            request(selected_tags=("japanese",))
        )


@pytest.mark.asyncio
async def test_successful_empty_provider_raises_no_match_with_real_rounds() -> None:
    with pytest.raises(NoRestaurantMatch) as captured:
        await RestaurantRecommendationService(providers=(Provider(),)).recommend(
            request(selected_tags=("japanese",), budget=5000)
        )
    assert [round_.radius_m for round_ in captured.value.search_rounds] == [2000, 3000, 5000]
    assert captured.value.recovery_actions == ("clear_tags", "ignore_budget")


@pytest.mark.asyncio
async def test_quality_pool_is_bounded_and_randomized_without_duplicates() -> None:
    values = tuple(
        place(str(index), "日本料理", distance=100 + index * 20, rating=4.8)
        for index in range(8)
    )
    response = await RestaurantRecommendationService(
        providers=(Provider({2000: values}),), rng_factory=lambda: Random(9)
    ).recommend(request(selected_tags=("japanese",)))
    identifiers = [item.candidate.id for item in response.ranked]
    assert response.quality_pool_count == len(identifiers) == 5
    assert len(set(identifiers)) == len(identifiers)
