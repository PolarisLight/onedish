import json
from datetime import datetime
from pathlib import Path

from pydantic import TypeAdapter

from onedish_api.domain import Candidate, MealConstraints, MealContext
from onedish_api.engine import load_decision_rules, recommend
from onedish_api.history import PreferenceWeights, RepetitionProfile


ROOT = Path(__file__).parents[2]
RULES = load_decision_rules(ROOT / "data/decision.v2.json")
CANDIDATES = TypeAdapter(tuple[Candidate, ...])


def project(decision) -> dict[str, object]:  # type: ignore[no-untyped-def]
    return {
        "winner_id": decision.winner_id,
        "reserve_id": decision.reserve_id,
        "stage_counts": [stage.survivor_count for stage in decision.stages],
        "reason_codes": sorted({
            code
            for stage in decision.stages
            for code, count in stage.reason_counts.items()
            if count > 0
        }),
        "relaxations": list(decision.relaxations),
    }


def test_python_engine_matches_v2_golden_scenarios() -> None:
    payload = json.loads((ROOT / "data/parity.v2.json").read_text())
    candidates = CANDIDATES.validate_python(payload["candidates"])
    by_id = {candidate.dish.id: candidate for candidate in candidates}

    for scenario in payload["scenarios"]:
        selected = tuple(by_id[candidate_id] for candidate_id in scenario["candidate_ids"])
        decision = recommend(
            selected,
            MealContext.model_validate(scenario["context"]),
            MealConstraints.model_validate(scenario["constraints"]),
            RepetitionProfile(**scenario["repetition"]),
            PreferenceWeights(**scenario["preferences"]),
            catalog_version="catalog.v1",
            created_at=datetime.fromisoformat(scenario["now"].replace("Z", "+00:00")),
            rules=RULES,
            session_exclusions=tuple(scenario["session_exclusions"]),
        )
        assert project(decision) == scenario["expected"], scenario["id"]
