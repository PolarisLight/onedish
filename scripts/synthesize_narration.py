from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

if __package__:
    from .demo_video_model import Scene, load_scenes
else:
    from demo_video_model import Scene, load_scenes


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
AUDIO = DEMO / ".build" / "audio"


def scene_stem(index: int, scene_id: str) -> str:
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


def synthesize(force: bool) -> list[dict[str, object]]:
    scenes = load_scenes(DEMO / "narration.json")
    AUDIO.mkdir(parents=True, exist_ok=True)
    timing: list[dict[str, object]] = []

    for index, scene in enumerate(scenes):
        stem = scene_stem(index, scene.id)
        media = AUDIO / f"{stem}.mp3"
        subtitles = AUDIO / f"{stem}.srt"
        if force or not media.is_file() or not subtitles.is_file():
            command = edge_tts_command(scene, media, subtitles)
            command[0] = sys.executable
            subprocess.run(command, check=True)
        timing.append(
            {
                "id": scene.id,
                "media": media.name,
                "subtitles": subtitles.name,
                "duration": duration(media),
                "pause_after_ms": scene.pause_after_ms,
            }
        )

    (AUDIO / "timing.json").write_text(
        json.dumps(timing, indent=2) + "\n",
        encoding="utf-8",
    )
    return timing


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    rows = synthesize(args.force)
    print(f"Synthesized {len(rows)} narration scenes with timed subtitles")
