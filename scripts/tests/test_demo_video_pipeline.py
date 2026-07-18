import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.demo_video_model import (
    CaptureScene,
    CaptureTimeline,
    Scene,
    load_capture_timeline,
    load_scenes,
)
import scripts.synthesize_narration as narration
import scripts.generate_demo_bed as bed
from scripts.synthesize_narration import edge_tts_command, scene_stem
from scripts.generate_demo_bed import music_filter, validate_duration
from scripts.build_demo_video import (
    fit_caption_cues,
    scene_output_duration,
    staged_master_for,
    stamp,
)
from scripts.burn_captions import _entries, master_output_duration, wrap_caption


NARRATION_PATH = ROOT / "docs" / "demo" / "narration.json"


VALID_CAPTURE_SCENES = [
    {"id": scene_id, "start": float(index), "end": float(index) + 0.75}
    for index, scene_id in enumerate(
        ["home", "context", "elimination", "winner", "orbit", "privacy", "close"]
    )
]


def test_scene_duration_includes_pause_and_visual_guard() -> None:
    assert scene_output_duration(audio=18.0, pause_ms=700, visual=25.0) == pytest.approx(
        18.7
    )
    with pytest.raises(ValueError, match="too short"):
        scene_output_duration(audio=25.0, pause_ms=700, visual=20.0)


def test_caption_stamp_and_two_line_wrap() -> None:
    assert stamp(62.345) == "00:01:02,345"
    lines = wrap_caption(
        "OneDish gives you one inspectable answer instead of another feed."
    )
    assert 1 <= len(lines) <= 2
    assert all(len(line) <= 44 for line in lines)


def test_long_tts_cue_splits_without_losing_its_real_time_range() -> None:
    cues = fit_caption_cues(
        2.0,
        8.0,
        "Optional context can sharpen the choice: budget, time, allergies, "
        "cravings, and eventually wellness signals.",
    )

    assert len(cues) == 2
    assert cues[0][0] == 2.0
    assert cues[-1][1] == 8.0
    assert cues[0][1] == cues[1][0]
    assert " ".join(cue[2] for cue in cues).replace("  ", " ") == (
        "Optional context can sharpen the choice: budget, time, allergies, "
        "cravings, and eventually wellness signals."
    )
    assert all(len(line) <= 52 for cue in cues for line in wrap_caption(cue[2]))


def test_master_stops_with_the_soundtrack_instead_of_hanging_on_video_tail() -> None:
    assert master_output_duration(visuals=131.1, soundtrack=128.981) == pytest.approx(
        128.981
    )
    with pytest.raises(ValueError, match="shorter"):
        master_output_duration(visuals=128.0, soundtrack=129.0)


def test_staged_master_cleanup_never_matches_foreign_files_or_final_output(
    tmp_path: Path,
) -> None:
    output = tmp_path / "demo[*]?.mp4"
    output.write_bytes(b"accepted master")
    foreign = tmp_path / ".demo[*]?-stage-foreign.mp4"
    foreign.write_bytes(b"another build")

    with pytest.raises(RuntimeError, match="injected build failure"):
        with staged_master_for(output) as own_stage:
            own_stage.write_bytes(b"partial master")
            raise RuntimeError("injected build failure")

    assert output.read_bytes() == b"accepted master"
    assert foreign.read_bytes() == b"another build"
    assert not own_stage.exists()


@pytest.mark.parametrize(
    "contents",
    [
        "",
        "1\n00:00:00,000 --> 00:00:01,000\n   \n",
        "1\n00:00:00.000 --> 00:00:01,000\nBad timestamp\n",
        "1\n00:00:01,000 --> 00:00:01,000\nZero duration\n",
        (
            "1\n00:00:00,000 --> 00:00:02,000\nFirst\n\n"
            "2\n00:00:01,500 --> 00:00:03,000\nOverlap\n"
        ),
        (
            "1\n00:00:02,000 --> 00:00:03,000\nFirst\n\n"
            "2\n00:00:00,000 --> 00:00:01,000\nOut of order\n"
        ),
    ],
    ids=[
        "empty-file",
        "empty-text",
        "malformed-timestamp",
        "non-positive-range",
        "overlap",
        "out-of-order",
    ],
)
def test_standalone_caption_burn_rejects_every_malformed_cue(
    tmp_path: Path, contents: str
) -> None:
    subtitles = tmp_path / "bad.srt"
    subtitles.write_text(contents, encoding="utf-8")

    with pytest.raises(ValueError, match="Malformed caption cue"):
        _entries(subtitles)


def write_capture_timeline(
    tmp_path: Path,
    *,
    language: str = "en",
    scenes: list[dict[str, object]] | None = None,
) -> Path:
    path = tmp_path / "capture-timeline.json"
    path.write_text(
        json.dumps({"language": language, "scenes": scenes or VALID_CAPTURE_SCENES}),
        encoding="utf-8",
    )
    return path


