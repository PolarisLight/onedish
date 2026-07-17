from datetime import datetime, timedelta, timezone

from onedish_api.domain import MealHistoryEvent
from onedish_api.history import preference_weights, recent_repetition


NOW = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)


def rejection(event_id: str, days_ago: int, reason: str = "not_craving") -> MealHistoryEvent:
    return MealHistoryEvent(
        id=event_id,
        occurred_at=NOW - timedelta(days=days_ago),
        kind="rejected",
        dish_id="ember-bowl-crisp-herb-salad",
        cuisine_tags=("mediterranean",),
        taste_tags=("cold", "light"),
        base_ingredient="greens",
        rejection_reason=reason,  # type: ignore[arg-type]
    )


def test_repetition_uses_rolling_seven_day_window() -> None:
    events = [
        MealHistoryEvent(
            id="recent",
            occurred_at=NOW - timedelta(days=2),
            kind="eaten",
            dish_id="night-market-fire-noodle-cup",
            cuisine_tags=("asian",),
            taste_tags=("warm",),
            base_ingredient="noodles",
        ),
        MealHistoryEvent(
            id="old",
            occurred_at=NOW - timedelta(days=8),
            kind="eaten",
            dish_id="night-market-fire-noodle-cup",
            cuisine_tags=("asian",),
            taste_tags=("warm",),
            base_ingredient="noodles",
        ),
    ]
    profile = recent_repetition(events, NOW, "UTC")
    assert profile.base_ingredients == {"noodles": 1}
    assert profile.dish_ids == {"night-market-fire-noodle-cup": 1}


def test_one_rejection_does_not_create_stable_penalty() -> None:
    weights = preference_weights([rejection("reject-1", 1)], NOW)
    assert weights.taste == {}


def test_three_rejections_create_bounded_decayed_penalty() -> None:
    weights = preference_weights(
        [rejection("reject-1", 1), rejection("reject-2", 2), rejection("reject-3", 3)], NOW
    )
    assert -0.25 <= weights.taste["cold"] < 0
    assert -0.25 <= weights.cuisine["mediterranean"] < 0


def test_reset_discards_older_learning() -> None:
    events = [
        rejection("reject-1", 3),
        rejection("reject-2", 2),
        rejection("reject-3", 1),
        MealHistoryEvent(
            id="reset-1", occurred_at=NOW - timedelta(hours=1), kind="reset"
        ),
    ]
    assert preference_weights(events, NOW).taste == {}
