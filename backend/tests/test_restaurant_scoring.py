from datetime import UTC, datetime, timedelta
from random import Random

from onedish_api.restaurant_domain import (
    AcceptedIntent,
    RankedRestaurant,
    RestaurantCandidate,
    RestaurantEvidence,
    RestaurantProfile,
    RestaurantRecommendRequest,
)
from onedish_api.restaurants.scoring import (
    build_quality_pool,
    eligible_candidates,
    recent_tag_counts,
    score_candidate,
    score_restaurants,
    weighted_permutation,
)


NOW = datetime(2026, 7, 20, 12, tzinfo=UTC)


def candidate(
    identifier: str,
    *,
    distance: int = 1000,
    tags: tuple[str, ...] = ("japanese",),
    cost: int | None = 4000,
    rating: float | None = 4.0,
    state: str = "open",
    currency: str | None = None,
    cost_evidence: bool | None = None,
) -> RestaurantCandidate:
    return RestaurantCandidate(
        id=f"overture:{identifier}",
        name=identifier,
        category="restaurant",
        intent_tags=tags,
        distance_m=distance,
        rating=rating,
        average_cost_minor=cost,
        currency=currency if currency is not None else ("CNY" if cost is not None else None),
        open_state=state,
        navigation_url="https://www.openstreetmap.org/",
        source_kind="overture_place",
        attribution="Overture",
        persistence="licensed_open_data",
        evidence=RestaurantEvidence(
            distance=True,
            rating=rating is not None,
            average_cost=cost is not None if cost_evidence is None else cost_evidence,
            category=True,
            open_state=state != "unknown",
        ),
    )


def request(
    *,
    selected_tags: tuple[str, ...] = (),
    budget: int | None = None,
    budget_is_explicit: bool = False,
    recent_intents: tuple[AcceptedIntent, ...] = (),
) -> RestaurantRecommendRequest:
    return RestaurantRecommendRequest(
        latitude=24.48,
        longitude=118.09,
        profile=RestaurantProfile(
            selected_tags=selected_tags,
            budget_minor=budget,
            budget_is_explicit=budget_is_explicit,
        ),
        recent_intents=recent_intents,
    )


def scored(*scores: float, states: tuple[str, ...] | None = None) -> tuple[RankedRestaurant, ...]:
    budget_states = states or tuple("not_requested" for _ in scores)
    return tuple(
        RankedRestaurant(
            candidate=candidate(str(index)),
            score=score,
            matched_tags=(),
            budget_state=budget_states[index],
            budget_overage_minor=100 if budget_states[index] == "stretch" else None,
            reason_codes=(
                ("budget_unknown",)
                if budget_states[index] == "unknown"
                else ("budget_stretch",)
                if budget_states[index] == "stretch"
                else ("within_budget",)
                if budget_states[index] == "within"
                else ()
            ),
        )
        for index, score in enumerate(scores)
    )


def test_eligibility_enforces_closed_radius_tag_and_excessive_budget() -> None:
    result = eligible_candidates(
        (
            candidate("closed", state="closed"),
            candidate("far", distance=2100),
            candidate("wrong", tags=("western",)),
            candidate("expensive", cost=7000),
            candidate("match", cost=6000),
        ),
        request(selected_tags=("japanese",), budget=5000, budget_is_explicit=True),
        radius_m=2000,
    )
    assert [item.name for item in result.eligible] == ["match"]
    assert result.exclusions.model_dump() == {
        "closed": 1,
        "outside_radius": 1,
        "tag_mismatch": 1,
        "excessive_budget": 1,
    }


def test_explicit_tag_never_falls_back_to_an_unrelated_candidate() -> None:
    result = eligible_candidates(
        (candidate("western", tags=("western",)),),
        request(selected_tags=("japanese",)),
        radius_m=2000,
    )
    assert result.eligible == ()


