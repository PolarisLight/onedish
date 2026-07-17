from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from onedish_api.domain import (
    Confidence,
    DecisionRecord,
    Dish,
    EliminationStage,
    NutritionRange,
)


def test_nutrition_range_is_closed_and_nonnegative() -> None:
    assert NutritionRange(min=12, max=18).min == 12
    with pytest.raises(ValidationError):
        NutritionRange(min=18, max=12)
    with pytest.raises(ValidationError):
        NutritionRange(min=-1, max=12)


def test_dish_rejects_unknown_allergen_and_extra_fields() -> None:
    payload = {
        "id": "dish-1",
        "restaurant_id": "restaurant-1",
        "name": "Warm bowl",
        "description": "Rice and vegetables",
        "price_minor": 1299,
        "currency": "USD",
        "energy_kcal": {"min": 500, "max": 620},
        "protein_g": {"min": 25, "max": 32},
        "confidence": Confidence.medium,
        "allergens": ["unknown-dust"],
        "possible_allergens": [],
        "ingredients": ["rice"],
        "cuisine_tags": ["asian"],
        "taste_tags": ["warm"],
        "base_ingredient": "rice",
        "image": "/food/bowl.webp",
        "nutrition_provenance": "estimated_demo",
        "source_kind": "demo_menu",
        "surprise": True,
    }
    with pytest.raises(ValidationError):
        Dish.model_validate(payload)


def test_decision_contract_is_frozen_and_forbids_extra_fields() -> None:
    stage = EliminationStage(
        id="found",
        input_count=2,
        survivor_count=2,
        reason_counts={},
        representative_removed_ids=(),
    )
    decision = DecisionRecord(
        decision_id="decision-1",
        engine_version="engine.v1",
        catalog_version="catalog.v1",
        input_sha256="a" * 64,
        created_at=datetime(2026, 7, 18, tzinfo=timezone.utc),
        stages=(stage,),
        winner_id="dish-1",
        reserve_id="dish-2",
    )
    with pytest.raises(ValidationError):
        decision.winner_id = "dish-2"  # type: ignore[misc]
    with pytest.raises(ValidationError):
        DecisionRecord.model_validate({**decision.model_dump(), "extra": 1})
