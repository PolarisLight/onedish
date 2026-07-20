from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from onedish_api.app import create_app
from onedish_api.domain import Place
from onedish_api.providers.overture import OverturePlacesProvider
from onedish_api.restaurant_domain import RestaurantRecommendResponse
from onedish_api.settings import Settings


ROOT = Path(__file__).parents[2]


def test_restaurant_endpoint_rejects_unknown_request_fields_without_echoing_them() -> None:
    app = create_app(Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",)))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "schema_version": "restaurant-request.v2",
                "latitude": 24.48,
                "longitude": 118.09,
                "weight-sensitive-value": 70,
            },
        )
    assert response.status_code == 422
    assert "weight-sensitive-value" not in response.text


def test_restaurant_endpoint_rejects_provider_fields_in_recent_intents() -> None:
    app = create_app(Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",)))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "schema_version": "restaurant-request.v2",
                "latitude": 24.48,
                "longitude": 118.09,
                "recent_intents": [
                    {
                        "occurred_at": "2026-07-19T00:00:00Z",
                        "selected_tags": ["japanese"],
                        "restaurant_name": "sensitive-provider-value",
                    }
                ],
            },
        )
    assert response.status_code == 422
    assert "sensitive-provider-value" not in response.text


def test_v2_response_rejects_old_ai_and_personalization_fields() -> None:
    with pytest.raises(ValidationError):
        RestaurantRecommendResponse.model_validate(
            {
                "schema_version": "restaurant-recommendation.v2",
                "session_id": "a" * 32,
                "active_radius_m": 2000,
                "search_rounds": [
                    {"radius_m": 2000, "discovered_count": 1, "eligible_count": 1}
                ],
                "exclusions": {},
                "quality_pool_count": 1,
                "ranked": [],
                "selection_source": "ai_rerank",
                "recommendation_mode": "personalized",
            }
        )


def test_no_match_is_structured_and_does_not_echo_request_values(monkeypatch) -> None:
    async def empty(_provider: OverturePlacesProvider, _query):
        return ()

    monkeypatch.setattr(OverturePlacesProvider, "nearby", empty)
    app = create_app(Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",)))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "latitude": 24.481234,
                "longitude": 118.091234,
                "profile": {
                    "selected_tags": ["japanese"],
                    "budget_minor": 5000,
                    "budget_is_explicit": True,
                },
            },
        )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "no_match"
    assert response.json()["detail"]["recovery_actions"] == ["clear_tags", "ignore_budget"]
    assert "24.481234" not in response.text
    assert "118.091234" not in response.text
    assert "japanese" not in response.text


def test_all_provider_failure_returns_sanitized_503(monkeypatch) -> None:
    async def fail(_provider: OverturePlacesProvider, _query):
        raise RuntimeError("sensitive upstream failure")

    monkeypatch.setattr(OverturePlacesProvider, "nearby", fail)
    app = create_app(Settings(mode="demo", root_path=ROOT, allowed_hosts=("testserver",)))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/restaurants/recommend",
            json={"latitude": 24.48, "longitude": 118.09},
        )
    assert response.status_code == 503
    assert response.json() == {"detail": {"code": "provider_unavailable"}}
    assert "sensitive upstream failure" not in response.text


def test_restaurant_endpoint_serializes_provider_backed_v2_without_ai_fields(monkeypatch) -> None:
    async def nearby(_provider: OverturePlacesProvider, query):
        return (
            Place(
                id="japanese",
                name="Japanese",
                category="日本料理",
                distance_m=min(query.radius_m, 500),
                rating=4.7,
                open_state="open",
                source_kind="overture_place",
                attribution="Overture",
                order_destination="https://www.openstreetmap.org/",
            ),
        )

    monkeypatch.setattr(OverturePlacesProvider, "nearby", nearby)
    app = create_app(
        Settings(
            mode="demo",
            root_path=ROOT,
            allowed_hosts=("testserver",),
            openai_api_key="must-not-affect-restaurant-v2",
        )
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/restaurants/recommend",
            json={
                "latitude": 24.48,
                "longitude": 118.09,
                "profile": {"selected_tags": ["japanese"]},
            },
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "restaurant-recommendation.v2"
    assert payload["active_radius_m"] == 2000
    assert payload["ranked"][0]["candidate"]["name"] == "Japanese"
    assert "selection_source" not in payload
    assert "model_status" not in payload