def test_missing_rating_uses_the_fixed_neutral_signal() -> None:
    current = request(selected_tags=("japanese",))
    missing = score_candidate(candidate("missing", rating=None), current, radius_m=2000)
    rated = score_candidate(candidate("rated", rating=4.0), current, radius_m=2000)
    assert missing.score == 50.0
    assert rated.score == 66.5


def test_explicit_tags_disable_history_diversity_for_the_current_choice() -> None:
    current = request(selected_tags=("japanese",))
    low = score_candidate(
        candidate("low"), current, radius_m=2000, recent_counts={"japanese": 0}
    )
    frequent = score_candidate(
        candidate("frequent"), current, radius_m=2000, recent_counts={"japanese": 20}
    )
    assert low.score == frequent.score
    assert "intent_diversity" not in frequent.reason_codes


def test_recent_intents_apply_only_inside_the_fourteen_day_window() -> None:
    counts = recent_tag_counts(
        (
            AcceptedIntent(
                occurred_at=NOW - timedelta(days=2),
                selected_tags=("japanese",),
            ),
            AcceptedIntent(
                occurred_at=NOW - timedelta(days=15),
                selected_tags=("japanese",),
            ),
        ),
        NOW,
    )
    assert counts == {"japanese": 1}


def test_unknown_or_currency_mismatched_cost_is_penalized_and_never_claims_match() -> None:
    current = request(budget=5000, budget_is_explicit=True)
    unknown = score_candidate(candidate("unknown", cost=None), current, radius_m=2000)
    mismatch = score_candidate(
        candidate("usd", cost=4000, currency="USD"), current, radius_m=2000
    )
    assert unknown.budget_state == mismatch.budget_state == "unknown"
    assert unknown.score == mismatch.score
    assert unknown.reason_codes == ("budget_unknown", "nearby")


def test_stretch_candidate_can_win_only_by_overcoming_penalty() -> None:
    result = score_restaurants(
        (
            candidate("within", distance=1500, rating=3.0, cost=5000),
            candidate("stretch", distance=100, rating=4.8, cost=6000),
        ),
        request(budget=5000, budget_is_explicit=True),
        radius_m=2000,
        now=NOW,
    )
    assert result.ranked[0].candidate.name == "stretch"
    assert result.ranked[0].budget_state == "stretch"
    assert result.ranked[0].budget_overage_minor == 1000


def test_quality_pool_uses_eight_point_band_and_five_item_cap() -> None:
    pool = build_quality_pool(scored(90, 86, 82, 81, 80, 79))
    assert [item.score for item in pool] == [90, 86, 82]


def test_unknown_price_enters_pool_only_below_three_known_candidates() -> None:
    enough_known = build_quality_pool(
        scored(90, 89, 88, 87, states=("within", "stretch", "within", "unknown")),
        budget_is_explicit=True,
    )
    sparse_known = build_quality_pool(
        scored(90, 89, 88, states=("within", "unknown", "unknown")),
        budget_is_explicit=True,
    )
    assert all(item.budget_state != "unknown" for item in enough_known)
    assert any(item.budget_state == "unknown" for item in sparse_known)


def test_sparse_known_price_candidates_cannot_be_displaced_by_unknowns() -> None:
    pool = build_quality_pool(
        scored(
            90,
            89,
            88,
            87,
            86,
            85,
            states=("unknown", "unknown", "unknown", "unknown", "within", "stretch"),
        ),
        budget_is_explicit=True,
    )
    assert [item.budget_state for item in pool[:2]] == ["within", "stretch"]
    assert len(pool) == 5


def test_random_order_is_seeded_varied_and_without_replacement() -> None:
    pool = scored(90, 88, 86)
    first = weighted_permutation(pool, Random(7))
    second = weighted_permutation(pool, Random(7))
    assert [item.candidate.id for item in first] == [item.candidate.id for item in second]
    assert len({item.candidate.id for item in first}) == len(first)
    winners = {
        weighted_permutation(pool, Random(seed))[0].candidate.id for seed in range(20)
    }
    assert len(winners) > 1
