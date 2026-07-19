import os
import time

import pytest

from onedish_api.providers.amap import AmapPlacesProvider
from onedish_api.providers.base import PlaceQuery


pytestmark = pytest.mark.live


@pytest.mark.asyncio
async def test_live_amap_contract_without_persisting_response() -> None:
    if os.getenv("ONEDISH_LIVE_AMAP_TEST") != "1":
        pytest.skip("live AMap smoke test is opt-in")
    key = os.getenv("ONEDISH_AMAP_WEB_KEY") or os.getenv("AMAP_WEB_KEY")
    if not key:
        pytest.skip("live AMap key is not configured")
    started = time.monotonic()
    places = await AmapPlacesProvider(key).nearby(
        PlaceQuery(latitude=24.4798, longitude=118.0894, radius_m=1500, limit=5)
    )
    assert time.monotonic() - started < 10
    assert places
    assert all(place.id and place.source_kind == "amap_place" for place in places)
