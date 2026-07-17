import json
from pathlib import Path

import httpx
import pytest
import respx

from onedish_api.providers.base import PlaceQuery
from onedish_api.providers.fixtures import FixturePlacesProvider
from onedish_api.providers.foursquare import FoursquarePlacesProvider


ROOT = Path(__file__).parents[2]


@pytest.mark.asyncio
async def test_fixture_places_are_bounded_and_truthfully_labeled() -> None:
    provider = FixturePlacesProvider(ROOT / "data/places.v1.json")
    places = await provider.nearby(PlaceQuery(latitude=40.7128, longitude=-74.006, radius_m=5000))
    assert len(places) == 10
    assert all(place.source_kind == "fixture_place" for place in places)
    assert all(place.attribution == "OneDish fixture place" for place in places)


@pytest.mark.asyncio
@respx.mock
async def test_foursquare_normalizes_documented_fields_without_leaking_key() -> None:
    route = respx.get("https://places-api.foursquare.com/places/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "fsq_place_id": "fsq-1",
                        "name": "A Real Place",
                        "categories": [{"name": "Restaurant"}],
                        "distance": 321,
                        "price": 2,
                        "rating": 8.9,
                        "hours": {"open_now": True},
                        "link": "https://foursquare.com/v/fsq-1",
                    }
                ]
            },
        )
    )
    provider = FoursquarePlacesProvider("secret-key")
    places = await provider.nearby(PlaceQuery(latitude=40.7128, longitude=-74.006, radius_m=5000))
    assert route.called
    request = route.calls[0].request
    assert request.headers["Authorization"] == "Bearer secret-key"
    assert request.headers["X-Places-Api-Version"] == "2025-06-17"
    assert places[0].source_kind == "foursquare_place"
    assert places[0].distance_m == 321
    assert places[0].open_state == "open"


@pytest.mark.asyncio
@respx.mock
async def test_foursquare_error_is_bounded_and_does_not_contain_key() -> None:
    respx.get("https://places-api.foursquare.com/places/search").mock(
        return_value=httpx.Response(429, text="rate limited secret-key")
    )
    provider = FoursquarePlacesProvider("secret-key")
    with pytest.raises(RuntimeError) as error:
        await provider.nearby(PlaceQuery(latitude=40.7, longitude=-74.0))
    assert "secret-key" not in str(error.value)
    assert "429" in str(error.value)


def test_fixture_file_contains_no_platform_claim() -> None:
    payload = json.loads((ROOT / "data/places.v1.json").read_text())
    assert "deliver" not in json.dumps(payload).lower()
