from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from onedish_api.app import create_app
from onedish_api.domain import Place
from onedish_api.providers.overture import OverturePlacesProvider
from onedish_api.restaurant_domain import RestaurantRecommendResponse
from onedish_api.settings import Settings


ROOT = Path(__file__).parents[2]


def test_restaurant_endpoint_is_strict_and_fails_safely_without_places() -> None:
    app = create_app(Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",)))
    with TestClient(app) as client:
        invalid = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "latitude": 24.48,
                "longitude": 118.09,
                "meal_period": "lunch",
                "weight": 70,
            },
        )
        unavailable = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "latitude": 24.48,
                "longitude": 118.09,
                "meal_period": "lunch",
            },
        )
        old = client.get("/api/health")
    assert invalid.status_code == 422
    assert unavailable.status_code == 503
    assert old.status_code == 200


@pytest.mark.parametrize(
    "history",
    [
        {"recent_cuisines": {"fujian": -1}},
        {"recent_cuisines": {"fujian": 1001}},
        {"cuisine_preferences": {"fujian": -0.1}},
        {"cuisine_preferences": {"fujian": 1.1}},
    ],
)
def test_restaurant_endpoint_rejects_invalid_history_values(history) -> None:
    app = create_app(Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",)))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "latitude": 24.48,
                "longitude": 118.09,
                "meal_period": "lunch",
                "history": history,
            },
        )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("recent_cuisines", 1),
        ("cuisine_preferences", 0.5),
    ],
)
@pytest.mark.parametrize("cuisine", ["spicy", "warm", "fresh", "unknown-sensitive-input"])
def test_restaurant_endpoint_rejects_and_does_not_echo_invalid_history_cuisines(
    field: str, value: int | float, cuisine: str
) -> None:
    app = create_app(Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",)))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "latitude": 24.48,
                "longitude": 118.09,
                "meal_period": "lunch",
                "history": {field: {cuisine: value}},
            },
        )

    assert response.status_code == 422
    assert cuisine not in response.text


def test_recommendation_response_accepts_explicit_exploration_contract() -> None:
    response = RestaurantRecommendResponse.model_validate(
        {
            "schema_version": "restaurant-recommendation.v1",
            "session_id": "a" * 32,
            "ranked": [
                {
                    "candidate": {
                        "id": "amap:B0TEST",
                        "name": "沙茶里",
                        "distance_m": 620,
                        "rating": 4.6,
                        "source_kind": "amap_place",
                        "attribution": "高德地图",
                        "evidence": {"distance": True, "rating": True},
                    },
                    "score": 88,
                    "reason_codes": ["higher_rating"],
                }
            ],
            "trace": [{"id": "winner", "input_count": 1, "survivor_count": 1}],
            "selection_source": "deterministic",
            "model_status": "disabled",
            "recommendation_mode": "exploration",
            "radius_m": 3000,
        }
    )

    assert response.recommendation_mode == "exploration"
    assert response.radius_m == 3000
    assert response.ranked[0].reason_codes == ("higher_rating",)


def test_restaurant_endpoint_serializes_provider_backed_response(monkeypatch) -> None:
    async def nearby(_provider: OverturePlacesProvider, query):
        assert query.radius_m == 3000
        return (
            Place(
                id="near",
                name="Near",
                category="restaurant",
                distance_m=100,
                rating=3.0,
                open_state="unknown",
                source_kind="overture_place",
                attribution="Overture",
                latitude=24.48,
                longitude=118.09,
            ),
            Place(
                id="rated",
                name="Rated",
                category="restaurant",
                distance_m=2400,
                rating=4.9,
                open_state="unknown",
                source_kind="overture_place",
                attribution="Overture",
                latitude=24.49,
                longitude=118.10,
            ),
        )

    monkeypatch.setattr(OverturePlacesProvider, "nearby", nearby)
    app = create_app(
        Settings(
            mode="demo",
            root_path=ROOT,
            allowed_hosts=("testserver",),
            openai_api_key=None,
        )
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "latitude": 24.48,
                "longitude": 118.09,
                "meal_period": "lunch",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["recommendation_mode"] == "exploration"
    assert payload["radius_m"] == 3000
    assert payload["ranked"][0]["candidate"]["id"] == "overture:rated"
    assert payload["ranked"][0]["reason_codes"] == ["higher_rating"]
