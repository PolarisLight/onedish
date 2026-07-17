#!/usr/bin/env python3
"""Generate deterministic OneDish demo records using the canonical engine."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from onedish_api.catalog import load_catalog
from onedish_api.context import derive_meal_context
from onedish_api.domain import (
    Candidate,
    DailyContextEntry,
    MealConstraints,
    MealHistoryEvent,
    NutritionRange,
)
from onedish_api.engine import load_decision_rules, recommend
from onedish_api.history import preference_weights, recent_repetition
from onedish_api.providers.fixtures import FixturePlacesProvider
from onedish_api.providers.base import PlaceQuery


NOW = datetime(2026, 7, 18, 12, 0, tzinfo=UTC)
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "web" / "public" / "demo"
RULES = load_decision_rules(ROOT / "data" / "decision.v2.json")


def _read_versioned(path: Path, version: str, key: str) -> Any:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != version:
        raise ValueError(f"unsupported fixture version in {path.name}")
    return payload[key]


async def _candidates() -> tuple[Any, tuple[Candidate, ...]]:
    catalog = load_catalog(ROOT / "data" / "catalog.v1.json", asset_root=ROOT / "web" / "public")
    provider = FixturePlacesProvider(ROOT / "data" / "places.v1.json")
    places = await provider.nearby(
        PlaceQuery(latitude=0, longitude=0, radius_m=100_000, limit=50)
    )
    by_restaurant = {place.id.removeprefix("fixture-"): place for place in places}
    candidates = tuple(
        Candidate(dish=dish, place=by_restaurant[dish.restaurant_id])
        for dish in catalog.dishes
    )
    return catalog, candidates


def _rejection_events(candidate: Candidate) -> tuple[MealHistoryEvent, ...]:
    return tuple(
        MealHistoryEvent(
            id=f"demo-rejection-{index}",
            occurred_at=NOW - timedelta(minutes=10 - index),
            kind="rejected",
            dish_id=candidate.dish.id,
            cuisine_tags=candidate.dish.cuisine_tags,
            taste_tags=candidate.dish.taste_tags,
            base_ingredient=candidate.dish.base_ingredient,
            rejection_reason="not_craving",
        )
        for index in range(1, 4)
    )


def _envelope(
    *,
    state_id: str,
    title: str,
    catalog: Any,
    candidates: tuple[Candidate, ...],
    context: Any,
    constraints: MealConstraints,
    repetition: Any,
    preferences: Any,
    feedback: dict[str, Any] | None = None,
) -> dict[str, Any]:
    decision = recommend(
        candidates,
        context,
        constraints,
        repetition,
        preferences,
        catalog_version=catalog.version,
        created_at=NOW,
        rules=RULES,
    )
    by_id = {candidate.dish.id: candidate for candidate in candidates}
    return {
        "schema_version": "demo.v1",
        "state_id": state_id,
        "title": title,
        "synthetic_demo_context": True,
        "generated_at": NOW.isoformat().replace("+00:00", "Z"),
        "catalog_version": catalog.version,
        "engine_version": decision.engine_version,
        "input_sha256": decision.input_sha256,
        "context": context.model_dump(mode="json"),
        "constraints": constraints.model_dump(mode="json"),
        "history_summary": {
            "recent_dishes": sum(repetition.dish_ids.values()),
            "recent_base_ingredients": repetition.base_ingredients,
            "learned_cuisine_weights": preferences.cuisine,
            "learned_taste_weights": preferences.taste,
        },
        "decision": decision.model_dump(mode="json"),
        "winner": by_id[decision.winner_id].model_dump(mode="json"),
        "reserve": (
            by_id[decision.reserve_id].model_dump(mode="json")
            if decision.reserve_id is not None
            else None
        ),
        "feedback": feedback,
        "provenance": {
            "menu": "versioned fictional demo menu",
            "places": "OneDish fixture places",
            "wellness": "synthetic user-entered demo context",
            "decision": "canonical deterministic engine.v2",
        },
    }


async def generate_records() -> dict[str, bytes]:
    catalog, candidates = await _candidates()
    entry = DailyContextEntry.model_validate(
        _read_versioned(ROOT / "data" / "context.v1.json", "context.v1", "entry")
    )
    history = TypeAdapter(tuple[MealHistoryEvent, ...]).validate_python(
        _read_versioned(ROOT / "data" / "history.v1.json", "history.v1", "events")
    )
    demo_history = tuple(event for event in history if event.base_ingredient == "noodles")
    context = derive_meal_context(entry, demo_history, now=NOW, timezone_name="UTC")
    constraints = MealConstraints(
        max_price_minor=1_750,
        currency="USD",
        energy_range_kcal=NutritionRange(min=500, max=720),
        minimum_protein_g=20,
        excluded_allergens=("peanuts",),
        desired_taste_tags=("warm", "filling"),
    )
    repetition = recent_repetition(demo_history, NOW, "UTC")
    initial_preferences = preference_weights(demo_history, NOW)
    day1 = _envelope(
        state_id="day1",
        title="One decision, not another feed",
        catalog=catalog,
        candidates=candidates,
        context=context,
        constraints=constraints,
        repetition=repetition,
        preferences=initial_preferences,
    )
    rejected_id = day1["decision"]["winner_id"]
    rejected_candidate = next(item for item in candidates if item.dish.id == rejected_id)
    rejection_events = _rejection_events(rejected_candidate)
    day1_rejected = _envelope(
        state_id="day1_rejected",
        title="Not this one. Show the reserve",
        catalog=catalog,
        candidates=candidates,
        context=context,
        constraints=constraints,
        repetition=repetition,
        preferences=initial_preferences,
        feedback={
            "kind": "rejected",
            "dish_id": rejected_id,
            "reason": "not_craving",
            "next_candidate_id": day1["decision"]["reserve_id"],
        },
    )
    learned_preferences = preference_weights((*demo_history, *rejection_events), NOW)
    day2 = _envelope(
        state_id="day2",
        title="Tomorrow, OneDish remembers",
        catalog=catalog,
        candidates=candidates,
        context=context,
        constraints=constraints,
        repetition=repetition,
        preferences=learned_preferences,
        feedback={
            "kind": "learned_from_rejections",
            "event_count": len(rejection_events),
            "previous_winner_id": rejected_id,
        },
    )
    payloads = {"day1": day1, "day1_rejected": day1_rejected, "day2": day2}
    return {
        f"{name}.json": (
            json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
        ).encode("utf-8")
        for name, payload in payloads.items()
    }


def _assert_safe_output(output: Path) -> None:
    if output.is_symlink():
        raise RuntimeError(f"refusing symlink output: {output}")
    if output.exists():
        for child in output.iterdir():
            if child.is_symlink():
                raise RuntimeError(f"refusing symlink output member: {child}")


def _check(records: dict[str, bytes]) -> bool:
    _assert_safe_output(OUTPUT)
    actual = {
        path.name: path.read_bytes()
        for path in OUTPUT.glob("*.json")
        if path.is_file()
    } if OUTPUT.exists() else {}
    return actual == records


def _write_atomic(records: dict[str, bytes]) -> None:
    _assert_safe_output(OUTPUT)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".demo-build-", dir=OUTPUT.parent))
    backup = OUTPUT.with_name(".demo-backup")
    try:
        for name, content in records.items():
            path = temporary / name
            path.write_bytes(content)
            with path.open("rb") as handle:
                os.fsync(handle.fileno())
        if backup.exists():
            shutil.rmtree(backup)
        if OUTPUT.exists():
            os.replace(OUTPUT, backup)
        try:
            os.replace(temporary, OUTPUT)
        except Exception:
            if backup.exists():
                os.replace(backup, OUTPUT)
            raise
        if backup.exists():
            shutil.rmtree(backup)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    records = await generate_records()
    if arguments.check:
        if not _check(records):
            print("Offline demo records differ; regenerate them.")
            return 1
        print("Offline demo records are byte-identical.")
        return 0
    _write_atomic(records)
    print(f"Generated {len(records)} offline demo records in {OUTPUT}")
    return 0


if __name__ == "__main__":
    import asyncio

    raise SystemExit(asyncio.run(main()))
