from pathlib import Path

from fastapi.testclient import TestClient

from onedish_api.app import create_app
from onedish_api.settings import Settings


ROOT = Path(__file__).parents[2]


def client() -> TestClient:
    settings = Settings(
        mode="demo",
        root_path=ROOT,
        allowed_hosts=("testserver", "127.0.0.1", "localhost"),
    )
    return TestClient(create_app(settings))


def test_health_and_catalog_are_available_without_keys() -> None:
    with client() as browser:
        health = browser.get("/api/health")
        catalog = browser.get("/api/v1/catalog")
    assert health.status_code == 200
    assert health.json()["catalog_version"] == "catalog.v1"
    assert catalog.status_code == 200
    assert len(catalog.json()["dishes"]) == 90


def test_fixture_places_and_recommendation_work_without_network() -> None:
    with client() as browser:
        places = browser.post(
            "/api/v1/places/nearby",
            json={"latitude": 40.7128, "longitude": -74.006, "radius_m": 5000},
        )
        response = browser.post(
            "/api/v1/recommend",
            json={
                "context": {
                    "protein_gap_g": 38,
                    "energy_range_kcal": {"min": 500, "max": 720},
                    "recent_categories_to_avoid": ["noodles"],
                    "comfort_preference": "warm",
                    "source_freshness": "today",
                    "wellness_context_used": True,
                    "context_source": "synthetic",
                },
                "constraints": {
                    "max_price_minor": 1750,
                    "currency": "USD",
                    "energy_range_kcal": {"min": 500, "max": 720},
                    "minimum_protein_g": 20,
                    "excluded_allergens": ["peanuts"],
                    "desired_taste_tags": ["warm", "filling"],
                },
                "repetition": {"base_ingredients": {"noodles": 2}},
                "preferences": {},
            },
        )
    assert places.status_code == 200
    assert all(place["source_kind"] == "fixture_place" for place in places.json())
    assert response.status_code == 200
    decision = response.json()
    assert decision["stages"][0]["survivor_count"] == 90
    assert decision["stages"][-1]["survivor_count"] == 1


def test_body_limit_and_host_validation() -> None:
    with client() as browser:
        oversized = browser.post(
            "/api/v1/interpret/craving", content=b'{"text":"' + b"x" * 70_000 + b'"}'
        )
        bad_host = browser.get("/api/health", headers={"host": "evil.example"})
    assert oversized.status_code == 413
    assert bad_host.status_code == 400


def test_security_headers_and_loopback_only_development_cors() -> None:
    with client() as browser:
        response = browser.get(
            "/api/health", headers={"origin": "http://localhost:5173"}
        )
        foreign = browser.get(
            "/api/health", headers={"origin": "https://example.net"}
        )
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-request-id"]
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in foreign.headers


def test_unknown_health_fields_are_rejected() -> None:
    with client() as browser:
        response = browser.post(
            "/api/v1/recommend",
            json={
                "context": {
                    "protein_gap_g": 38,
                    "energy_range_kcal": None,
                    "recent_categories_to_avoid": [],
                    "comfort_preference": None,
                    "source_freshness": "today",
                    "wellness_context_used": True,
                    "context_source": "manual",
                    "weight": 70,
                },
                "constraints": {},
                "repetition": {},
                "preferences": {},
            },
        )
    assert response.status_code == 422
    assert "70" not in response.text