def test_load_capture_timeline_accepts_ordered_english_scenes(tmp_path: Path) -> None:
    path = write_capture_timeline(tmp_path)

    timeline = load_capture_timeline(path)

    assert timeline == CaptureTimeline(
        language="en",
        scenes=[CaptureScene(**scene) for scene in VALID_CAPTURE_SCENES],
    )


@pytest.mark.parametrize(
    ("language", "scenes", "message"),
    [
        ("zh", VALID_CAPTURE_SCENES, "language must be en"),
        (
            "en",
            [VALID_CAPTURE_SCENES[1], VALID_CAPTURE_SCENES[0], *VALID_CAPTURE_SCENES[2:]],
            "scene order",
        ),
    ],
)
def test_load_capture_timeline_rejects_wrong_language_or_order(
    tmp_path: Path,
    language: str,
    scenes: list[dict[str, object]],
    message: str,
) -> None:
    path = write_capture_timeline(tmp_path, language=language, scenes=scenes)

    with pytest.raises(ValueError, match=message):
        load_capture_timeline(path)


@pytest.mark.parametrize("end", [0.0, -0.25])
def test_load_capture_timeline_rejects_non_positive_duration(
    tmp_path: Path, end: float
) -> None:
    scenes = [{**VALID_CAPTURE_SCENES[0], "end": end}, *VALID_CAPTURE_SCENES[1:]]
    path = write_capture_timeline(tmp_path, scenes=scenes)

    with pytest.raises(ValueError, match="positive duration"):
        load_capture_timeline(path)


def test_load_capture_timeline_rejects_overlapping_scenes(tmp_path: Path) -> None:
    scenes = [dict(scene) for scene in VALID_CAPTURE_SCENES]
    scenes[1]["start"] = scenes[0]["end"] - 0.1
    path = write_capture_timeline(tmp_path, scenes=scenes)

    with pytest.raises(ValueError, match="overlap"):
        load_capture_timeline(path)


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


def public_audio_snapshot(audio: Path) -> dict[str, bytes]:
    return {path.name: path.read_bytes() for path in sorted(audio.glob("*"))}


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


@pytest.mark.parametrize(
    "failed_destination",
    ["00-home.srt", "01-close.mp3", "timing.json"],
    ids=["subtitle-install", "later-scene-install", "manifest-install"],
)
def test_commit_failure_restores_all_public_files_byte_for_byte(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failed_destination: str,
) -> None:
    scenes = [VALID_SCENE, {**VALID_SCENE, "id": "close"}]
    _, audio, _ = configure_synthesis(tmp_path, monkeypatch, scenes)
    narration.synthesize(force=False)
    before = public_audio_snapshot(audio)
    original_replace = getattr(
        narration,
        "atomic_replace",
        lambda source, destination: Path(source).replace(destination),
    )

    def fail_selected_replace(source: Path, destination: Path) -> None:
        if destination.name == failed_destination:
            raise OSError(f"injected failure for {failed_destination}")
        original_replace(source, destination)

    monkeypatch.setattr(
        narration,
        "atomic_replace",
        fail_selected_replace,
        raising=False,
    )

    with pytest.raises(OSError, match="injected failure"):
        narration.synthesize(force=True)

    assert public_audio_snapshot(audio) == before
    assert not list(audio.glob(".*"))


