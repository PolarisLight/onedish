"""Derive the minimal recommendation context from explicit daily entries."""

from __future__ import annotations

from datetime import datetime
from typing import Sequence

from onedish_api.domain import (
    DailyContextEntry,
    MealContext,
    MealHistoryEvent,
    NutritionRange,
)
from onedish_api.history import recent_repetition


def derive_meal_context(
    entry: DailyContextEntry,
    history: Sequence[MealHistoryEvent],
    *,
    now: datetime,
    timezone_name: str,
) -> MealContext:
    protein_gap = None
    if entry.protein_consumed_g is not None and entry.daily_protein_goal_g is not None:
        protein_gap = max(0, entry.daily_protein_goal_g - entry.protein_consumed_g)

    energy_range = entry.meal_energy_range_kcal
    if (
        energy_range is None
        and entry.energy_consumed_kcal is not None
        and entry.daily_energy_goal_kcal is not None
    ):
        remaining = max(0, entry.daily_energy_goal_kcal - entry.energy_consumed_kcal)
        if remaining:
            energy_range = NutritionRange(
                min=max(250, min(1_000, round(remaining * 0.7))),
                max=max(300, min(1_200, remaining)),
            )

    repetition = recent_repetition(history, now, timezone_name)
    recent_to_avoid = tuple(
        key for key, count in sorted(repetition.base_ingredients.items()) if count >= 2
    )
    comfort = (
        "warm"
        if entry.comfort_from_sleep_enabled
        and entry.sleep_minutes is not None
        and entry.sleep_minutes < 360
        else None
    )
    used = any(
        value is not None
        for value in (
            entry.energy_consumed_kcal,
            entry.protein_consumed_g,
            entry.daily_energy_goal_kcal,
            entry.daily_protein_goal_g,
            entry.meal_energy_range_kcal,
            entry.sleep_minutes,
        )
    )
    return MealContext(
        protein_gap_g=protein_gap,
        energy_range_kcal=energy_range,
        recent_categories_to_avoid=recent_to_avoid,
        comfort_preference=comfort,
        source_freshness="today" if used else "unavailable",
        wellness_context_used=used,
        context_source=entry.source if used else "none",
    )
