from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from onedish_api.restaurant_domain import (
    AcceptedIntent,
    ExclusionCounts,
    RankedRestaurant,
    RestaurantCandidate,
    RestaurantEvidence,
    RestaurantProfile,
    RestaurantRecommendRequest,
    RestaurantRecommendResponse,
    SearchRound,
)


def candidate() -> RestaurantCandidate:
    return RestaurantCandidate(
        id="amap:B0TEST",
        name="沙茶里",
        category="闽南菜",
        intent_tags=("minnan_fujian",),
        distance_m=620,
        rating=4.6,
        average_cost_minor=5200,
        currency="CNY",
        open_state="unknown",
        navigation_url="https://uri.amap.com/marker?position=118.1,24.4",
        source_kind="amap_place",
        attribution="高德地图",
        evidence=RestaurantEvidence(
            distance=True,
            rating=True,
            average_cost=True,
            category=True,
            open_state=False,
        ),
    )


def ranked(*, budget_state: str = "within", overage: int | None = None) -> RankedRestaurant:
    return RankedRestaurant(
        candidate=candidate(),
        score=88,
        matched_tags=("minnan_fujian",),
        budget_state=budget_state,
        budget_overage_minor=overage,
        reason_codes=("tag_match", "within_budget"),
    )


def response(**overrides: object) -> RestaurantRecommendResponse:
    payload = {
        "session_id": "a" * 32,
        "active_radius_m": 3000,
        "search_rounds": (
            SearchRound(radius_m=2000, discovered_count=2, eligible_count=0),
            SearchRound(radius_m=3000, discovered_count=4, eligible_count=1),
        ),
        "exclusions": ExclusionCounts(tag_mismatch=3),
        "quality_pool_count": 1,
        "ranked": (ranked(),),
    }
    payload.update(overrides)
    return RestaurantRecommendResponse.model_validate(payload)


def test_v2_request_accepts_only_user_owned_intent_history() -> None:
    request = RestaurantRecommendRequest(
        latitude=24.48,
        longitude=118.09,
        locale="zh-CN",
        profile=RestaurantProfile(
            selected_tags=("japanese", "barbecue"),
            budget_minor=5000,
            budget_is_explicit=True,
            currency="CNY",
        ),
        recent_intents=(
            AcceptedIntent(
                occurred_at=datetime(2026, 7, 19, tzinfo=UTC),
                selected_tags=("japanese",),
                budget_band_minor=5000,
            ),
        ),
    )
    assert request.schema_version == "restaurant-request.v2"
    assert not hasattr(request, "history")


def test_v2_request_rejects_provider_fields_inside_history() -> None:
    payload = {
        "schema_version": "restaurant-request.v2",
        "latitude": 24.48,
        "longitude": 118.09,
        "profile": {},
        "recent_intents": [
            {
                "occurred_at": "2026-07-19T00:00:00Z",
                "selected_tags": ["japanese"],
                "restaurant_name": "x",
            }
        ],
    }
    with pytest.raises(ValidationError):
        RestaurantRecommendRequest.model_validate(payload)


def test_intent_timestamp_must_be_timezone_aware() -> None:
    with pytest.raises(ValidationError):
        AcceptedIntent(
            occurred_at=datetime(2026, 7, 19),
            selected_tags=("japanese",),
        )


def test_profile_defaults_are_one_tap_safe() -> None:
    profile = RestaurantProfile()
    assert profile.selected_tags == ()
    assert profile.budget_is_explicit is False


def test_profile_rejects_explicit_budget_without_value() -> None:
    with pytest.raises(ValidationError):
        RestaurantProfile(budget_is_explicit=True)


def test_profile_rejects_duplicate_or_unknown_tags() -> None:
    with pytest.raises(ValidationError):
        RestaurantProfile(selected_tags=("japanese", "japanese"))
    with pytest.raises(ValidationError):
        RestaurantProfile(selected_tags=("unknown",))


def test_amap_candidate_is_active_only_and_navigation_is_https() -> None:
    assert candidate().persistence == "active_only"
    payload = candidate().model_dump()
    payload["navigation_url"] = "http://example.com"
    with pytest.raises(ValidationError):
        RestaurantCandidate.model_validate(payload)


def test_response_accepts_ordered_v2_contract() -> None:
    value = response()
    assert value.schema_version == "restaurant-recommendation.v2"
    assert value.active_radius_m == 3000
    assert value.ranked[0].matched_tags == ("minnan_fujian",)


@pytest.mark.parametrize(
    "rounds",
    [
        (SearchRound(radius_m=3000, discovered_count=1, eligible_count=1),),
        (
            SearchRound(radius_m=2000, discovered_count=1, eligible_count=0),
            SearchRound(radius_m=5000, discovered_count=1, eligible_count=1),
        ),
    ],
)
def test_response_rejects_non_prefix_search_rounds(rounds: tuple[SearchRound, ...]) -> None:
    with pytest.raises(ValidationError):
        response(search_rounds=rounds, active_radius_m=rounds[-1].radius_m)


def test_response_rejects_duplicate_candidates_and_pool_mismatch() -> None:
    duplicate = ranked()
    with pytest.raises(ValidationError):
        response(ranked=(duplicate, duplicate), quality_pool_count=2)
    with pytest.raises(ValidationError):
        response(quality_pool_count=2)


def test_stretch_overage_is_present_if_and_only_if_stretch() -> None:
    with pytest.raises(ValidationError):
        ranked(budget_state="stretch")
    with pytest.raises(ValidationError):
        ranked(budget_state="within", overage=800)


def test_unknown_budget_cannot_claim_a_budget_match() -> None:
    payload = ranked().model_dump()
    payload["budget_state"] = "unknown"
    payload["reason_codes"] = ["within_budget"]
    with pytest.raises(ValidationError):
        RankedRestaurant.model_validate(payload)
