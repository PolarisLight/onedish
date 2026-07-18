import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.demo_video_model import load_scenes


NARRATION_PATH = ROOT / "docs" / "demo" / "narration.json"


def test_founder_narration_contract() -> None:
    scenes = load_scenes(NARRATION_PATH)

    assert [scene.id for scene in scenes] == [
        "home",
        "context",
        "elimination",
        "winner",
        "orbit",
        "privacy",
        "close",
    ]
    assert all(scene.voice == "en-US-AndrewMultilingualNeural" for scene in scenes)
    assert all(scene.text.isascii() for scene in scenes)
    assert 280 <= sum(len(scene.text.split()) for scene in scenes) <= 360
    assert scenes[0].text.startswith("Food apps don't solve indecision.")
    assert scenes[-1].text.endswith("stop browsing, and eat this.")


def test_load_scenes_rejects_chinese_samantha_fixture(tmp_path: Path) -> None:
    fixture = tmp_path / "narration.json"
    fixture.write_text(
        json.dumps(
            [
                {
                    "id": "bad",
                    "text": "今天吃什么?",
                    "voice": "Samantha",
                    "rate": "+0%",
                    "pitch": "-2Hz",
                    "pause_after_ms": 0,
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="English neural voice"):
        load_scenes(fixture)