def test_staging_hash_failure_preserves_all_public_files_byte_for_byte(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    scenes = [VALID_SCENE, {**VALID_SCENE, "id": "close"}]
    _, audio, _ = configure_synthesis(tmp_path, monkeypatch, scenes)
    narration.synthesize(force=False)
    before = public_audio_snapshot(audio)
    original_hash = narration.file_sha256

    def fail_later_scene_hash(path: Path) -> str:
        if "01-close" in path.name and path.suffix == ".mp3":
            raise OSError("injected hash failure")
        return original_hash(path)

    monkeypatch.setattr(narration, "file_sha256", fail_later_scene_hash)

    with pytest.raises(OSError, match="injected hash failure"):
        narration.synthesize(force=True)

    assert public_audio_snapshot(audio) == before
    assert not list(audio.glob(".*"))


def test_manifest_install_failure_without_prior_run_leaves_no_public_outputs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, audio, _ = configure_synthesis(tmp_path, monkeypatch)
    original_replace = getattr(
        narration,
        "atomic_replace",
        lambda source, destination: Path(source).replace(destination),
    )

    def fail_manifest_replace(source: Path, destination: Path) -> None:
        if destination.name == "timing.json":
            raise OSError("injected manifest failure")
        original_replace(source, destination)

    monkeypatch.setattr(
        narration,
        "atomic_replace",
        fail_manifest_replace,
        raising=False,
    )

    with pytest.raises(OSError, match="injected manifest failure"):
        narration.synthesize(force=True)

    assert not list(audio.iterdir())


@pytest.mark.parametrize(
    "contents",
    [
        VALID_SRT + "\n2\nmalformed timestamp\nTrailing caption\n",
        "1\n00:00:00,000 --> 00:00:01,000\n",
        "00:00:00,000 --> 00:00:01,000\nMissing index\n",
        "1\n00:00:01,000 --> 00:00:01,000\nZero-length cue\n",
        (
            "1\n00:00:00,000 --> 00:00:02,000\nFirst\n\n"
            "2\n00:00:01,000 --> 00:00:03,000\nOverlapping\n"
        ),
        (
            "1\n00:00:02,000 --> 00:00:03,000\nFirst\n\n"
            "2\n00:00:00,000 --> 00:00:01,000\nOut of order\n"
        ),
    ],
    ids=[
        "malformed-trailing-cue",
        "missing-text",
        "missing-index",
        "non-positive-range",
        "overlap",
        "out-of-order",
    ],
)
def test_validate_subtitles_rejects_every_malformed_cue(
    tmp_path: Path, contents: str
) -> None:
    subtitles = tmp_path / "invalid.srt"
    subtitles.write_text(contents, encoding="utf-8")

    with pytest.raises(ValueError, match="SRT"):
        narration.validate_subtitles(subtitles)


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


def test_music_filter_is_restrained_and_fades() -> None:
    graph = music_filter(150.0)

    assert "aevalsrc" in graph
    assert "mod(t\\,2)" in graph
    assert "anoisesrc=color=pink" in graph
    assert "afade=t=in" in graph
    assert "afade=t=out:st=147" in graph
    assert "loudnorm=I=-34" in graph


@pytest.mark.parametrize("duration", [119.999, 179.001])
def test_music_bed_rejects_duration_outside_demo_window(duration: float) -> None:
    with pytest.raises(ValueError, match="120.*179"):
        validate_duration(duration)


@pytest.mark.parametrize("duration", [120.0, 135.04, 179.0])
def test_music_bed_accepts_duration_inside_demo_window(duration: float) -> None:
    assert validate_duration(duration) == duration


def test_generate_music_bed_uses_unique_atomic_wav_temps_and_pcm_contract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = tmp_path / "music-bed.wav"
    commands: list[list[str]] = []
    replacements: list[tuple[Path, Path]] = []
    real_replace = os.replace

    def fake_run(command: list[str], check: bool) -> None:
        assert check is True
        commands.append(command)
        Path(command[-1]).write_bytes(b"complete wav")

    def record_replace(source: Path, destination: Path) -> None:
        replacements.append((Path(source), Path(destination)))
        real_replace(source, destination)

    monkeypatch.setattr(bed.subprocess, "run", fake_run)
    monkeypatch.setattr(os, "replace", record_replace)

    bed.generate_music_bed(135.04, output)
    bed.generate_music_bed(135.04, output)

    temporary_paths = [Path(command[-1]) for command in commands]
    assert temporary_paths[0] != temporary_paths[1]
    assert commands[0][:-1] == commands[1][:-1]
    assert all(path.parent == output.parent for path in temporary_paths)
    assert all(path.suffix == ".wav" for path in temporary_paths)
    assert replacements == [(path, output) for path in temporary_paths]
    assert output.read_bytes() == b"complete wav"
    assert not any(path.exists() for path in temporary_paths)

    for command in commands:
        assert "anoisesrc=color=pink" in command[command.index("-filter_complex") + 1]
        assert "seed=104729" in command[command.index("-filter_complex") + 1]
        assert command[command.index("-ar") + 1] == "48000"
        assert command[command.index("-ac") + 1] == "2"
        assert command[command.index("-c:a") + 1] == "pcm_s16le"


def test_generate_music_bed_failure_preserves_output_and_cleans_own_temp(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = tmp_path / "music-bed.wav"
    output.write_bytes(b"accepted bed")
    attempted: list[Path] = []

    def fail_after_partial_write(command: list[str], check: bool) -> None:
        temporary = Path(command[-1])
        attempted.append(temporary)
        temporary.write_bytes(b"partial")
        raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(bed.subprocess, "run", fail_after_partial_write)

    with pytest.raises(subprocess.CalledProcessError):
        bed.generate_music_bed(135.04, output)

    assert output.read_bytes() == b"accepted bed"
    assert len(attempted) == 1
    assert not attempted[0].exists()


def test_generate_music_bed_rejects_non_wav_output_before_ffmpeg(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        bed.subprocess,
        "run",
        lambda *args, **kwargs: pytest.fail("ffmpeg must not run"),
    )

    with pytest.raises(ValueError, match=".wav"):
        bed.generate_music_bed(135.04, tmp_path / "music-bed.mp3")
