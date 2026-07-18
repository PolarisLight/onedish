from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
BUILD = DEMO / ".build"
EXPECTED_SCENES = [
    "home",
    "context",
    "elimination",
    "winner",
    "orbit",
    "privacy",
    "close",
]
FORBIDDEN_NARRATION = [
    "Synthetic demo context",
    "GPT-5.6",
    "future app",
]
CHINESE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")


def validate_probe(probe: dict[str, object]) -> list[str]:
    errors: list[str] = []
    format_data = probe.get("format", {})
    try:
        duration = float(format_data.get("duration", 0))  # type: ignore[union-attr]
    except (TypeError, ValueError, AttributeError):
        duration = 0
    if not 120 <= duration < 180:
        errors.append("duration must be between 120 and 179 seconds")

    streams = probe.get("streams", [])
    if not isinstance(streams, list):
        streams = []
    videos = [
        stream
        for stream in streams
        if isinstance(stream, dict) and stream.get("codec_type") == "video"
    ]
    audios = [
        stream
        for stream in streams
        if isinstance(stream, dict) and stream.get("codec_type") == "audio"
    ]
    if (
        len(videos) != 1
        or videos[0].get("codec_name") != "h264"
        or (videos[0].get("width"), videos[0].get("height")) != (1920, 1080)
    ):
        errors.append("video must be one 1920x1080 H.264 stream")
    if not any(
        audio.get("codec_name") == "aac" and audio.get("sample_rate") == "48000"
        for audio in audios
    ):
        errors.append("audio must include AAC at 48 kHz")
    return errors


def _read_text(path: Path, label: str, errors: list[str]) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"unable to read {label}: {exc}")
        return ""


def _read_json(path: Path, label: str, errors: list[str]) -> Any:
    text = _read_text(path, label, errors)
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        errors.append(f"invalid {label} JSON: {exc}")
        return None


def validate_delivery_artifacts(
    captions_path: Path,
    timeline_path: Path,
    narration_path: Path,
) -> list[str]:
    errors: list[str] = []
    captions = _read_text(captions_path, "captions", errors)
    if "Food apps don't solve indecision." not in captions:
        errors.append("captions must contain the opening phrase")
    if "stop browsing, and eat this." not in captions:
        errors.append("captions must contain the closing phrase")

    timeline = _read_json(timeline_path, "capture timeline", errors)
    if not isinstance(timeline, dict) or timeline.get("language") != "en":
        errors.append("capture timeline language must be en")
    raw_scenes = timeline.get("scenes", []) if isinstance(timeline, dict) else []
    scene_ids = [
        scene.get("id") for scene in raw_scenes if isinstance(scene, dict)
    ] if isinstance(raw_scenes, list) else []
    if scene_ids != EXPECTED_SCENES:
        errors.append("capture timeline must contain all seven scenes in order")

    narration = _read_json(narration_path, "narration", errors)
    narration_text = " ".join(
        str(scene.get("text", ""))
        for scene in narration
        if isinstance(scene, dict)
    ) if isinstance(narration, list) else ""
    lower_text = narration_text.casefold()
    for phrase in FORBIDDEN_NARRATION:
        if phrase.casefold() in lower_text:
            errors.append(f"narration contains forbidden phrase: {phrase}")
    if CHINESE.search(narration_text):
        errors.append("narration must not contain Chinese characters")
    return errors


def probe_media(path: Path) -> dict[str, object]:
    output = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        text=True,
    )
    parsed = json.loads(output)
    if not isinstance(parsed, dict):
        raise ValueError("ffprobe returned a non-object result")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the OneDish demo master")
    parser.add_argument("video", type=Path)
    args = parser.parse_args()

    errors: list[str] = []
    try:
        probe = probe_media(args.video)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError, ValueError) as exc:
        probe = {}
        errors.append(f"unable to probe video: {exc}")
    errors.extend(validate_probe(probe))
    errors.extend(
        validate_delivery_artifacts(
            BUILD / "captions.srt",
            BUILD / "capture" / "capture-timeline.json",
            DEMO / "narration.json",
        )
    )
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    duration = float(probe["format"]["duration"])  # type: ignore[index]
    print(f"Duration: {duration:.3f} seconds")
    print("Demo video validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
