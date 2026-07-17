from datetime import datetime, timezone

import pytest

from onedish_api.domain import (
    Candidate,
    Confidence,
    Dish,
    MealConstraints,
    MealContext,
    NutritionRange,
    Place,
)
from onedish_api.engine import NoSafeCandidate, recommend
from onedish_api.history import PreferenceWeights, RepetitionProfile


NOW = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)


def candidate(
    dish_id: str,
    *,
    price: int = 1400,
    energy: tuple[int, int] = (500, 650),
    protein: tuple[int, int] = (40, 50),
    tastes: tuple[str, ...] = ("warm", "filling"),
    allergens: tuple[str, ...] = (),
    possible: tuple[str, ...] = (),
    base: str = "rice",
    open_state: str = "open",
    destination: str | None = "https://example.com/search",
    distance: int = 900,
    confidence: Confidence = Confidence.medium,
) -> Candidate:
    return Candidate(
        dish=Dish(
            id=dish_id,
            restaurant_id="restaurant-1",
            name=dish_id.replace("-", " ").title(),
            description="A reviewed fictional demo meal.",
            price_minor=price,
            currency="USD",
            energy_kcal=NutritionRange(min=energy[0], max=energy[1]),
            protein_g=NutritionRange(min=protein[0], max=protein[1]),
            confidence=confidence,
            allergens=allergens,  # type: ignore[arg-type]
            possible_allergens=possible,  # type: ignore[arg-type]
            ingredients=(base, "vegetables"),
            cuisine_tags=("asian",),
            taste_tags=tastes,  # type: ignore[arg-type]
            base_ingredient=base,
            image="/food/test.svg",
            nutrition_provenance="estimated_demo",
            source_kind="demo_menu",
        ),
        place=Place(
            id=f"place-{dish_id}",
            name="Restaurant One",
            category="Restaurant",
            distance_m=distance,
            price_tier=2,
            rating=8.5,
            open_state=open_state,  # type: ignore[arg-type]
            order_destination=destination,
            source_kind="fixture_place",
            attribution="OneDish fixture",
        ),
    )


def context() -> MealContext:
    return MealContext(
        protein_gap_g=38,
        energy_range_kcal=NutritionRange(min=500, max=720),
        recent_categories_to_avoid=("noodles",),
        comfort_preference="warm",
        source_freshness="today",
        wellness_context_used=True,
        context_source="synthetic",
    )


def constraints(**changes: object) -> MealConstraints:
    values = {
        "max_price_minor": 1800,
        "energy_range_kcal": NutritionRange(min=500, max=720),
        "minimum_protein_g": 35,
        "excluded_allergens": ("peanuts",),
        "desired_taste_tags": ("warm", "filling"),
    }
    values.update(changes)
    return MealConstraints.model_validate(values)


def test_pipeline_preserves_auditable_stage_counts_and_one_winner() -> None:
    candidates = [
        candidate("warm-winner", distance=600, confidence=Confidence.high),
        candidate("warm-reserve", distance=900),
        candidate("closed-dish", open_state="closed"),
        candidate("unsafe-dish", allergens=("peanuts",)),
        candidate("uncertain-unsafe", possible=("peanuts",)),
        candidate("expensive-dish", price=2200),
        candidate("low-protein", protein=(20, 30)),
        candidate("recent-noodles", base="noodles"),
        candidate("cold-salad", tastes=("cold", "light"), distance=300),
    ]
    decision = recommend(
        candidates,
        context(),
        constraints(),
        RepetitionProfile(),
        PreferenceWeights(),
        catalog_version="catalog.v1",
        created_at=NOW,
    )
    assert [stage.id for stage in decision.stages] == [
        "found", "available", "safety_budget", "nutrition", "repetition",
        "taste_confidence", "winner",
    ]
    counts = [stage.survivor_count for stage in decision.stages]
    assert counts == sorted(counts, reverse=True)
    assert decision.winner_id == "warm-winner"
    assert decision.reserve_id == "warm-reserve"
    assert decision.stages[-1].survivor_count == 1
    assert decision.stages[2].reason_counts["allergen_excluded"] == 2


def test_allergens_are_never_relaxed() -> None:
    with pytest.raises(NoSafeCandidate) as error:
        recommend(
            [candidate("unsafe", allergens=("peanuts",))],
            context(),
            constraints(allowed_relaxations=("energy_range", "protein_floor", "recent_repetition")),
            RepetitionProfile(),
            PreferenceWeights(),
            catalog_version="catalog.v1",
            created_at=NOW,
        )
    assert error.value.reason_counts["allergen_excluded"] == 1


def test_input_order_does_not_change_canonical_decision() -> None:
    first = candidate("alpha", distance=500)
    second = candidate("beta", distance=700)
    arguments = (context(), constraints(), RepetitionProfile(), PreferenceWeights())
    left = recommend([first, second], *arguments, catalog_version="catalog.v1", created_at=NOW)
    right = recommend([second, first], *arguments, catalog_version="catalog.v1", created_at=NOW)
    assert left.model_dump_json() == right.model_dump_json()


def test_soft_protein_floor_relaxes_only_when_explicitly_allowed() -> None:
    dish = candidate("lower-protein", protein=(24, 30))
    with pytest.raises(NoSafeCandidate):
        recommend(
            [dish], context(), constraints(), RepetitionProfile(), PreferenceWeights(),
            catalog_version="catalog.v1", created_at=NOW,
        )
    decision = recommend(
        [dish],
        context(),
        constraints(allowed_relaxations=("protein_floor",)),
        RepetitionProfile(),
        PreferenceWeights(),
        catalog_version="catalog.v1",
        created_at=NOW,
    )
    assert decision.relaxations == ("protein_floor",)
