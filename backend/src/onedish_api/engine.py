"""Canonical deterministic meal-elimination engine."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import asdict
from datetime import datetime
from math import ceil
from typing import Callable, Sequence

from onedish_api.domain import (
    Candidate,
    Confidence,
    DecisionRecord,
    EliminationStage,
    MealConstraints,
    MealContext,
)
from onedish_api.history import PreferenceWeights, RepetitionProfile


class NoSafeCandidate(ValueError):
    def __init__(self, reason_counts: dict[str, int]) -> None:
        super().__init__("no candidate survived the required constraints")
        self.reason_counts = reason_counts


def _stage(
    stage_id: str,
    before: Sequence[Candidate],
    after: Sequence[Candidate],
    reasons: dict[str, int],
) -> EliminationStage:
    after_ids = {candidate.dish.id for candidate in after}
    removed = tuple(
        sorted(candidate.dish.id for candidate in before if candidate.dish.id not in after_ids)[:3]
    )
    return EliminationStage(
        id=stage_id,  # type: ignore[arg-type]
        input_count=len(before),
        survivor_count=len(after),
        reason_counts=dict(sorted(reasons.items())),
        representative_removed_ids=removed,
    )


def _filter(
    candidates: Sequence[Candidate],
    reason_for: Callable[[Candidate], str | None],
) -> tuple[list[Candidate], dict[str, int]]:
    survivors: list[Candidate] = []
    reasons: Counter[str] = Counter()
    for candidate in candidates:
        reason = reason_for(candidate)
        if reason is None:
            survivors.append(candidate)
        else:
            reasons[reason] += 1
    return survivors, dict(reasons)


def _overlaps(candidate_min: int, candidate_max: int, target_min: int, target_max: int) -> bool:
    return candidate_max >= target_min and candidate_min <= target_max


def _confidence_rank(confidence: Confidence) -> int:
    return {
        Confidence.authoritative: 4,
        Confidence.high: 3,
        Confidence.medium: 2,
        Confidence.low: 1,
    }[confidence]


def _score(
    candidate: Candidate,
    context: MealContext,
    constraints: MealConstraints,
    repetition: RepetitionProfile,
    preferences: PreferenceWeights,
) -> int:
    dish = candidate.dish
    desired = set(constraints.desired_taste_tags)
    taste_match = len(desired.intersection(dish.taste_tags))
    score = taste_match * 1_000
    if context.comfort_preference and context.comfort_preference in dish.taste_tags:
        score += 450
    score += _confidence_rank(dish.confidence) * 220
    score -= candidate.place.distance_m // 5
    score -= dish.price_minor // 15
    score -= repetition.dish_ids.get(dish.id, 0) * 800
    score -= repetition.base_ingredients.get(dish.base_ingredient, 0) * 350
    score += round(
        1_000
        * (
            sum(preferences.cuisine.get(tag, 0) for tag in dish.cuisine_tags)
            + sum(preferences.taste.get(tag, 0) for tag in dish.taste_tags)
        )
    )
    return score


def _canonical_hash(
    candidates: Sequence[Candidate],
    context: MealContext,
    constraints: MealConstraints,
    repetition: RepetitionProfile,
    preferences: PreferenceWeights,
    catalog_version: str,
) -> str:
    payload = {
        "candidates": [
            candidate.model_dump(mode="json")
            for candidate in sorted(candidates, key=lambda item: item.dish.id)
        ],
        "context": context.model_dump(mode="json"),
        "constraints": constraints.model_dump(mode="json"),
        "repetition": asdict(repetition),
        "preferences": asdict(preferences),
        "catalog_version": catalog_version,
        "engine_version": "engine.v1",
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def recommend(
    candidates: Sequence[Candidate],
    context: MealContext,
    constraints: MealConstraints,
    repetition: RepetitionProfile,
    preferences: PreferenceWeights,
    *,
    catalog_version: str,
    created_at: datetime,
) -> DecisionRecord:
    ordered = sorted(candidates, key=lambda candidate: candidate.dish.id)
    if not ordered:
        raise NoSafeCandidate({"empty_catalog": 1})
    stages: list[EliminationStage] = [
        _stage("found", ordered, ordered, {})
    ]
    relaxations: list[str] = []

    available, reasons = _filter(
        ordered,
        lambda item: (
            "place_closed"
            if item.place.open_state == "closed"
            else "missing_order_destination"
            if not item.place.order_destination
            else None
        ),
    )
    stages.append(_stage("available", ordered, available, reasons))
    if not available:
        raise NoSafeCandidate(reasons)

    excluded_allergens = set(constraints.excluded_allergens)
    excluded_ingredients = {value.casefold() for value in constraints.excluded_ingredients}

    def safety_reason(item: Candidate) -> str | None:
        dish = item.dish
        if excluded_allergens.intersection((*dish.allergens, *dish.possible_allergens)):
            return "allergen_excluded"
        ingredients = {ingredient.casefold() for ingredient in dish.ingredients}
        if excluded_ingredients.intersection(ingredients):
            return "ingredient_excluded"
        if constraints.max_price_minor is not None and dish.price_minor > constraints.max_price_minor:
            return "over_budget"
        if dish.currency != constraints.currency:
            return "currency_mismatch"
        return None

    safe, reasons = _filter(available, safety_reason)
    stages.append(_stage("safety_budget", available, safe, reasons))
    if not safe:
        raise NoSafeCandidate(reasons)

    nutrition_input = safe
    nutrition = safe
    nutrition_reasons: Counter[str] = Counter()
    target_energy = constraints.energy_range_kcal or context.energy_range_kcal
    if target_energy is not None:
        energy, energy_reasons = _filter(
            nutrition,
            lambda item: (
                None
                if _overlaps(
                    item.dish.energy_kcal.min,
                    item.dish.energy_kcal.max,
                    target_energy.min,
                    target_energy.max,
                )
                else "energy_outside_range"
            ),
        )
        nutrition_reasons.update(energy_reasons)
        if energy:
            nutrition = energy
        elif "energy_range" in constraints.allowed_relaxations:
            relaxations.append("energy_range")
        else:
            stages.append(_stage("nutrition", nutrition_input, [], dict(nutrition_reasons)))
            raise NoSafeCandidate(dict(nutrition_reasons))

    protein_floor = constraints.minimum_protein_g
    if protein_floor is not None:
        protein, protein_reasons = _filter(
            nutrition,
            lambda item: (
                None if item.dish.protein_g.min >= protein_floor else "protein_below_floor"
            ),
        )
        nutrition_reasons.update(protein_reasons)
        if protein:
            nutrition = protein
        elif "protein_floor" in constraints.allowed_relaxations:
            relaxations.append("protein_floor")
        else:
            stages.append(_stage("nutrition", nutrition_input, [], dict(nutrition_reasons)))
            raise NoSafeCandidate(dict(nutrition_reasons))
    stages.append(_stage("nutrition", nutrition_input, nutrition, dict(nutrition_reasons)))

    avoid = set(context.recent_categories_to_avoid)
    repeated = {
        item.dish.id
        for item in nutrition
        if item.dish.base_ingredient in avoid
        or repetition.base_ingredients.get(item.dish.base_ingredient, 0) >= 2
        or repetition.dish_ids.get(item.dish.id, 0) >= 1
    }
    non_repeated = [item for item in nutrition if item.dish.id not in repeated]
    if non_repeated:
        repetition_survivors = non_repeated
        repetition_reasons = {"recent_repetition": len(repeated)} if repeated else {}
    else:
        repetition_survivors = nutrition
        repetition_reasons = {"recent_repetition_retained": len(repeated)} if repeated else {}
        if repeated and "recent_repetition" in constraints.allowed_relaxations:
            relaxations.append("recent_repetition")
    stages.append(
        _stage("repetition", nutrition, repetition_survivors, repetition_reasons)
    )

    ranked = sorted(
        repetition_survivors,
        key=lambda item: (
            -_score(item, context, constraints, repetition, preferences),
            -_confidence_rank(item.dish.confidence),
            item.place.distance_m,
            item.dish.price_minor,
            item.dish.id,
        ),
    )
    shortlist_size = min(len(ranked), max(2, ceil(len(ranked) * 0.35)))
    shortlist = ranked[:shortlist_size]
    stages.append(
        _stage(
            "taste_confidence",
            repetition_survivors,
            shortlist,
            {"lower_score": len(ranked) - len(shortlist)} if len(ranked) > len(shortlist) else {},
        )
    )
    winner = shortlist[0]
    reserve = shortlist[1] if len(shortlist) > 1 else None
    stages.append(
        _stage(
            "winner",
            shortlist,
            [winner],
            {"reserve_or_lower_score": len(shortlist) - 1} if len(shortlist) > 1 else {},
        )
    )

    input_hash = _canonical_hash(
        ordered, context, constraints, repetition, preferences, catalog_version
    )
    return DecisionRecord(
        decision_id=f"decision-{input_hash[:16]}",
        engine_version="engine.v1",
        catalog_version=catalog_version,
        input_sha256=input_hash,
        created_at=created_at,
        stages=tuple(stages),
        winner_id=winner.dish.id,
        reserve_id=reserve.dish.id if reserve else None,
        relaxations=tuple(relaxations),
    )
