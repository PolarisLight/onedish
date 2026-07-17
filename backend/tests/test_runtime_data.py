import json
from pathlib import Path


ROOT = Path(__file__).parents[2]


def test_runtime_rules_are_versioned_and_generated_files_match() -> None:
    rules = json.loads((ROOT / "data/decision.v2.json").read_text())

    assert rules["version"] == "decision.v2"
    assert rules["relaxation_order"] == [
        "recent_repetition",
        "taste",
        "duration",
        "budget",
    ]
    assert rules["locales"]["en"]["currency"] == "USD"
    assert rules["locales"]["zh-CN"]["currency"] == "CNY"

    for name in ("decision.v2.json", "catalog.v1.json", "places.v1.json"):
        source = ROOT / "data" / name
        generated = ROOT / "web/public/data" / name
        assert generated.read_bytes() == source.read_bytes()
