import os
import time

import pytest

from onedish_api.providers.amap import AmapPlacesProvider
from onedish_api.providers.base import PlaceQuery
from onedish_api.restaurant_domain import RestaurantProfile, RestaurantRecommendRequest
from onedish_api.restaurants.service import RestaurantRecommendationService


pytestmark = pytest.mark.live


@pytest.mark.asyncio
async def test_live_amap_contract_without_persisting_response(tmp_path, monkeypatch) -> None:
    if os.getenv("ONEDISH_LIVE_AMAP_TEST") != "1":
        pytest.skip("live AMap smoke test is opt-in")
    key = os.getenv("ONEDISH_AMAP_WEB_KEY") or os.getenv("AMAP_WEB_KEY")
    if not key:
        pytest.skip("live AMap key is not configured")
    attempted_radii: list[int] = []
    provider = AmapPlacesProvider(key)

    class RecordingProvider:
        async def nearby(self, query: PlaceQuery):
            attempted_radii.append(query.radius_m)
            return await provider.nearby(query)

    monkeypatch.chdir(tmp_path)
    started = time.monotonic()
    response = await RestaurantRecommendationService(providers=[RecordingProvider()]).recommend(
        RestaurantRecommendRequest(
            latitude=24.4798,
            longitude=118.0894,
            profile=RestaurantProfile(selected_tags=("japanese",)),
        )
    )
    assert time.monotonic() - started < 35
    assert tuple(attempted_radii) == (2000, 3000, 5000)[: len(attempted_radii)]
    assert response.ranked
    assert all("japanese" in item.matched_tags for item in response.ranked)
    budget_reason = {
        "not_requested": set(),
        "within": {"within_budget"},
        "stretch": {"budget_stretch"},
        "unknown": {"budget_unknown"},
    }
    for item in response.ranked:
        actual = set(item.reason_codes) & {
            "within_budget", "budget_stretch", "budget_unknown"
        }
        assert actual <= budget_reason[item.budget_state]
    assert list(tmp_path.iterdir()) == []
