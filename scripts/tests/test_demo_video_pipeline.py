import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.demo_video_model import Scene, load_scenes
from scripts.synthesize_narration import edge_tts_command, scene_stem


NARRATION_PATH = ROOT / "docs" / "demo" / "narration.json"


def test_founder_narration_contract() -> None:
    scenes = load_scenes(NARRATION_PATH)

    assert scenes == [
        Scene(
            id="home",
            text="Food apps don't solve indecision. They multiply it. OneDish takes the opposite approach. Tell it what today looks like - or don't - and tap once. No feed. No swiping. Just one meal.",
            voice="en-US-AndrewMultilingualNeural",
            rate="+1%",
            pitch="-2Hz",
            pause_after_ms=650,
        ),
        Scene(
            id="context",
            text="Optional context can sharpen the choice: budget, time, allergies, cravings, and eventually wellness signals. But the default remains one tap. Missing information stays unknown, and hard allergy rules are never relaxed.",
            voice="en-US-AndrewMultilingualNeural",
            rate="+0%",
            pitch="-2Hz",
            pause_after_ms=500,
        ),
        Scene(
            id="elimination",
            text="Behind that tap, OneDish starts with ninety demo dishes. The decision is already complete before this animation begins. You're not watching fake A.I. thinking. You're watching the evidence: availability, safety, nutrition, repetition, taste, time, and budget - reduced, step by step, to one.",
            voice="en-US-AndrewMultilingualNeural",
            rate="+2%",
            pitch="-2Hz",
            pause_after_ms=700,
        ),
        Scene(
            id="winner",
            text="Here's the answer. One dish, with a price estimate, calorie and protein ranges, and the exact reasons it won. The menu is clearly labeled as demo data, and every decision keeps its input hash. If this misses, I can give one reason and get one reserve - not another endless list.",
            voice="en-US-AndrewMultilingualNeural",
            rate="+1%",
            pitch="-2Hz",
            pause_after_ms=600,
        ),
        Scene(
            id="orbit",
            text="That correction stays on this device. Over time, Taste Orbit turns meal history into visible preference memory. I can focus a signal, inspect why it matters, then tap You and return to the natural orbit. It's useful, but it never becomes a hidden black box.",
            voice="en-US-AndrewMultilingualNeural",
            rate="+0%",
            pitch="-2Hz",
            pause_after_ms=550,
        ),
        Scene(
            id="privacy",
            text="Privacy is a boundary you can see. Meal history, taste, identifiers, health signals, and precise location each have a clear purpose, storage rule, and deletion rule. Health data does not leave the device. Location only reaches OpenStreetMap after permission, and the connector shows that path - nothing more.",
            voice="en-US-AndrewMultilingualNeural",
            rate="-1%",
            pitch="-2Hz",
            pause_after_ms=700,
        ),
        Scene(
            id="close",
            text="OneDish is an offline-ready P.W.A. with deterministic decisions and optional A.I. interpretation behind a strict boundary. It doesn't order for you, and it doesn't pretend demo inventory is live. It does one thing well: stop browsing, and eat this.",
            voice="en-US-AndrewMultilingualNeural",
            rate="-2%",
            pitch="-3Hz",
            pause_after_ms=900,
        ),
    ]
    assert all(scene.voice == "en-US-AndrewMultilingualNeural" for scene in scenes)
    assert all(scene.text.isascii() for scene in scenes)
    assert 280 <= sum(len(scene.text.split()) for scene in scenes) <= 360
    assert scenes[0].text.startswith("Food apps don't solve indecision.")
    assert scenes[-1].text.endswith("stop browsing, and eat this.")


def test_edge_tts_command_uses_natural_voice_and_writes_subtitles() -> None:
    scene = load_scenes(NARRATION_PATH)[0]
    command = edge_tts_command(scene, Path("voice.mp3"), Path("voice.srt"))

    assert command[:3] == ["python", "-m", "edge_tts"]
    assert command[command.index("--voice") + 1] == "en-US-AndrewMultilingualNeural"
    assert "--rate=+1%" in command
    assert "--pitch=-2Hz" in command
    assert "--write-media" in command
    assert "--write-subtitles" in command
    assert "Samantha" not in command


def test_scene_stem_is_stable() -> None:
    assert scene_stem(3, "winner") == "03-winner"


VALID_SCENE = {
    "id": "home",
    "text": "ASCII narration.",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+0%",
    "pitch": "-2Hz",
    "pause_after_ms": 0,
}


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ([], "at least one scene"),
        ([{**VALID_SCENE, "id": ""}], "non-empty scene id"),
        ([{**VALID_SCENE, "id": "   "}], "non-empty scene id"),
        ([{**VALID_SCENE, "text": ""}], "non-empty scene text"),
        ([{**VALID_SCENE, "text": "  \t"}], "non-empty scene text"),
        ([VALID_SCENE, VALID_SCENE], "unique"),
        ([{**VALID_SCENE, "pause_after_ms": -1}], "non-negative"),
        ([{**VALID_SCENE, "text": "今天吃什么?"}], "English neural voice"),
        ([{**VALID_SCENE, "voice": "Samantha"}], "English neural voice"),
    ],
    ids=[
        "empty-list",
        "empty-id",
        "whitespace-id",
        "empty-text",
        "whitespace-text",
        "duplicate-id",
        "negative-pause",
        "non-ascii-text",
        "wrong-voice",
    ],
)
def test_load_scenes_rejects_invalid_contract(
    tmp_path: Path, payload: list[dict[str, object]], message: str
) -> None:
    fixture = tmp_path / "narration.json"
    fixture.write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match=message):
        load_scenes(fixture)
