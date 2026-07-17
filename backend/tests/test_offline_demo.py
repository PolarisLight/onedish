import asyncio
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).parents[2]


def load_builder():
    path = ROOT / "scripts" / "build_offline_demo.py"
    spec = importlib.util.spec_from_file_location("build_offline_demo", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_records_are_deterministic_and_auditable() -> None:
    builder = load_builder()
    first = asyncio.run(builder.generate_records())
    second = asyncio.run(builder.generate_records())
    assert first == second
    assert set(first) == {"day1.json", "day1_rejected.json", "day2.json"}
    day1 = json.loads(first["day1.json"])
    assert [stage["survivor_count"] for stage in day1["decision"]["stages"]] == [
        90, 81, 81, 63, 54, 54, 54, 48, 1
    ]
    assert day1["decision"]["engine_version"] == "engine.v2"
    assert day1["synthetic_demo_context"] is True
    assert day1["input_sha256"] == day1["decision"]["input_sha256"]


def test_day2_records_learned_preference_without_rewriting_history() -> None:
    records = asyncio.run(load_builder().generate_records())
    day1 = json.loads(records["day1.json"])
    day2 = json.loads(records["day2.json"])
    assert day1["history_summary"]["learned_taste_weights"] == {}
    assert day2["history_summary"]["learned_taste_weights"]
    assert day2["feedback"]["event_count"] == 3
