import json
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.demo_video_model import Scene, load_scenes
import scripts.synthesize_narration as narration
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
    assert command[command.index("--write-media") + 1] == "voice.mp3"
    assert "--write-subtitles" in command
    assert command[command.index("--write-subtitles") + 1] == "voice.srt"
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
VALID_SRT = "1\n00:00:00,000 --> 00:00:01,000\nNarration\n"


def configure_synthesis(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    scenes: list[dict[str, object]] | None = None,
) -> tuple[Path, Path, list[list[str]]]:
    demo = tmp_path / "demo"
    audio = demo / ".build" / "audio"
    demo.mkdir()
    (demo / "narration.json").write_text(
        json.dumps(scenes or [VALID_SCENE]),
        encoding="utf-8",
    )
    calls: list[list[str]] = []

    def fake_run(command: list[str], check: bool) -> None:
        assert check is True
        calls.append(command)
        media = Path(command[command.index("--write-media") + 1])
        subtitles = Path(command[command.index("--write-subtitles") + 1])
        media.write_bytes(f"media-{len(calls)}".encode())
        subtitles.write_text(VALID_SRT, encoding="utf-8")

    monkeypatch.setattr(narration, "DEMO", demo)
    monkeypatch.setattr(narration, "AUDIO", audio)
    monkeypatch.setattr(narration.subprocess, "run", fake_run)
    monkeypatch.setattr(narration, "duration", lambda path: 1.25)
    return demo, audio, calls


def write_scenes(demo: Path, scenes: list[dict[str, object]]) -> None:
    (demo / "narration.json").write_text(json.dumps(scenes), encoding="utf-8")


def test_synthesize_reuses_valid_fingerprinted_cache(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, _, calls = configure_synthesis(tmp_path, monkeypatch)

    first = narration.synthesize(force=False)
    second = narration.synthesize(force=False)

    assert len(calls) == 1
    assert second == first
    assert len(first[0]["fingerprint"]) == 64
    assert len(first[0]["media_sha256"]) == 64
    assert len(first[0]["subtitles_sha256"]) == 64


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("id", "changed-id"),
        ("text", "Changed narration."),
        ("voice", "en-US-GuyNeural"),
        ("rate", "+5%"),
        ("pitch", "+1Hz"),
    ],
)
def test_synthesize_regenerates_when_scene_input_changes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    value: str,
) -> None:
    demo, _, calls = configure_synthesis(tmp_path, monkeypatch)
    narration.synthesize(force=False)
    write_scenes(demo, [{**VALID_SCENE, field: value}])

    narration.synthesize(force=False)

    assert len(calls) == 2


