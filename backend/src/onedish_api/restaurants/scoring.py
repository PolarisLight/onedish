"""Deterministic, evidence-bounded restaurant scoring."""

from __future__ import annotations

from statistics import median
from typing import NamedTuple

from onedish_api.restaurant_domain import (
    RecommendationMode,
    RankedRestaurant,
    RestaurantCandidate,
    RestaurantReasonCode,
    RestaurantRecommendRequest,
    RestaurantTraceStage,
)


WEIGHTS = {
    "rating": 40.0,
    "budget": 25.0,
    "taste": 25.0,
    "history": 15.0,
    "confidence": 10.0,
    "distance": 10.0,
}


class ScoringResult(NamedTuple):
    ranked: tuple[RankedRestaurant, ...]
    trace: tuple[RestaurantTraceStage, ...]


def recommendation_mode(request: RestaurantRecommendRequest) -> RecommendationMode:
    has_signal = (
        request.profile.budget_is_explicit
        or bool(request.profile.preferred_cuisines)
        or any(count > 0 for count in request.history.recent_cuisines.values())
        or any(value != 0 for value in request.history.cuisine_preferences.values())
    )
    return "personalized" if has_signal else "exploration"


def _comparable_cost(
    candidate: RestaurantCandidate, request: RestaurantRecommendRequest
) -> int | None:
    if (
        candidate.evidence.average_cost
        and candidate.average_cost_minor is not None
        and candidate.currency == request.profile.currency
    ):
        return candidate.average_cost_minor
    return None


def _taste_signal(
    candidate: RestaurantCandidate, request: RestaurantRecommendRequest
) -> float | None:
    preferred = set(request.profile.preferred_cuisines)
    learned = request.history.cuisine_preferences
    has_learned_preference = any(value != 0 for value in learned.values())
    if not candidate.cuisine_tags or (not preferred and not has_learned_preference):
        return None
    explicit_match = 1.0 if preferred & set(candidate.cuisine_tags) else 0.0
    learned_match = max(
        (learned.get(tag, 0.0) for tag in candidate.cuisine_tags),
        default=0.0,
    )
    return max(0.0, min(1.0, max(explicit_match, learned_match)))


def _has_taste_match(candidate: RestaurantCandidate, request: RestaurantRecommendRequest) -> bool:
    tags = set(candidate.cuisine_tags)
    return bool(tags & set(request.profile.preferred_cuisines)) or any(
        request.history.cuisine_preferences.get(tag, 0.0) > 0 for tag in tags
    )


def _score(
    candidate: RestaurantCandidate,
    request: RestaurantRecommendRequest,
    *,
    median_rating: float | None,
    median_distance: float,
) -> RankedRestaurant:
    signals: dict[str, float] = {"confidence": candidate.confidence}
    if candidate.evidence.distance:
        signals["distance"] = max(0.0, 1 - candidate.distance_m / 3000)
    if candidate.evidence.rating and candidate.rating is not None:
        signals["rating"] = min(1.0, candidate.rating / 5)
    comparable_cost = _comparable_cost(candidate, request)
    if request.profile.budget_is_explicit and comparable_cost is not None:
        assert request.profile.budget_minor is not None
        budget = request.profile.budget_minor
        cost = comparable_cost
        signals["budget"] = 1.0 if cost <= budget else max(0.0, 1 - (cost - budget) / budget)
    taste = _taste_signal(candidate, request)
    if taste is not None:
        signals["taste"] = taste
    has_recent_history = any(count > 0 for count in request.history.recent_cuisines.values())
    if candidate.cuisine_tags and has_recent_history:
        recent = sum(request.history.recent_cuisines.get(tag, 0) for tag in candidate.cuisine_tags)
        signals["history"] = 1 / (1 + recent)
    denominator = sum(WEIGHTS[key] for key in signals)
    value = sum(WEIGHTS[key] * signal for key, signal in signals.items()) / denominator * 100
    reasons: list[tuple[RestaurantReasonCode, float]] = []
    if (
        median_rating is not None
        and candidate.rating is not None
        and candidate.evidence.rating
        and candidate.rating > median_rating
    ):
        reasons.append(("higher_rating", WEIGHTS["rating"] * signals["rating"]))
    if "budget" in signals and signals["budget"] == 1:
        reasons.append(("budget_match", WEIGHTS["budget"] * signals["budget"]))
    if _has_taste_match(candidate, request):
        reasons.append(("taste_match", WEIGHTS["taste"] * signals["taste"]))
    if has_recent_history and signals.get("history") == 1:
        reasons.append(("history_diversity", WEIGHTS["history"] * signals["history"]))
    if candidate.evidence.distance and candidate.distance_m < median_distance:
        reasons.append(("closer_than_typical", WEIGHTS["distance"] * signals["distance"]))
    if candidate.confidence >= 0.8:
        reasons.append(("high_confidence", WEIGHTS["confidence"] * signals["confidence"]))
    reasons.sort(key=lambda item: (-item[1], item[0]))
    return RankedRestaurant(
        candidate=candidate,
        score=round(value, 4),
        reason_codes=tuple(reason for reason, _contribution in reasons[:3]),
    )


def score_restaurants(
    candidates: tuple[RestaurantCandidate, ...], request: RestaurantRecommendRequest
) -> ScoringResult:
    active = tuple(
        item
        for item in candidates
        if item.open_state != "closed" and item.distance_m <= request.profile.max_distance_m
    )
    eligible = active
    if request.profile.preferred_cuisines:
        preferred = set(request.profile.preferred_cuisines)
        cuisine_matches = tuple(item for item in eligible if preferred & set(item.cuisine_tags))
        if cuisine_matches:
            eligible = cuisine_matches
    if request.profile.budget_is_explicit:
        assert request.profile.budget_minor is not None
        budget_matches = tuple(
            item
            for item in eligible
            if (comparable_cost := _comparable_cost(item, request)) is None
            or comparable_cost <= request.profile.budget_minor
        )
        if budget_matches:
            eligible = budget_matches
    ratings = tuple(
        item.rating for item in eligible if item.evidence.rating and item.rating is not None
    )
    median_rating = median(ratings) if ratings else None
    median_distance = median(item.distance_m for item in eligible) if eligible else 0
    ranked = tuple(
        sorted(
            (
                _score(
                    item,
                    request,
                    median_rating=median_rating,
                    median_distance=median_distance,
                )
                for item in eligible
            ),
            key=lambda item: (-item.score, item.candidate.distance_m, item.candidate.id),
        )
    )
    habits_count = min(len(ranked), 10)
    trace = (
        RestaurantTraceStage(id="nearby", input_count=len(candidates), survivor_count=len(active)),
        RestaurantTraceStage(id="constraints", input_count=len(active), survivor_count=len(ranked)),
        RestaurantTraceStage(id="habits", input_count=len(ranked), survivor_count=habits_count),
        RestaurantTraceStage(
            id="winner", input_count=habits_count, survivor_count=1 if ranked else 0
        ),
    )
    return ScoringResult(ranked=ranked, trace=trace)
