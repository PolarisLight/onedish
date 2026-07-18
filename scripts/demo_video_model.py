from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CAPTURE_SCENE_ORDER = (
    "home",
    "context",
    "elimination",
    "winner",
    "orbit",
    "privacy",
    "close",
)


@dataclass(frozen=True)
class Scene:
    id: str
    text: str
    voice: str
    rate: str
    pitch: str
    pause_after_ms: int


@dataclass(frozen=True)
class CaptureScene:
    id: str
    start: float
    end: float


@dataclass(frozen=True)
class CaptureTimeline:
    language: str
    scenes: list[CaptureScene]


def load_capture_timeline(path: Path) -> CaptureTimeline:
    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not read capture timeline {path}: {error}") from error

    if not isinstance(raw, dict):
        raise ValueError("Capture timeline must be a JSON object")
    if raw.get("language") != "en":
        raise ValueError("Capture timeline language must be en")
    raw_scenes = raw.get("scenes")
    if not isinstance(raw_scenes, list):
        raise ValueError("Capture timeline scenes must be a list")
    if [scene.get("id") if isinstance(scene, dict) else None for scene in raw_scenes] != list(
        CAPTURE_SCENE_ORDER
    ):
        raise ValueError(
            "Capture timeline scene order must be: " + ", ".join(CAPTURE_SCENE_ORDER)
        )

    scenes: list[CaptureScene] = []
    for index, item in enumerate(raw_scenes):
        if not isinstance(item, dict) or set(item) != {"id", "start", "end"}:
            raise ValueError(f"Capture scene {index} must contain only id, start, and end")
        start = item["start"]
        end = item["end"]
        if (
            isinstance(start, bool)
            or isinstance(end, bool)
            or not isinstance(start, (int, float))
            or not isinstance(end, (int, float))
            or not math.isfinite(start)
            or not math.isfinite(end)
        ):
            raise ValueError(f"Capture scene {item['id']} timestamps must be finite numbers")
        scene = CaptureScene(id=item["id"], start=float(start), end=float(end))
        if scene.end <= scene.start:
            raise ValueError(f"Capture scene {scene.id} must have a positive duration")
        if scenes and scene.start < scenes[-1].end:
            raise ValueError(
                f"Capture scenes {scenes[-1].id} and {scene.id} overlap"
            )
        scenes.append(scene)

    return CaptureTimeline(language="en", scenes=scenes)


def load_scenes(path: Path) -> list[Scene]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    scenes = [Scene(**item) for item in raw]
    if not scenes:
        raise ValueError("Narration requires at least one scene")
    if any(not scene.id.strip() for scene in scenes):
        raise ValueError("Every scene requires a non-empty scene id")
    if any(not scene.text.strip() for scene in scenes):
        raise ValueError("Every scene requires non-empty scene text")
    if any(
        not scene.text.isascii()
        or not scene.voice.startswith("en-")
        or not scene.voice.endswith("Neural")
        or scene.voice == "Samantha"
        for scene in scenes
    ):
        raise ValueError("Every scene requires English text and an English neural voice")
    if len({scene.id for scene in scenes}) != len(scenes):
        raise ValueError("Scene ids must be unique")
    if any(scene.pause_after_ms < 0 for scene in scenes):
        raise ValueError("Scene pauses must be non-negative")
    return scenes
