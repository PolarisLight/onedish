import pytest
from pydantic import ValidationError

from onedish_api.restaurant_domain import (
    RestaurantCandidate,
    RestaurantEvidence,
    RestaurantHistorySummary,
    RestaurantProfile,
    RestaurantRecommendRequest,
)


def candidate() -> RestaurantCandidate:
    return RestaurantCandidate(
        id="amap:B0TEST",
        name="沙茶里",
        category="闽南菜",
        cuisine_tags=("fujian",),
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
            menu=False,
        ),
    )


def test_request_rejects_unknown_profile_fields() -> None:
    with pytest.raises(ValidationError):
        RestaurantRecommendRequest(
            latitude=24.4798,
            longitude=118.0894,
            locale="zh-CN",
            meal_period="lunch",
            profile={"budget_minor": 6000, "weight": 70},
        )


def test_amap_candidate_is_explicitly_active_only() -> None:
    value = candidate()
    assert value.persistence == "active_only"
    assert value.id.startswith("amap:")


def test_profile_defaults_are_one_tap_safe() -> None:
    profile = RestaurantProfile()
    assert profile.max_distance_m == 3000
    assert profile.preferred_cuisines == ()


def test_profile_budget_is_not_explicit_by_default() -> None:
    profile = RestaurantProfile(budget_minor=6000)
    assert profile.budget_is_explicit is False


def test_profile_accepts_an_explicit_budget_signal() -> None:
    profile = RestaurantProfile(budget_minor=6000, budget_is_explicit=True)
    assert profile.budget_is_explicit is True


def test_profile_rejects_explicit_budget_without_value() -> None:
    with pytest.raises(ValidationError):
        RestaurantProfile(budget_is_explicit=True)


@pytest.mark.parametrize("value", [-1, 1001])
def test_history_rejects_out_of_range_recent_cuisine_counts(value) -> None:
    with pytest.raises(ValidationError):
        RestaurantHistorySummary(recent_cuisines={"fujian": value})


@pytest.mark.parametrize("value", [-0.1, 1.1, float("nan"), float("inf"), float("-inf")])
def test_history_rejects_invalid_cuisine_preferences(value) -> None:
    with pytest.raises(ValidationError):
        RestaurantHistorySummary(cuisine_preferences={"fujian": value})


def test_profile_rejects_unknown_or_taste_signal_cuisines() -> None:
    for value in ("unknown", "spicy", "warm", "fresh"):
        with pytest.raises(ValidationError):
            RestaurantProfile(preferred_cuisines=(value,))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("recent_cuisines", 1),
        ("cuisine_preferences", 0.5),
    ],
)
@pytest.mark.parametrize("cuisine", ["unknown", "spicy", "warm", "fresh"])
def test_history_rejects_unknown_or_taste_signal_cuisines(
    field: str, value: int | float, cuisine: str
) -> None:
    with pytest.raises(ValidationError):
        RestaurantHistorySummary.model_validate({field: {cuisine: value}})
