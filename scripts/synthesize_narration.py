from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
import uuid
from pathlib import Path

if __package__:
    from .demo_video_model import Scene, load_scenes
else:
    from demo_video_model import Scene, load_scenes


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
AUDIO = DEMO / ".build" / "audio"
SAFE_SCENE_ID = re.compile(r"[a-z0-9][a-z0-9-]*")
SRT_TIMING = re.compile(
    r"(?m)^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$"
)
SYNTHESIS_ENGINE = "edge-tts==7.2.8"


def scene_stem(index: int, scene_id: str) -> str:
    if SAFE_SCENE_ID.fullmatch(scene_id) is None:
        raise ValueError("Scene id must be filename-safe: [a-z0-9][a-z0-9-]*")
    return f"{index:02d}-{scene_id}"


def edge_tts_command(scene: Scene, media: Path, subtitles: Path) -> list[str]:
    return [
        "python",
        "-m",
        "edge_tts",
        "--voice",
        scene.voice,
        f"--rate={scene.rate}",
        f"--pitch={scene.pitch}",
        "--text",
        scene.text,
        "--write-media",
        str(media),
        "--write-subtitles",
        str(subtitles),
    ]


def duration(path: Path) -> float:
    result = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        text=True,
    )
    return float(result.strip())


def scene_fingerprint(scene: Scene) -> str:
    # Pauses affect the timeline manifest, not the synthesized media.
    inputs = {
        "engine": SYNTHESIS_ENGINE,
        "id": scene.id,
        "pitch": scene.pitch,
        "rate": scene.rate,
        "text": scene.text,
        "voice": scene.voice,
    }
    payload = json.dumps(inputs, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_non_empty(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def validate_subtitles(path: Path) -> None:
    if not is_non_empty(path):
        raise ValueError("Narration media and subtitles must be non-empty")
    try:
        contents = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise ValueError("Narration subtitles must be valid timed SRT") from error
    if SRT_TIMING.search(contents) is None:
        raise ValueError("Narration subtitles must be valid timed SRT")


def positive_duration(path: Path) -> float:
    value = duration(path)
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"Narration media must have positive duration: {path.name}")
    return value


def load_timing() -> dict[str, dict[str, object]]:
    path = AUDIO / "timing.json"
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(rows, list):
        return {}
    return {
        row["id"]: row
        for row in rows
        if isinstance(row, dict) and isinstance(row.get("id"), str)
    }


def cached_duration(
    row: dict[str, object] | None,
    fingerprint: str,
    media: Path,
    subtitles: Path,
) -> float | None:
    if (
        row is None
        or row.get("fingerprint") != fingerprint
        or row.get("media") != media.name
        or row.get("subtitles") != subtitles.name
        or not is_non_empty(media)
        or not is_non_empty(subtitles)
    ):
        return None
    try:
        if row.get("media_sha256") != file_sha256(media):
            return None
        if row.get("subtitles_sha256") != file_sha256(subtitles):
            return None
        validate_subtitles(subtitles)
        return positive_duration(media)
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def temporary_path(stem: str, suffix: str) -> Path:
    return AUDIO / f".{stem}.{uuid.uuid4().hex}{suffix}"


def remove_if_present(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def generate_scene(scene: Scene, stem: str, media: Path, subtitles: Path) -> float:
    temporary_media = temporary_path(stem, ".mp3")
    temporary_subtitles = temporary_path(stem, ".srt")
    try:
        command = edge_tts_command(scene, temporary_media, temporary_subtitles)
        command[0] = sys.executable
        subprocess.run(command, check=True)
        if not is_non_empty(temporary_media) or not is_non_empty(temporary_subtitles):
            raise ValueError("Narration media and subtitles must be non-empty")
        validate_subtitles(temporary_subtitles)
        media_duration = positive_duration(temporary_media)
        temporary_media.replace(media)
        temporary_subtitles.replace(subtitles)
        return media_duration
    finally:
        remove_if_present(temporary_media)
        remove_if_present(temporary_subtitles)


def write_timing(timing: list[dict[str, object]]) -> None:
    temporary_timing = temporary_path("timing", ".json")
    try:
        temporary_timing.write_text(
            json.dumps(timing, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary_timing.replace(AUDIO / "timing.json")
    finally:
        remove_if_present(temporary_timing)


def synthesize(force: bool) -> list[dict[str, object]]:
    scenes = load_scenes(DEMO / "narration.json")
    AUDIO.mkdir(parents=True, exist_ok=True)
    cached_rows = load_timing()
    timing: list[dict[str, object]] = []

    for index, scene in enumerate(scenes):
        stem = scene_stem(index, scene.id)
        media = AUDIO / f"{stem}.mp3"
        subtitles = AUDIO / f"{stem}.srt"
        fingerprint = scene_fingerprint(scene)
        media_duration = None
        if not force:
            media_duration = cached_duration(
                cached_rows.get(scene.id),
                fingerprint,
                media,
                subtitles,
            )
        if media_duration is None:
            media_duration = generate_scene(scene, stem, media, subtitles)
        timing.append(
            {
                "id": scene.id,
                "media": media.name,
                "subtitles": subtitles.name,
                "duration": media_duration,
                "pause_after_ms": scene.pause_after_ms,
                "fingerprint": fingerprint,
                "media_sha256": file_sha256(media),
                "subtitles_sha256": file_sha256(subtitles),
            }
        )

    write_timing(timing)
    return timing


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    rows = synthesize(args.force)
    print(f"Synthesized {len(rows)} narration scenes with timed subtitles")
