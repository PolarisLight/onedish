from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

if __package__:
    from .demo_video_model import Scene, load_scenes
else:
    from demo_video_model import Scene, load_scenes


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
AUDIO = DEMO / ".build" / "audio"
SAFE_SCENE_ID = re.compile(r"[a-z0-9][a-z0-9-]*")
SRT_TIMESTAMP = re.compile(
    r"(\d{2}):([0-5]\d):([0-5]\d),(\d{3})"
    r" --> "
    r"(\d{2}):([0-5]\d):([0-5]\d),(\d{3})"
)
SYNTHESIS_ENGINE = "edge-tts==7.2.8"


@dataclass(frozen=True)
class StagedScene:
    temporary_media: Path
    temporary_subtitles: Path
    media: Path
    subtitles: Path
    duration: float
    media_sha256: str
    subtitles_sha256: str


@dataclass(frozen=True)
class Backup:
    final: Path
    path: Path
    existed: bool


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

    blocks = re.split(r"\n[ \t]*\n", contents.strip())
    previous_end = -1
    for expected_index, block in enumerate(blocks, start=1):
        lines = block.splitlines()
        if len(lines) < 3 or lines[0].strip() != str(expected_index):
            raise ValueError("Narration subtitles must be valid timed SRT: cue index")
        match = SRT_TIMESTAMP.fullmatch(lines[1].strip())
        if match is None:
            raise ValueError("Narration subtitles must be valid timed SRT: timestamp")
        values = [int(value) for value in match.groups()]
        start = ((values[0] * 60 + values[1]) * 60 + values[2]) * 1000 + values[3]
        end = ((values[4] * 60 + values[5]) * 60 + values[6]) * 1000 + values[7]
        if start >= end:
            raise ValueError("Narration subtitles must be valid timed SRT: cue range")
        if start < previous_end:
            raise ValueError(
                "Narration subtitles must be valid timed SRT: ordered non-overlapping cues"
            )
        if not any(line.strip() for line in lines[2:]):
            raise ValueError("Narration subtitles must be valid timed SRT: caption text")
        previous_end = end


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


def stage_scene(scene: Scene, stem: str, media: Path, subtitles: Path) -> StagedScene:
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
        return StagedScene(
            temporary_media=temporary_media,
            temporary_subtitles=temporary_subtitles,
            media=media,
            subtitles=subtitles,
            duration=media_duration,
            media_sha256=file_sha256(temporary_media),
            subtitles_sha256=file_sha256(temporary_subtitles),
        )
    except BaseException:
        remove_if_present(temporary_media)
        remove_if_present(temporary_subtitles)
        raise


def stage_timing(timing: list[dict[str, object]]) -> Path:
    temporary_timing = temporary_path("timing", ".json")
    try:
        temporary_timing.write_text(
            json.dumps(timing, indent=2) + "\n",
            encoding="utf-8",
        )
        return temporary_timing
    except BaseException:
        remove_if_present(temporary_timing)
        raise


def atomic_replace(source: Path, destination: Path) -> None:
    source.replace(destination)


def restore_replace(source: Path, destination: Path) -> None:
    source.replace(destination)


def restore_backup(backup: Backup) -> None:
    if backup.existed:
        if backup.path.exists():
            remove_if_present(backup.final)
            restore_replace(backup.path, backup.final)
    else:
        remove_if_present(backup.final)


def commit_run(staged: list[StagedScene], temporary_timing: Path) -> None:
    timing = AUDIO / "timing.json"
    timing_backup = Backup(
        final=timing,
        path=temporary_path("backup-timing", ".json"),
        existed=timing.is_file(),
    )
    final_backups = [
        Backup(
            final=final,
            path=temporary_path(f"backup-{final.stem}", final.suffix),
            existed=final.is_file(),
        )
        for scene in staged
        for final in (scene.media, scene.subtitles)
    ]
    cleanup_backups = False
    try:
        if timing_backup.existed:
            atomic_replace(timing_backup.final, timing_backup.path)
        for backup in final_backups:
            if backup.existed:
                atomic_replace(backup.final, backup.path)
        for scene in staged:
            atomic_replace(scene.temporary_media, scene.media)
            atomic_replace(scene.temporary_subtitles, scene.subtitles)
        atomic_replace(temporary_timing, timing)
        cleanup_backups = True
    except BaseException:
        for backup in reversed(final_backups):
            restore_backup(backup)
        restore_backup(timing_backup)
        cleanup_backups = True
        raise
    finally:
        if cleanup_backups:
            for backup in [*final_backups, timing_backup]:
                remove_if_present(backup.path)


def synthesize(force: bool) -> list[dict[str, object]]:
    scenes = load_scenes(DEMO / "narration.json")
    AUDIO.mkdir(parents=True, exist_ok=True)
    cached_rows = load_timing()
    timing: list[dict[str, object]] = []
    staged: list[StagedScene] = []
    temporary_timing: Path | None = None

    try:
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
                staged_scene = stage_scene(scene, stem, media, subtitles)
                staged.append(staged_scene)
                media_duration = staged_scene.duration
                media_hash = staged_scene.media_sha256
                subtitles_hash = staged_scene.subtitles_sha256
            else:
                media_hash = file_sha256(media)
                subtitles_hash = file_sha256(subtitles)
            timing.append(
                {
                    "id": scene.id,
                    "media": media.name,
                    "subtitles": subtitles.name,
                    "duration": media_duration,
                    "pause_after_ms": scene.pause_after_ms,
                    "fingerprint": fingerprint,
                    "media_sha256": media_hash,
                    "subtitles_sha256": subtitles_hash,
                }
            )

        temporary_timing = stage_timing(timing)
        commit_run(staged, temporary_timing)
        return timing
    finally:
        for scene in staged:
            remove_if_present(scene.temporary_media)
            remove_if_present(scene.temporary_subtitles)
        if temporary_timing is not None:
            remove_if_present(temporary_timing)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    rows = synthesize(args.force)
    print(f"Synthesized {len(rows)} narration scenes with timed subtitles")
