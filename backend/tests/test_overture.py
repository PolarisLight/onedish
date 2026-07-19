import json

import pytest

from onedish_api.providers.base import PlaceQuery
from onedish_api.providers.overture import OverturePlacesProvider


@pytest.mark.asyncio
async def test_overture_filters_by_radius_and_preserves_attribution(tmp_path) -> None:
    path = tmp_path / "xiamen.json"
    path.write_text(json.dumps({
        "schema_version": "onedish-overture.v1",
        "generated_at": "2026-07-19T00:00:00Z",
        "bbox": [117.85, 24.38, 118.30, 24.75],
        "attribution": "Overture Maps Foundation · OpenStreetMap contributors",
        "places": [
            {"id": "near", "name": "Nearby", "category": "restaurant", "latitude": 24.48, "longitude": 118.09, "confidence": 0.8, "upstream_sources": ["OpenStreetMap"]},
            {"id": "far", "name": "Far", "category": "restaurant", "latitude": 24.60, "longitude": 118.20, "confidence": 0.7, "upstream_sources": ["OpenStreetMap"]},
        ],
    }), encoding="utf-8")
    provider = OverturePlacesProvider(path)

    places = await provider.nearby(
        PlaceQuery(latitude=24.4798, longitude=118.0894, radius_m=1500, limit=10)
    )

    assert [place.id for place in places] == ["near"]
    assert places[0].source_kind == "overture_place"
    assert places[0].attribution == "Overture Maps Foundation · OpenStreetMap contributors"
    assert places[0].distance_m < 100
    assert "mlat=24.480000" in (places[0].order_destination or "")
