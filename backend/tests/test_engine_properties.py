import json
from datetime import datetime, timezone
from pathlib import Path

from onedish_api.catalog import load_catalog
from onedish_api.domain import Candidate, DailyContextEntry, MealConstraints, NutritionRange, Place
from onedish_api.context import derive_meal_context
from onedish_api.engine import load_decision_rules, recommend
from onedish_api.history import PreferenceWeights, RepetitionProfile


ROOT = Path(__file__).parents[2]
RULES = load_decision_rules(ROOT / "data/decision.v2.json")


def test_full_catalog_produces_monotonic_90_to_1_decision() -> None:
    catalog = load_catalog(ROOT / "data/catalog.v1.json", asset_root=ROOT / "web/public")
    places_raw = json.loads((ROOT / "data/places.v1.json").read_text())["places"]
    place_by_restaurant = {
        place["id"].removeprefix("fixture-"): Place.model_validate(place)
        for place in places_raw
    }
    candidates = [
        Candidate(dish=dish, place=place_by_restaurant[dish.restaurant_id])
        for dish in catalog.dishes
    ]
    entry = DailyContextEntry.model_validate(
        json.loads((ROOT / "data/context.v1.json").read_text())["entry"]
    )
    context = derive_meal_context(entry, [], now=datetime(2026, 7, 18, 12, tzinfo=timezone.utc), timezone_name="UTC")
    decision = recommend(
        candidates,
        context,
        MealConstraints(
            max_price_minor=1750,
            energy_range_kcal=NutritionRange(min=500, max=720),
            minimum_protein_g=20,
            excluded_allergens=("peanuts",),
            desired_taste_tags=("warm", "filling"),
        ),
        RepetitionProfile(base_ingredients={"noodles": 2}),
        PreferenceWeights(),
        catalog_version=catalog.version,
        created_at=datetime(2026, 7, 18, 12, tzinfo=timezone.utc),
        rules=RULES,
    )
    counts = {stage.id: stage.survivor_count for stage in decision.stages}
    assert counts["found"] == 90
    assert counts["available"] >= 70
    assert counts["safety"] >= 25
    assert counts["nutrition"] >= 10
    assert counts["repetition"] >= 4
    assert counts["repetition"] < counts["nutrition"]
    assert counts["taste"] >= 2
    assert counts["winner"] == 1
    assert all(a >= b for a, b in zip(counts.values(), list(counts.values())[1:]))
    assert list(counts) == [
        "found", "available", "safety", "nutrition", "repetition",
        "taste", "duration", "budget", "winner",
    ]
    assert decision.winner_id == "ember-bowl-charred-chicken-rice"
