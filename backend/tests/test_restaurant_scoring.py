import pytest

from onedish_api.restaurant_domain import (
    RestaurantCandidate,
    RestaurantEvidence,
    RestaurantHistorySummary,
    RestaurantProfile,
    RestaurantRecommendRequest,
)
from onedish_api.restaurants.scoring import recommendation_mode, score_restaurants


def candidate(
    identifier: str,
    *,
    distance: int,
    cuisine: str = "fujian",
    cost: int | None = 5000,
    rating: float | None = None,
    confidence: float = 0.8,
    state: str = "unknown",
    currency: str | None = None,
    cost_evidence: bool | None = None,
) -> RestaurantCandidate:
    return RestaurantCandidate(
        id=f"overture:{identifier}",
        name=identifier,
        category="restaurant",
        cuisine_tags=(cuisine,),
        distance_m=distance,
        rating=rating,
        average_cost_minor=cost,
        currency=currency if currency is not None else ("CNY" if cost is not None else None),
        open_state=state,
        navigation_url="https://www.openstreetmap.org/",
        source_kind="overture_place",
        attribution="Overture",
        confidence=confidence,
        persistence="licensed_open_data",
        evidence=RestaurantEvidence(
            distance=True,
            rating=rating is not None,
            average_cost=cost is not None if cost_evidence is None else cost_evidence,
            category=True,
        ),
    )


def request(
    *,
    history: RestaurantHistorySummary | None = None,
    **profile,
) -> RestaurantRecommendRequest:
    return RestaurantRecommendRequest(
        latitude=24.48,
        longitude=118.09,
        meal_period="lunch",
        profile=RestaurantProfile(**profile),
        history=history or RestaurantHistorySummary(),
    )


def test_filters_closed_and_ranks_deterministically() -> None:
    result = score_restaurants(
        (
            candidate("closed", distance=10, state="closed"),
            candidate("far", distance=1200),
            candidate("near", distance=200),
        ),
        request(budget_minor=6000, budget_is_explicit=True),
    )
    assert [item.candidate.name for item in result.ranked] == ["near", "far"]
    assert result.trace[-1].survivor_count == 1
    assert all(
        after.survivor_count <= before.survivor_count
        for before, after in zip(result.trace, result.trace[1:])
    )


def test_relaxes_cuisine_then_budget_when_each_would_empty_results() -> None:
    result = score_restaurants(
        (candidate("only", distance=300, cuisine="fujian", cost=8000),),
        request(
            budget_minor=3000,
            budget_is_explicit=True,
            preferred_cuisines=("sichuan",),
        ),
    )
    assert result.ranked[0].candidate.name == "only"


def test_preferred_cuisine_filters_when_a_match_exists() -> None:
    result = score_restaurants(
        (
            candidate("match", distance=1000, cuisine="sichuan"),
            candidate("other", distance=100, cuisine="fujian"),
        ),
        request(preferred_cuisines=("sichuan",)),
    )
    assert [item.candidate.name for item in result.ranked] == ["match"]
    assert "taste_match" in result.ranked[0].reason_codes
    assert recommendation_mode(request(preferred_cuisines=("sichuan",))) == "personalized"


def test_preferred_cuisine_falls_back_when_no_match_exists() -> None:
    result = score_restaurants(
        (
            candidate("first", distance=100, cuisine="fujian"),
            candidate("second", distance=1000, cuisine="cantonese"),
        ),
        request(preferred_cuisines=("sichuan",)),
    )
    assert {item.candidate.name for item in result.ranked} == {"first", "second"}


def test_explicit_budget_filters_when_eligible_candidates_exist() -> None:
    result = score_restaurants(
        (
            candidate("affordable", distance=1000, cost=5000),
            candidate("unknown", distance=1200, cost=None),
            candidate("expensive", distance=100, cost=9000),
        ),
        request(budget_minor=6000, budget_is_explicit=True),
    )
    assert {item.candidate.name for item in result.ranked} == {"affordable", "unknown"}


def test_explicit_budget_falls_back_when_every_known_cost_is_over_budget() -> None:
    result = score_restaurants(
        (
            candidate("first", distance=100, cost=8000),
            candidate("second", distance=1000, cost=9000),
        ),
        request(budget_minor=6000, budget_is_explicit=True),
    )
    assert {item.candidate.name for item in result.ranked} == {"first", "second"}


def test_currency_mismatched_cost_is_retained_and_neutral() -> None:
    recommendation = request(budget_minor=6000, budget_is_explicit=True)
    result = score_restaurants(
        (
            candidate("affordable", distance=1200, cost=5000),
            candidate("usd", distance=1000, cost=9000, currency="USD"),
        ),
        recommendation,
    )
    neutral = score_restaurants(
        (candidate("unknown", distance=1000, cost=None),), recommendation
    ).ranked[0]
    usd = next(item for item in result.ranked if item.candidate.name == "usd")

    assert {item.candidate.name for item in result.ranked} == {"affordable", "usd"}
    assert usd.score == neutral.score
    assert "budget_match" not in usd.reason_codes


