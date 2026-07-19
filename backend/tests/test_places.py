import json
from pathlib import Path

import httpx
import pytest
import respx

from onedish_api.providers.base import PlaceQuery
from onedish_api.providers.amap import AmapPlacesProvider
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


@pytest.mark.asyncio
@respx.mock
async def test_amap_converts_gps_and_normalizes_restaurant_fields() -> None:
    convert = respx.get("https://restapi.amap.com/v3/assistant/coordinate/convert").mock(
        return_value=httpx.Response(
            200,
            json={"status": "1", "info": "ok", "locations": "121.474000,31.231000"},
        )
    )
    around = respx.get("https://restapi.amap.com/v5/place/around").mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "1",
                "info": "OK",
                "infocode": "10000",
                "pois": [
                    {
                        "id": "B0AMAP123",
                        "name": "小杨生煎",
                        "location": "121.474200,31.231200",
                        "distance": "128",
                        "type": "餐饮服务;中餐厅;特色/地方风味餐厅",
                        "address": "南京西路测试号",
                        "business": {
                            "opentime_today": "10:00-22:00",
                            "rating": "4.7",
                            "cost": "36",
                            "tag": "生煎",
                        },
                        "photos": [{"url": "https://example.com/restaurant.jpg"}],
                    }
                ],
            },
        )
    )

    places = await AmapPlacesProvider("private-amap-key").nearby(
        PlaceQuery(latitude=31.2304, longitude=121.4737, radius_m=3_000, limit=10)
    )

    assert convert.called and around.called
    assert convert.calls[0].request.url.params["coordsys"] == "gps"
    assert convert.calls[0].request.url.params["locations"] == "121.473700,31.230400"
    around_params = around.calls[0].request.url.params
    assert around_params["location"] == "121.474000,31.231000"
    assert around_params["types"] == "050000"
    assert around_params["show_fields"] == "business,photos"
    assert places[0].model_dump() == {
        "id": "B0AMAP123",
        "name": "小杨生煎",
        "category": "生煎",
        "distance_m": 128,
        "price_tier": 2,
        "rating": 4.7,
        "open_state": "unknown",
        "order_destination": (
            "https://uri.amap.com/marker?position=121.474200%2C31.231200"
            "&name=%E5%B0%8F%E6%9D%A8%E7%94%9F%E7%85%8E&src=onedish"
            "&coordinate=gaode&callnative=1"
        ),
        "source_kind": "amap_place",
        "attribution": "高德地图",
        "address": "南京西路测试号",
        "average_cost_minor": 3600,
        "currency": "CNY",
        "latitude": 31.2312,
        "longitude": 121.4742,
        "photo_url": "https://example.com/restaurant.jpg",
    }


@pytest.mark.asyncio
@respx.mock
async def test_amap_failure_is_bounded_and_does_not_contain_key() -> None:
    respx.get("https://restapi.amap.com/v3/assistant/coordinate/convert").mock(
        return_value=httpx.Response(429, text="rate limited private-amap-key")
    )
    provider = AmapPlacesProvider("private-amap-key")

    with pytest.raises(RuntimeError) as error:
        await provider.nearby(PlaceQuery(latitude=31.23, longitude=121.47))

    assert "private-amap-key" not in str(error.value)
    assert "429" in str(error.value)


@pytest.mark.asyncio
@respx.mock
async def test_amap_does_not_cache_identical_queries() -> None:
    convert = respx.get("https://restapi.amap.com/v3/assistant/coordinate/convert").mock(
        return_value=httpx.Response(
            200, json={"status": "1", "locations": "118.089400,24.479800"}
        )
    )
    around = respx.get("https://restapi.amap.com/v5/place/around").mock(
        return_value=httpx.Response(200, json={"status": "1", "pois": []})
    )
    provider = AmapPlacesProvider("private-amap-key")
    query = PlaceQuery(latitude=24.4798, longitude=118.0894, radius_m=1500)

    await provider.nearby(query)
    await provider.nearby(query)

    assert convert.call_count == 2
    assert around.call_count == 2
    assert not hasattr(provider, "_cache")
