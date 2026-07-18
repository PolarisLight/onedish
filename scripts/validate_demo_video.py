from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

try:
    from .burn_captions import _entries
    from .demo_video_model import load_capture_timeline, load_scenes
except ImportError:
    from burn_captions import _entries
    from demo_video_model import load_capture_timeline, load_scenes


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
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


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _artifact_record(path: Path, filename: str | None = None) -> dict[str, object]:
    return {
        "filename": filename or path.name,
        "sha256": _sha256(path),
        "size_bytes": path.stat().st_size,
    }


def build_delivery_manifest(
    master: Path,
    captions: Path,
    timeline: Path,
    narration: Path,
    expected_media: dict[str, object],
    filenames: dict[str, str] | None = None,
) -> dict[str, object]:
    filenames = filenames or {}
    return {
        "schema_version": 1,
        "expected_media": expected_media,
        "artifacts": {
            "master": _artifact_record(master, filenames.get("master")),
            "captions": _artifact_record(captions, filenames.get("captions")),
            "capture_timeline": _artifact_record(
                timeline, filenames.get("capture_timeline")
            ),
            "narration": _artifact_record(narration, filenames.get("narration")),
        },
    }


def write_delivery_manifest(path: Path, manifest: dict[str, object]) -> None:
    """Publish deterministic JSON without exposing a partially written manifest."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    with tempfile.NamedTemporaryFile(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def manifest_path_for(master: Path) -> Path:
    return master.with_name(f"{master.stem}.manifest.json")


def delivery_sidecar_paths(master: Path) -> tuple[Path, Path]:
    return (
        master.with_name(f"{master.stem}.captions.srt"),
        master.with_name(f"{master.stem}.capture-timeline.json"),
    )


def publish_delivery_bundle(
    staged_master: Path,
    staged_captions: Path,
    source_timeline: Path,
    narration: Path,
    output_master: Path,
    *,
    probe: Any = None,
    manifest_writer: Any = None,
    replace: Any = None,
) -> None:
    """Install the complete delivery bundle or restore the prior bytes."""
    probe = probe or probe_media
    manifest_writer = manifest_writer or write_delivery_manifest
    replace = replace or os.replace
    output_master = output_master.resolve()
    output_master.parent.mkdir(parents=True, exist_ok=True)
    output_captions, output_timeline = delivery_sidecar_paths(output_master)
    output_manifest = manifest_path_for(output_master)
    destinations = {
        "master": output_master,
        "captions": output_captions,
        "capture_timeline": output_timeline,
        "manifest": output_manifest,
    }
    token = uuid.uuid4().hex
    stages = {
        label: output_master.parent
        / f".{output_master.stem}.bundle-{token}.stage-{label}{destination.suffix}"
        for label, destination in destinations.items()
    }
    backups = {
        label: output_master.parent
        / f".{output_master.stem}.bundle-{token}.backup-{label}{destination.suffix}"
        for label, destination in destinations.items()
    }
    backed_up: list[str] = []
    installed: list[str] = []
    try:
        shutil.copyfile(staged_master, stages["master"])
        shutil.copyfile(staged_captions, stages["captions"])
        shutil.copyfile(source_timeline, stages["capture_timeline"])
        media_probe = probe(stages["master"])
        probe_errors = validate_probe(media_probe)
        if probe_errors:
            raise ValueError("staged master probe failed: " + "; ".join(probe_errors))
        manifest = build_delivery_manifest(
            stages["master"],
            stages["captions"],
            stages["capture_timeline"],
            narration,
            probe_invariants(media_probe),
            filenames={
                "master": output_master.name,
                "captions": output_captions.name,
                "capture_timeline": output_timeline.name,
                "narration": narration.name,
            },
        )
        manifest_writer(stages["manifest"], manifest)
        staged_manifest = json.loads(stages["manifest"].read_text(encoding="utf-8"))
        if staged_manifest != manifest:
            raise ValueError("staged manifest verification failed")

        for label, destination in destinations.items():
            if destination.exists():
                replace(destination, backups[label])
                backed_up.append(label)
        for label in ("master", "captions", "capture_timeline", "manifest"):
            replace(stages[label], destinations[label])
            installed.append(label)
    except BaseException:
        for label in reversed(installed):
            destinations[label].unlink(missing_ok=True)
        for label in reversed(backed_up):
            replace(backups[label], destinations[label])
        raise
    finally:
        for path in (*stages.values(), *backups.values()):
            path.unlink(missing_ok=True)


def validate_delivery_manifest(
    manifest_path: Path,
    master: Path,
    captions: Path,
    timeline: Path,
    narration: Path,
) -> list[str]:
    errors: list[str] = []
    manifest = _read_json(manifest_path, "delivery manifest", errors)
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        errors.append("delivery manifest schema_version must be 1")
        return errors
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        errors.append("delivery manifest artifacts must be an object")
        return errors
    actual = {
        "master": master,
        "captions": captions,
        "capture_timeline": timeline,
        "narration": narration,
    }
    for label, path in actual.items():
        record = artifacts.get(label)
        if not isinstance(record, dict):
            errors.append(f"delivery manifest is missing {label}")
            continue
        try:
            size = path.stat().st_size
            digest = _sha256(path)
        except OSError as exc:
            errors.append(f"unable to hash {label}: {exc}")
            continue
        if record.get("filename") != path.name:
            errors.append(f"{label} filename does not match delivery manifest")
        if record.get("size_bytes") != size:
            errors.append(f"{label} size does not match delivery manifest")
        if record.get("sha256") != digest:
            display = "master" if label == "master" else label
            errors.append(f"{display} SHA-256 does not match delivery manifest")
    return errors


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
    caption_text = ""
    try:
        caption_text = " ".join(entry[2] for entry in _entries(captions_path))
    except (OSError, UnicodeError, ValueError) as exc:
        errors.append(f"captions are malformed: {exc}")
    if CHINESE.search(caption_text):
        errors.append("captions must not contain Chinese characters")

    try:
        load_capture_timeline(timeline_path)
    except (OSError, TypeError, ValueError) as exc:
        errors.append(f"invalid capture timeline: {exc}")

    narration = _read_json(narration_path, "narration", errors)
    narration_text = " ".join(
        str(scene.get("text", ""))
        for scene in narration
        if isinstance(scene, dict)
    ) if isinstance(narration, list) else ""
    try:
        scenes = load_scenes(narration_path)
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        scenes = []
        errors.append(f"invalid narration: {exc}")
    if [scene.id for scene in scenes] != EXPECTED_SCENES:
        errors.append("narration must contain all seven scenes in order")
    lower_text = narration_text.casefold()
    for phrase in FORBIDDEN_NARRATION:
        if phrase.casefold() in lower_text:
            errors.append(f"narration contains forbidden phrase: {phrase}")
    if CHINESE.search(narration_text):
        errors.append("narration must not contain Chinese characters")
    if caption_text and " ".join(caption_text.split()) != " ".join(
        narration_text.split()
    ):
        errors.append("caption transcript must exactly match narration")
    return errors


def probe_invariants(probe: dict[str, object]) -> dict[str, object]:
    format_data = probe.get("format", {})
    streams = probe.get("streams", [])
    videos = [
        stream for stream in streams
        if isinstance(streams, list)
        and isinstance(stream, dict)
        and stream.get("codec_type") == "video"
    ]
    audios = [
        stream for stream in streams
        if isinstance(streams, list)
        and isinstance(stream, dict)
        and stream.get("codec_type") == "audio"
        and stream.get("codec_name") == "aac"
    ]
    duration = float(format_data.get("duration", 0)) if isinstance(format_data, dict) else 0
    video = videos[0] if videos else {}
    audio = audios[0] if audios else {}
    return {
        "duration_ms": round(duration * 1000),
        "video_codec": video.get("codec_name"),
        "width": video.get("width"),
        "height": video.get("height"),
        "audio_codec": audio.get("codec_name"),
        "audio_sample_rate": int(audio.get("sample_rate", 0)) if audio else 0,
    }


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
    manifest_path = manifest_path_for(args.video)
    captions_path, timeline_path = delivery_sidecar_paths(args.video)
    errors.extend(
        validate_delivery_manifest(
            manifest_path,
            args.video,
            captions_path,
            timeline_path,
            DEMO / "narration.json",
        )
    )
    manifest = _read_json(manifest_path, "delivery manifest", [])
    if isinstance(manifest, dict) and manifest.get("expected_media") != probe_invariants(probe):
        errors.append("probed media invariants do not match delivery manifest")
    errors.extend(
        validate_delivery_artifacts(
            captions_path,
            timeline_path,
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
