"""Pure projections over local OneDish meal history."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from math import exp
from typing import Iterable, Sequence
from zoneinfo import ZoneInfo

from onedish_api.domain import MealHistoryEvent


@dataclass(frozen=True)
class RepetitionProfile:
    dish_ids: dict[str, int] = field(default_factory=dict)
    cuisines: dict[str, int] = field(default_factory=dict)
    base_ingredients: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class PreferenceWeights:
    cuisine: dict[str, float] = field(default_factory=dict)
    taste: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class HistoryProjection:
    events: tuple[MealHistoryEvent, ...]
    repetition: RepetitionProfile
    preferences: PreferenceWeights


def _after_latest_reset(events: Iterable[MealHistoryEvent]) -> list[MealHistoryEvent]:
    ordered = sorted(events, key=lambda item: (item.occurred_at, item.id))
    resets = [event.occurred_at for event in ordered if event.kind == "reset"]
    cutoff = max(resets) if resets else None
    return [event for event in ordered if cutoff is None or event.occurred_at > cutoff]


def recent_repetition(
    events: Sequence[MealHistoryEvent],
    now: datetime,
    timezone_name: str,
    days: int = 7,
) -> RepetitionProfile:
    zone = ZoneInfo(timezone_name)
    local_now = now.astimezone(zone)
    cutoff_date = local_now.date() - timedelta(days=days)
    relevant = [
        event
        for event in _after_latest_reset(events)
        if event.kind == "eaten" and cutoff_date < event.occurred_at.astimezone(zone).date() <= local_now.date()
    ]
    dishes = Counter(event.dish_id for event in relevant if event.dish_id)
    cuisines = Counter(tag for event in relevant for tag in event.cuisine_tags)
    bases = Counter(event.base_ingredient for event in relevant if event.base_ingredient)
    return RepetitionProfile(dict(dishes), dict(cuisines), dict(bases))


def preference_weights(
    events: Sequence[MealHistoryEvent], now: datetime
) -> PreferenceWeights:
    rejections = [event for event in _after_latest_reset(events) if event.kind == "rejected"]
    cuisine_observations: dict[str, list[float]] = defaultdict(list)
    taste_observations: dict[str, list[float]] = defaultdict(list)
    for event in rejections:
        age_days = max(0.0, (now - event.occurred_at).total_seconds() / 86_400)
        contribution = 0.1 * exp(-age_days / 30)
        for tag in event.cuisine_tags:
            cuisine_observations[tag].append(contribution)
        for tag in event.taste_tags:
            taste_observations[tag].append(contribution)

    def stable(groups: dict[str, list[float]]) -> dict[str, float]:
        return {
            key: round(-min(0.25, sum(values)), 4)
            for key, values in groups.items()
            if len(values) >= 3
        }

    return PreferenceWeights(cuisine=stable(cuisine_observations), taste=stable(taste_observations))


def apply_event(
    state: HistoryProjection,
    event: MealHistoryEvent,
    *,
    now: datetime,
    timezone_name: str,
) -> HistoryProjection:
    events = (*state.events, event)
    return HistoryProjection(
        events=events,
        repetition=recent_repetition(events, now, timezone_name),
        preferences=preference_weights(events, now),
    )
