#!/usr/bin/env python3
"""Assemble real OneDish PWA frames, narration, and burned captions."""

from __future__ import annotations

import json
import argparse
import re
import shutil
import subprocess
from datetime import timedelta
from pathlib import Path

from burn_captions import burn_captions


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
WORK = DEMO / ".build"
OUTPUT = DEMO / "onedish-demo.mp4"


def run(*arguments: str) -> None:
    subprocess.run(arguments, check=True)


def duration(path: Path) -> float:
    result = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        text=True,
    )
    return float(result.strip())


def stamp(seconds: float) -> str:
    value = timedelta(seconds=max(0, seconds))
    total = int(value.total_seconds() * 1000)
    hours, rest = divmod(total, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    secs, millis = divmod(rest, 1_000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reuse-audio", action="store_true")
    arguments = parser.parse_args()
    scenes = json.loads((DEMO / "narration.json").read_text(encoding="utf-8"))
    if WORK.exists() and not arguments.reuse_audio:
        shutil.rmtree(WORK)
    WORK.mkdir(parents=True, exist_ok=True)
    concat_video: list[str] = []
    concat_audio: list[str] = []
    captions: list[str] = []
    offset = 0.0

    for index, scene in enumerate(scenes):
        name = f"{index:02}-{scene['scene']}"
        audio = WORK / f"{name}.aiff"
        if not arguments.reuse_audio or not audio.is_file():
            run("say", "-v", "Samantha", "-r", "140", "-o", str(audio), scene["text"])
        scene_duration = duration(audio) + 0.7
        frame = DEMO / "frames" / f"{scene['scene']}.png"
        video = WORK / f"{name}.mp4"
        video.unlink(missing_ok=True)
        filter_graph = (
            "[0:v]split=2[bg][fg];"
            "[bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=28:12,eq=brightness=-0.34[back];"
            "[fg]scale=-2:960:flags=lanczos,pad=620:1000:(ow-iw)/2:(oh-ih)/2:color=0x101310[phone];"
            "[back][phone]overlay=(W-w)/2:(H-h)/2,format=yuv420p[out]"
        )
        run(
            "ffmpeg", "-v", "error", "-loop", "1", "-i", str(frame), "-t", f"{scene_duration:.3f}",
            "-filter_complex", filter_graph, "-map", "[out]", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18", str(video),
        )
        concat_video.append(f"file '{video.as_posix()}'")
        concat_audio.append(f"file '{audio.as_posix()}'")

        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", scene["text"]) if part.strip()]
        weights = [max(1, len(sentence.split())) for sentence in sentences]
        cursor = offset
        for sentence, weight in zip(sentences, weights, strict=True):
            span = scene_duration * weight / sum(weights)
            captions.extend([str(len(captions) // 4 + 1), f"{stamp(cursor)} --> {stamp(cursor + span)}", sentence, ""])
            cursor += span
        offset += scene_duration

    video_list = WORK / "video.txt"
    audio_list = WORK / "audio.txt"
    video_list.write_text("\n".join(concat_video) + "\n", encoding="utf-8")
    audio_list.write_text("\n".join(concat_audio) + "\n", encoding="utf-8")
    srt = WORK / "captions.srt"
    srt.write_text("\n".join(captions), encoding="utf-8")
    visuals = WORK / "visuals.mp4"
    narration = WORK / "narration.m4a"
    visuals.unlink(missing_ok=True)
    narration.unlink(missing_ok=True)
    OUTPUT.unlink(missing_ok=True)
    run("ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(video_list), "-c", "copy", str(visuals))
    run(
        "ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(audio_list),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", str(narration),
    )
    burn_captions(visuals, narration, srt, OUTPUT)
    final_duration = duration(OUTPUT)
    if not 120 <= final_duration < 180:
        raise RuntimeError(f"unexpected demo duration: {final_duration:.2f}s")
    print(f"Built {OUTPUT} ({final_duration:.2f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
