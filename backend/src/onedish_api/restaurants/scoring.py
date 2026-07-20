"""Pure evidence-bounded restaurant eligibility, scoring, and variety."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from random import Random
from statistics import median

from onedish_api.restaurant_domain import (
    BudgetState,
    ExclusionCounts,
    RankedRestaurant,
    RestaurantCandidate,
    RestaurantReasonCode,
    RestaurantRecommendRequest,
)
from onedish_api.restaurants.budget import BudgetAssessment, budget_assessment


@dataclass(frozen=True)
class EligibilityResult:
    eligible: tuple[RestaurantCandidate, ...]
    exclusions: ExclusionCounts


@dataclass(frozen=True)
class ScoringResult:
    ranked: tuple[RankedRestaurant, ...]
    exclusions: ExclusionCounts


def _comparable_cost(
    candidate: RestaurantCandidate,
    request: RestaurantRecommendRequest,
) -> int | None:
    if (
        candidate.evidence.average_cost
        and candidate.average_cost_minor is not None
        and candidate.currency == request.profile.currency
    ):
        return candidate.average_cost_minor
    return None


def _assessment(
    candidate: RestaurantCandidate,
    request: RestaurantRecommendRequest,
) -> BudgetAssessment:
    budget = request.profile.budget_minor if request.profile.budget_is_explicit else None
    return budget_assessment(
        _comparable_cost(candidate, request),
        request.profile.currency,
        budget,
    )


def eligible_candidates(
    candidates: tuple[RestaurantCandidate, ...],
    request: RestaurantRecommendRequest,
    *,
    radius_m: int,
) -> EligibilityResult:
    selected = set(request.profile.selected_tags)
    eligible: list[RestaurantCandidate] = []
    counts = {
        "closed": 0,
        "outside_radius": 0,
        "tag_mismatch": 0,
        "excessive_budget": 0,
    }
    for candidate in candidates:
        if candidate.open_state == "closed":
            counts["closed"] += 1
            continue
        if candidate.distance_m > radius_m:
            counts["outside_radius"] += 1
            continue
        if selected and not (selected & set(candidate.intent_tags)):
            counts["tag_mismatch"] += 1
            continue
        if _assessment(candidate, request).state == "excessive":
            counts["excessive_budget"] += 1
            continue
        eligible.append(candidate)
    return EligibilityResult(
        eligible=tuple(eligible),
        exclusions=ExclusionCounts(**counts),
    )


def recent_tag_counts(
    intents: tuple,
    now: datetime | None = None,
) -> dict[str, int]:
    current = now or datetime.now(UTC)
    cutoff = current - timedelta(days=14)
    counter: Counter[str] = Counter()
    for intent in intents:
        occurred_at = intent.occurred_at.astimezone(UTC)
        if cutoff <= occurred_at <= current:
            counter.update(intent.selected_tags)
    return dict(counter)


def _budget_state(assessment: BudgetAssessment) -> BudgetState:
    if assessment.state == "excessive":
        raise ValueError("excessive budget candidate cannot be scored")
    return assessment.state


def score_candidate(
    candidate: RestaurantCandidate,
    request: RestaurantRecommendRequest,
    *,
    radius_m: int,
    recent_counts: dict[str, int] | None = None,
    median_rating: float | None = None,
) -> RankedRestaurant:
    rating_signal = (
        candidate.rating / 5
        if candidate.evidence.rating and candidate.rating is not None
        else 0.5
    )
    distance_signal = max(0.0, min(1.0, 1 - candidate.distance_m / radius_m))
    counts = recent_counts or {}
    if request.profile.selected_tags:
        diversity_signal = 0.5
    else:
        accepted_count = sum(counts.get(tag, 0) for tag in candidate.intent_tags)
        diversity_signal = 1 / (1 + accepted_count)
    assessment = _assessment(candidate, request)
    score = (
        55 * rating_signal
        + 35 * distance_signal
        + 10 * diversity_signal
        - assessment.penalty
    )

    candidate_tags = set(candidate.intent_tags)
    matched_tags = tuple(
        tag for tag in request.profile.selected_tags if tag in candidate_tags
    )
    reasons: list[RestaurantReasonCode] = []
    if matched_tags:
        reasons.append("tag_match")
    if assessment.state == "within":
        reasons.append("within_budget")
    elif assessment.state == "stretch":
        reasons.append("budget_stretch")
    elif assessment.state == "unknown":
        reasons.append("budget_unknown")
    if (
        median_rating is not None
        and candidate.evidence.rating
        and candidate.rating is not None
        and candidate.rating > median_rating
    ):
        reasons.append("above_median_rating")
    if candidate.evidence.distance and candidate.distance_m <= radius_m / 2:
        reasons.append("nearby")
    if not request.profile.selected_tags and counts:
        accepted_count = sum(counts.get(tag, 0) for tag in candidate.intent_tags)
        if accepted_count < max(counts.values()):
            reasons.append("intent_diversity")

    return RankedRestaurant(
        candidate=candidate,
        score=round(max(0.0, min(100.0, score)), 4),
        matched_tags=matched_tags,
        budget_state=_budget_state(assessment),
        budget_overage_minor=assessment.overage_minor if assessment.state == "stretch" else None,
        reason_codes=tuple(reasons[:4]),
    )


def score_restaurants(
    candidates: tuple[RestaurantCandidate, ...],
    request: RestaurantRecommendRequest,
    *,
    radius_m: int,
    now: datetime | None = None,
) -> ScoringResult:
    eligibility = eligible_candidates(candidates, request, radius_m=radius_m)
    ratings = tuple(
        item.rating
        for item in eligibility.eligible
        if item.evidence.rating and item.rating is not None
    )
    middle_rating = median(ratings) if ratings else None
    counts = recent_tag_counts(request.recent_intents, now)
    ranked = tuple(
        sorted(
            (
                score_candidate(
                    item,
                    request,
                    radius_m=radius_m,
                    recent_counts=counts,
                    median_rating=middle_rating,
                )
                for item in eligibility.eligible
            ),
            key=lambda item: (-item.score, item.candidate.distance_m, item.candidate.id),
        )
    )
    return ScoringResult(ranked=ranked, exclusions=eligibility.exclusions)


def build_quality_pool(
    ranked: tuple[RankedRestaurant, ...],
    *,
    budget_is_explicit: bool = False,
) -> tuple[RankedRestaurant, ...]:
    if not ranked:
        return ()
    ordered = tuple(
        sorted(ranked, key=lambda item: (-item.score, item.candidate.distance_m, item.candidate.id))
    )
    band = tuple(item for item in ordered if item.score >= ordered[0].score - 8)
    if budget_is_explicit:
        known = tuple(item for item in band if item.budget_state in {"within", "stretch"})
        unknown = tuple(item for item in band if item.budget_state == "unknown")
        if len(known) >= 3:
            band = known
        elif known:
            band = known + unknown
    return band[:5]


def weighted_permutation(
    pool: tuple[RankedRestaurant, ...],
    rng: Random,
) -> tuple[RankedRestaurant, ...]:
    if not pool:
        return ()
    minimum_score = min(item.score for item in pool)
    remaining = list(pool)
    ordered: list[RankedRestaurant] = []
    while remaining:
        weights = [1 + item.score - minimum_score for item in remaining]
        selected = rng.choices(remaining, weights=weights, k=1)[0]
        ordered.append(selected)
        remaining.remove(selected)
    return tuple(ordered)
