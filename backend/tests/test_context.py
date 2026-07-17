from datetime import datetime, timezone

from onedish_api.context import derive_meal_context
from onedish_api.domain import DailyContextEntry, MealHistoryEvent, NutritionRange


NOW = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)


def event(event_id: str, *, days_ago: int, base: str) -> MealHistoryEvent:
    return MealHistoryEvent(
        id=event_id,
        occurred_at=datetime(2026, 7, 18 - days_ago, 10, 0, tzinfo=timezone.utc),
        kind="eaten",
        dish_id="night-market-fire-noodle-cup",
        cuisine_tags=("asian",),
        taste_tags=("warm", "filling"),
        base_ingredient=base,
    )


def test_manual_context_derives_gap_and_repetition_without_using_sleep_for_targets() -> None:
    entry = DailyContextEntry(
        source="manual",
        protein_consumed_g=72,
        daily_protein_goal_g=110,
        meal_energy_range_kcal=NutritionRange(min=500, max=720),
        sleep_minutes=342,
        comfort_from_sleep_enabled=True,
    )
    context = derive_meal_context(
        entry,
        [event("meal-1", days_ago=1, base="noodles"), event("meal-2", days_ago=2, base="noodles")],
        now=NOW,
        timezone_name="UTC",
    )
    assert context.protein_gap_g == 38
    assert context.energy_range_kcal == NutritionRange(min=500, max=720)
    assert context.recent_categories_to_avoid == ("noodles",)
    assert context.comfort_preference == "warm"
    assert context.context_source == "manual"


def test_missing_values_remain_unavailable_not_zero() -> None:
    context = derive_meal_context(
        DailyContextEntry(source="manual"), [], now=NOW, timezone_name="Asia/Shanghai"
    )
    assert context.protein_gap_g is None
    assert context.energy_range_kcal is None
    assert context.source_freshness == "unavailable"
    assert context.wellness_context_used is False


def test_protein_gap_clamps_at_zero() -> None:
    context = derive_meal_context(
        DailyContextEntry(
            source="synthetic", protein_consumed_g=130, daily_protein_goal_g=110
        ),
        [],
        now=NOW,
        timezone_name="UTC",
    )
    assert context.protein_gap_g == 0