def test_unsupported_cost_evidence_is_retained_and_neutral() -> None:
    recommendation = request(budget_minor=6000, budget_is_explicit=True)
    result = score_restaurants(
        (
            candidate("affordable", distance=1200, cost=5000),
            candidate("unsupported", distance=1000, cost=9000, cost_evidence=False),
        ),
        recommendation,
    )
    neutral = score_restaurants(
        (candidate("unknown", distance=1000, cost=None),), recommendation
    ).ranked[0]
    unsupported = next(item for item in result.ranked if item.candidate.name == "unsupported")

    assert {item.candidate.name for item in result.ranked} == {"affordable", "unsupported"}
    assert unsupported.score == neutral.score
    assert "budget_match" not in unsupported.reason_codes


def test_missing_cost_is_neutral_and_does_not_claim_budget_match() -> None:
    result = score_restaurants(
        (candidate("unknown-cost", distance=300, cost=None),),
        request(budget_minor=3000, budget_is_explicit=True),
    )
    assert "budget_match" not in result.ranked[0].reason_codes
    assert 0 <= result.ranked[0].score <= 100


def test_cold_start_uses_no_false_personalization_and_rating_can_beat_distance() -> None:
    result = score_restaurants(
        (
            candidate("near-low", distance=100, rating=3.0, confidence=0.5),
            candidate("far-high", distance=2400, rating=4.9, confidence=0.5),
        ),
        request(budget_minor=6000),
    )

    assert result.ranked[0].candidate.name == "far-high"
    assert all(
        not ({"budget_match", "taste_match", "history_diversity"} & set(item.reason_codes))
        for item in result.ranked
    )


def test_reasons_are_candidate_specific_and_limited_to_supported_evidence() -> None:
    result = score_restaurants(
        (
            candidate(
                "supported",
                distance=500,
                cuisine="fujian",
                cost=5000,
                rating=4.8,
                confidence=0.9,
            ),
            candidate(
                "unsupported",
                distance=2000,
                cuisine="sichuan",
                cost=None,
                rating=4.0,
                confidence=0.7,
            ),
        ),
        request(
            budget_minor=6000,
            budget_is_explicit=True,
            history=RestaurantHistorySummary(
                recent_cuisines={"sichuan": 2},
                cuisine_preferences={"fujian": 1.0},
            ),
        ),
    )

    by_name = {item.candidate.name: item.reason_codes for item in result.ranked}
    assert by_name["supported"] == ("higher_rating", "budget_match", "taste_match")
    assert by_name["unsupported"] == ()


def test_real_history_can_support_a_diversity_reason() -> None:
    result = score_restaurants(
        (candidate("fresh", distance=1000, cuisine="fujian", confidence=0.5),),
        request(history=RestaurantHistorySummary(recent_cuisines={"sichuan": 2})),
    )
    assert result.ranked[0].reason_codes == ("history_diversity",)


def test_zero_value_history_does_not_activate_personalized_scoring() -> None:
    values = (candidate("only", distance=1500, cost=None, confidence=0.5),)
    empty = request()
    zero_value = request(history=RestaurantHistorySummary(cuisine_preferences={"fujian": 0.0}))

    assert score_restaurants(values, zero_value).ranked[0].score == (
        score_restaurants(values, empty).ranked[0].score
    )
    assert recommendation_mode(zero_value) == "exploration"


def test_available_zero_rating_remains_active_negative_evidence() -> None:
    without_rating = score_restaurants(
        (candidate("missing", distance=3000, rating=None, cost=None, confidence=1.0),),
        request(),
    ).ranked[0]
    with_zero_rating = score_restaurants(
        (candidate("zero", distance=3000, rating=0.0, cost=None, confidence=1.0),),
        request(),
    ).ranked[0]

    assert with_zero_rating.score < without_rating.score


def test_reason_limit_keeps_largest_candidate_specific_contributions() -> None:
    result = score_restaurants(
        (
            candidate(
                "supported",
                distance=500,
                cuisine="fujian",
                cost=5000,
                rating=0.1,
                confidence=0.9,
            ),
            candidate(
                "baseline",
                distance=2500,
                cuisine="fujian",
                cost=None,
                rating=0.0,
                confidence=0.5,
            ),
        ),
        request(
            budget_minor=6000,
            budget_is_explicit=True,
            preferred_cuisines=("fujian",),
            history=RestaurantHistorySummary(recent_cuisines={"sichuan": 2}),
        ),
    )
    supported = next(item for item in result.ranked if item.candidate.name == "supported")
    assert supported.reason_codes == ("budget_match", "taste_match", "history_diversity")


@pytest.mark.parametrize(
    ("profile", "history"),
    [
        ({"budget_minor": 6000, "budget_is_explicit": True}, None),
        ({"preferred_cuisines": ("fujian",)}, None),
        ({}, RestaurantHistorySummary(recent_cuisines={"sichuan": 1})),
        ({}, RestaurantHistorySummary(cuisine_preferences={"fujian": 0.5})),
    ],
)
def test_real_user_signals_enable_personalized_mode(profile, history) -> None:
    assert recommendation_mode(request(history=history, **profile)) == "personalized"
