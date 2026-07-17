import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from onedish_api.app import create_app
from onedish_api.settings import Settings


ROOT = Path(__file__).parents[2]


def test_request_logs_contain_no_location_or_context_values(caplog) -> None:
    app = create_app(
        Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",))
    )
    caplog.set_level(logging.INFO, logger="onedish.request")
    with TestClient(app) as browser:
        browser.post(
            "/api/v1/places/nearby",
            json={"latitude": 40.7128123, "longitude": -74.0060123, "radius_m": 5000},
        )
    rendered = caplog.text
    assert "40.7128123" not in rendered
    assert "-74.0060123" not in rendered
    assert "places/nearby" in rendered


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("weight", 70),
        ("sleep_stages", ["deep"]),
        ("heart_rate", 61),
        ("health_samples", [{"kind": "steps", "value": 9000}]),
        ("address", "14 Private Lane"),
    ],
)
def test_recommend_rejects_undocumented_sensitive_fields_without_echo(
    field: str, value: object
) -> None:
    app = create_app(
        Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",))
    )
    marker = str(value)
    with TestClient(app) as browser:
        response = browser.post(
            "/api/v1/recommend",
            json={
                "context": {
                    "protein_gap_g": None,
                    "energy_range_kcal": None,
                    "recent_categories_to_avoid": [],
                    "comfort_preference": None,
                    "source_freshness": "unavailable",
                    "wellness_context_used": False,
                    "context_source": "none",
                    field: value,
                },
                "constraints": {},
            },
        )
    assert response.status_code == 422
    assert marker not in response.text
