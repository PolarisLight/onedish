from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Scene:
    id: str
    text: str
    voice: str
    rate: str
    pitch: str
    pause_after_ms: int


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