def test_pause_change_updates_manifest_without_regenerating_media(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo, _, calls = configure_synthesis(tmp_path, monkeypatch)
    first = narration.synthesize(force=False)
    write_scenes(demo, [{**VALID_SCENE, "pause_after_ms": 750}])

    second = narration.synthesize(force=False)

    assert len(calls) == 1
    assert second[0]["fingerprint"] == first[0]["fingerprint"]
    assert second[0]["pause_after_ms"] == 750


def test_synthesize_rejects_empty_cached_subtitle_and_regenerates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, audio, calls = configure_synthesis(tmp_path, monkeypatch)
    narration.synthesize(force=False)
    (audio / "00-home.srt").write_bytes(b"")

    narration.synthesize(force=False)

    assert len(calls) == 2
    assert (audio / "00-home.srt").stat().st_size > 0


def test_failed_subprocess_preserves_old_finals(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, audio, _ = configure_synthesis(tmp_path, monkeypatch)
    narration.synthesize(force=False)
    media = audio / "00-home.mp3"
    subtitles = audio / "00-home.srt"
    timing = audio / "timing.json"
    old_files = (media.read_bytes(), subtitles.read_bytes(), timing.read_bytes())

    def fail_after_partial_write(command: list[str], check: bool) -> None:
        Path(command[command.index("--write-media") + 1]).write_bytes(b"partial")
        Path(command[command.index("--write-subtitles") + 1]).write_bytes(b"partial")
        raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(narration.subprocess, "run", fail_after_partial_write)

    with pytest.raises(subprocess.CalledProcessError):
        narration.synthesize(force=True)

    assert (media.read_bytes(), subtitles.read_bytes(), timing.read_bytes()) == old_files
    assert not list(audio.glob(".*"))


def test_empty_generated_subtitle_is_rejected_and_cleaned_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, audio, _ = configure_synthesis(tmp_path, monkeypatch)

    def write_empty_subtitle(command: list[str], check: bool) -> None:
        Path(command[command.index("--write-media") + 1]).write_bytes(b"media")
        Path(command[command.index("--write-subtitles") + 1]).write_bytes(b"")

    monkeypatch.setattr(narration.subprocess, "run", write_empty_subtitle)

    with pytest.raises(ValueError, match="non-empty"):
        narration.synthesize(force=False)

    assert not (audio / "00-home.mp3").exists()
    assert not (audio / "00-home.srt").exists()
    assert not list(audio.glob(".*"))


def test_corrupt_generated_subtitle_is_rejected_and_cleaned_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, audio, _ = configure_synthesis(tmp_path, monkeypatch)

    def write_corrupt_subtitle(command: list[str], check: bool) -> None:
        Path(command[command.index("--write-media") + 1]).write_bytes(b"media")
        Path(command[command.index("--write-subtitles") + 1]).write_text(
            "not a timed subtitle",
            encoding="utf-8",
        )

    monkeypatch.setattr(narration.subprocess, "run", write_corrupt_subtitle)

    with pytest.raises(ValueError, match="valid timed SRT"):
        narration.synthesize(force=False)

    assert not (audio / "00-home.mp3").exists()
    assert not (audio / "00-home.srt").exists()
    assert not list(audio.glob(".*"))


def test_failed_probe_preserves_old_finals_and_cleans_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, audio, _ = configure_synthesis(tmp_path, monkeypatch)
    narration.synthesize(force=False)
    media = audio / "00-home.mp3"
    subtitles = audio / "00-home.srt"
    old_files = (media.read_bytes(), subtitles.read_bytes())

    def fail_probe(path: Path) -> float:
        raise subprocess.CalledProcessError(1, ["ffprobe", str(path)])

    monkeypatch.setattr(narration, "duration", fail_probe)

    with pytest.raises(subprocess.CalledProcessError):
        narration.synthesize(force=True)

    assert (media.read_bytes(), subtitles.read_bytes()) == old_files
    assert not list(audio.glob(".*"))


def test_failed_run_keeps_manifest_atomic_and_mixed_outputs_are_not_cached(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    scenes = [VALID_SCENE, {**VALID_SCENE, "id": "close"}]
    demo, audio, calls = configure_synthesis(tmp_path, monkeypatch, scenes)
    narration.synthesize(force=False)
    old_timing = (audio / "timing.json").read_bytes()
    write_scenes(
        demo,
        [
            {**VALID_SCENE, "text": "Changed home."},
            {**VALID_SCENE, "id": "close", "text": "Changed close."},
        ],
    )
    forced_calls = 0

    def fail_second_scene(command: list[str], check: bool) -> None:
        nonlocal forced_calls
        forced_calls += 1
        media = Path(command[command.index("--write-media") + 1])
        subtitles = Path(command[command.index("--write-subtitles") + 1])
        media.write_bytes(b"new-media")
        subtitles.write_text(VALID_SRT, encoding="utf-8")
        if forced_calls == 2:
            raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(narration.subprocess, "run", fail_second_scene)
    with pytest.raises(subprocess.CalledProcessError):
        narration.synthesize(force=True)

    assert (audio / "timing.json").read_bytes() == old_timing

    successful_calls: list[list[str]] = []

    def succeed(command: list[str], check: bool) -> None:
        successful_calls.append(command)
        media = Path(command[command.index("--write-media") + 1])
        subtitles = Path(command[command.index("--write-subtitles") + 1])
        media.write_bytes(b"recovered-media")
        subtitles.write_text(VALID_SRT, encoding="utf-8")

    monkeypatch.setattr(narration.subprocess, "run", succeed)
    narration.synthesize(force=False)

    assert len(calls) == 2
    assert len(successful_calls) == 2


@pytest.mark.parametrize("scene_id", ["../winner", "bad/name", "bad\\name"])
def test_scene_stem_rejects_unsafe_scene_ids(scene_id: str) -> None:
    with pytest.raises(ValueError, match="filename-safe"):
        scene_stem(3, scene_id)


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
