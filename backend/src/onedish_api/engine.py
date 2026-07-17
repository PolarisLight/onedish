"""Canonical deterministic meal-elimination engine."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Callable, Sequence

from onedish_api.domain import (
    Candidate,
    DecisionRecord,
    DecisionRules,
    EliminationStage,
    MealConstraints,
    MealContext,
)
from onedish_api.history import PreferenceWeights, RepetitionProfile


class NoSafeCandidate(ValueError):
    def __init__(self, reason_counts: dict[str, int]) -> None:
        super().__init__("no candidate survived the required constraints")
        self.reason_counts = reason_counts


def load_decision_rules(path: Path) -> DecisionRules:
    return DecisionRules.model_validate_json(path.read_text(encoding="utf-8"))


def _stage(
    stage_id: str,
    before: Sequence[Candidate],
    after: Sequence[Candidate],
    reasons: dict[str, int],
) -> EliminationStage:
    after_ids = {candidate.dish.id for candidate in after}
    removed = tuple(
        sorted(
            candidate.dish.id
            for candidate in before
            if candidate.dish.id not in after_ids
        )[:3]
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


def _overlaps(
    candidate_min: int,
    candidate_max: int,
    target_min: int,
    target_max: int,
) -> bool:
    return candidate_max >= target_min and candidate_min <= target_max


def _localized_price_minor(
    candidate: Candidate,
    constraints: MealConstraints,
    rules: DecisionRules,
) -> int:
    locale = next(
        (value for value in rules.locales.values() if value.currency == constraints.currency),
        None,
    )
    if locale is None:
        raise NoSafeCandidate({"currency_mismatch": 1})
    return round(candidate.dish.price_minor * locale.usd_multiplier)


def _score(
    candidate: Candidate,
    context: MealContext,
    constraints: MealConstraints,
    repetition: RepetitionProfile,
    preferences: PreferenceWeights,
    rules: DecisionRules,
) -> int:
    dish = candidate.dish
    desired = set(constraints.desired_taste_tags)
    score = len(desired.intersection(dish.taste_tags)) * rules.score.taste_match
    if context.comfort_preference and context.comfort_preference in dish.taste_tags:
        score += rules.score.comfort_match
    score += rules.score.confidence[dish.confidence]
    score -= candidate.place.distance_m // rules.score.distance_divisor
    score -= dish.price_minor // rules.score.price_divisor
    score -= repetition.dish_ids.get(dish.id, 0) * rules.score.recent_dish
    score -= (
        repetition.base_ingredients.get(dish.base_ingredient, 0)
        * rules.score.recent_base_ingredient
    )
    score += round(
        rules.score.preference_scale
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
    rules: DecisionRules,
    session_exclusions: tuple[str, ...],
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
        "rules": rules.model_dump(mode="json"),
        "session_exclusions": sorted(session_exclusions),
        "engine_version": "engine.v2",
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def _apply_soft_stage(
    stage_id: str,
    current: list[Candidate],
    filtered: list[Candidate],
    reasons: dict[str, int],
    relaxation: str,
    constraints: MealConstraints,
    relaxations: list[str],
) -> tuple[list[Candidate], EliminationStage]:
    if filtered:
        return filtered, _stage(stage_id, current, filtered, reasons)
    if relaxation not in constraints.allowed_relaxations:
        raise NoSafeCandidate(reasons)
    relaxations.append(relaxation)
    return current, _stage(stage_id, current, current, reasons)


def recommend(
    candidates: Sequence[Candidate],
    context: MealContext,
    constraints: MealConstraints,
    repetition: RepetitionProfile,
    preferences: PreferenceWeights,
    *,
    catalog_version: str,
    created_at: datetime,
    rules: DecisionRules,
    session_exclusions: tuple[str, ...] = (),
) -> DecisionRecord:
    ordered = sorted(candidates, key=lambda candidate: candidate.dish.id)
    if not ordered:
        raise NoSafeCandidate({"empty_catalog": 1})
    stages: list[EliminationStage] = [_stage("found", ordered, ordered, {})]
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
    excluded_session_ids = set(session_exclusions)

    def safety_reason(item: Candidate) -> str | None:
        dish = item.dish
        if dish.id in excluded_session_ids:
            return "session_excluded"
        if excluded_allergens.intersection((*dish.allergens, *dish.possible_allergens)):
            return "allergen_excluded"
        ingredients = {ingredient.casefold() for ingredient in dish.ingredients}
        if excluded_ingredients.intersection(ingredients):
            return "ingredient_excluded"
        return None

    safe, reasons = _filter(available, safety_reason)
    stages.append(_stage("safety", available, safe, reasons))
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

    if constraints.minimum_protein_g is not None:
        protein, protein_reasons = _filter(
            nutrition,
            lambda item: (
                None
                if item.dish.protein_g.min >= constraints.minimum_protein_g
                else "protein_below_floor"
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
    non_repeated, repetition_reasons = _filter(
        nutrition,
        lambda item: (
            "recent_repetition"
            if item.dish.base_ingredient in avoid
            or repetition.base_ingredients.get(item.dish.base_ingredient, 0) >= 2
            or repetition.dish_ids.get(item.dish.id, 0) >= 1
            else None
        ),
    )
    current, trace = _apply_soft_stage(
        "repetition",
        nutrition,
        non_repeated,
        repetition_reasons,
        "recent_repetition",
        constraints,
        relaxations,
    )
    stages.append(trace)

    desired = set(constraints.desired_taste_tags)
    taste, taste_reasons = _filter(
        current,
        lambda item: (
            None
            if not desired or desired.intersection(item.dish.taste_tags)
            else "taste_mismatch"
        ),
    )
    current, trace = _apply_soft_stage(
        "taste", current, taste, taste_reasons, "taste", constraints, relaxations
    )
    stages.append(trace)

    duration, duration_reasons = _filter(
        current,
        lambda item: (
            None
            if constraints.max_duration_minutes is None
            or item.dish.estimated_minutes <= constraints.max_duration_minutes
            else "too_slow"
        ),
    )
    current, trace = _apply_soft_stage(
        "duration",
        current,
        duration,
        duration_reasons,
        "duration",
        constraints,
        relaxations,
    )
    stages.append(trace)

    budget, budget_reasons = _filter(
        current,
        lambda item: (
            None
            if constraints.max_price_minor is None
            or _localized_price_minor(item, constraints, rules) <= constraints.max_price_minor
            else "over_budget"
        ),
    )
    current, trace = _apply_soft_stage(
        "budget", current, budget, budget_reasons, "budget", constraints, relaxations
    )
    stages.append(trace)

    ranked = sorted(
        current,
        key=lambda item: (
            -_score(item, context, constraints, repetition, preferences, rules),
            item.place.distance_m,
            item.dish.price_minor,
            item.dish.id,
        ),
    )
    winner = ranked[0]
    reserve = ranked[1] if len(ranked) > 1 else None
    stages.append(
        _stage(
            "winner",
            ranked,
            [winner],
            {"reserve_or_lower_score": len(ranked) - 1} if len(ranked) > 1 else {},
        )
    )

    input_hash = _canonical_hash(
        ordered,
        context,
        constraints,
        repetition,
        preferences,
        catalog_version,
        rules,
        session_exclusions,
    )
    return DecisionRecord(
        decision_id=f"decision-{input_hash[:16]}",
        engine_version="engine.v2",
        catalog_version=catalog_version,
        input_sha256=input_hash,
        created_at=created_at,
        stages=tuple(stages),
        winner_id=winner.dish.id,
        reserve_id=reserve.dish.id if reserve else None,
        relaxations=tuple(relaxations),
    )
