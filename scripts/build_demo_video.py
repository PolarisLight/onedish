#!/usr/bin/env python3
"""Assemble the recorded OneDish product flow into the narrated demo master."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import uuid
from pathlib import Path

try:
    from .burn_captions import burn_captions
    from .demo_video_model import load_capture_timeline, load_scenes
except ImportError:  # Direct invocation: python scripts/build_demo_video.py
    from burn_captions import burn_captions
    from demo_video_model import load_capture_timeline, load_scenes


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
WORK = DEMO / ".build"
AUDIO = WORK / "audio"
CAPTURE = WORK / "capture"
NARRATION_PATH = DEMO / "narration.json"
TIMING_PATH = AUDIO / "timing.json"
CAPTURE_PATH = CAPTURE / "capture-session.webm"
CAPTURE_TIMELINE_PATH = CAPTURE / "capture-timeline.json"
MUSIC_PATH = WORK / "music-bed.wav"
DEFAULT_OUTPUT = DEMO / "onedish-demo.mp4"
SCENE_ORDER = ("home", "context", "elimination", "winner", "orbit", "privacy", "close")
CAPTION_TIMESTAMP = re.compile(
    r"^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> "
    r"(\d{2}):(\d{2}):(\d{2}),(\d{3})$"
)


def run(*arguments: str) -> None:
    subprocess.run(arguments, check=True)


def media_duration(path: Path) -> float:
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
    value = float(result.strip())
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"Media has no positive duration: {path}")
    return value


def scene_output_duration(audio: float, pause_ms: int, visual: float) -> float:
    required = audio + pause_ms / 1000
    if visual + 0.5 < required:
        raise ValueError(
            f"Captured scene is too short: {visual:.2f}s for {required:.2f}s"
        )
    return required


def stamp(seconds: float) -> str:
    total = round(max(0.0, seconds) * 1000)
    hours, rest = divmod(total, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    secs, millis = divmod(rest, 1_000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def fit_caption_cues(
    start: float, end: float, text: str, width: int = 88
) -> list[tuple[float, float, str]]:
    """Split an unusually long TTS cue while preserving its real time range."""
    chunks = textwrap.wrap(
        text,
        width=width,
        break_long_words=False,
        break_on_hyphens=False,
    )
    if not chunks:
        raise ValueError("Caption text must not be empty")
    if any(len(chunk) > 104 for chunk in chunks):
        raise ValueError(f"Caption cannot fit safe area: {text}")
    weights = [len(chunk.split()) for chunk in chunks]
    span = end - start
    cursor = start
    fitted: list[tuple[float, float, str]] = []
    for index, (chunk, weight) in enumerate(zip(chunks, weights, strict=True)):
        cue_end = end if index == len(chunks) - 1 else cursor + span * weight / sum(weights)
        fitted.append((cursor, cue_end, chunk))
        cursor = cue_end
    return fitted


def _seconds(groups: tuple[str, ...]) -> float:
    hours, minutes, seconds, millis = (int(value) for value in groups)
    return hours * 3600 + minutes * 60 + seconds + millis / 1000


def _require_file(path: Path) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise FileNotFoundError(f"Required demo artifact is missing or empty: {path}")


def _load_audio_timing() -> list[dict[str, object]]:
    _require_file(TIMING_PATH)
    try:
        rows = json.loads(TIMING_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid audio timing manifest: {error}") from error
    if not isinstance(rows, list) or [row.get("id") for row in rows if isinstance(row, dict)] != list(
        SCENE_ORDER
    ):
        raise ValueError("Audio timing must contain the seven ordered demo scenes")
    return rows


def _parse_srt(path: Path) -> list[tuple[float, float, str]]:
    blocks = re.split(r"\n[ \t]*\n", path.read_text(encoding="utf-8").strip())
    cues: list[tuple[float, float, str]] = []
    for expected, block in enumerate(blocks, start=1):
        lines = block.splitlines()
        if len(lines) < 3 or lines[0].strip() != str(expected):
            raise ValueError(f"Invalid SRT cue in {path.name}: {expected}")
        match = CAPTION_TIMESTAMP.fullmatch(lines[1].strip())
        if match is None:
            raise ValueError(f"Invalid SRT timestamp in {path.name}: {lines[1]}")
        start = _seconds(match.groups()[:4])
        end = _seconds(match.groups()[4:])
        text = " ".join(line.strip() for line in lines[2:] if line.strip())
        if not text or end <= start or (cues and start < cues[-1][1]):
            raise ValueError(f"Invalid SRT cue range in {path.name}: {expected}")
        cues.append((start, end, text))
    return cues


def _write_concat(paths: list[Path], destination: Path) -> None:
    def quote(path: Path) -> str:
        return path.as_posix().replace("'", "'\\''")

    destination.write_text(
        "".join(f"file '{quote(path)}'\n" for path in paths), encoding="utf-8"
    )


def _extract_scene(source: Path, start: float, length: float, output: Path) -> None:
    phone_filter = (
        "[0:v]setpts=PTS-STARTPTS,split=2[bg][fg];"
        "[bg]scale=1920:1080:force_original_aspect_ratio=increase,"
        "crop=1920:1080,boxblur=luma_radius=38:luma_power=2,"
        "eq=brightness=-0.38:saturation=0.72,vignette=PI/5[back];"
        "[fg]scale=438:948:flags=lanczos,setsar=1,"
        "pad=466:976:14:14:color=0x080a08,"
        "drawbox=x=0:y=0:w=iw:h=ih:color=0x596154:t=2[phone];"
        "[back][phone]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[out]"
    )
    run(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(source),
        "-t",
        f"{length:.3f}",
        "-filter_complex",
        phone_filter,
        "-map",
        "[out]",
        "-an",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        str(output),
    )


def _render_scene_audio(media: Path, length: float, output: Path) -> None:
    run(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(media),
        "-af",
        f"aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
        f"apad,atrim=0:{length:.3f}",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        str(output),
    )


def _music_gain_expression(offsets: list[float]) -> str:
    # The generated bed is normalized to -34 LUFS. These gains yield the
    # approved -31/-37 LUFS section levels with 400 ms ramps at boundaries.
    gains = (3.0, -3.0, 3.0, -3.0, -3.0, -3.0, 3.0)
    expression = f"{gains[-1]:.1f}"
    for boundary_index in range(len(offsets) - 1, 0, -1):
        boundary = offsets[boundary_index]
        previous = gains[boundary_index - 1]
        current = gains[boundary_index]
        ramp_end = boundary + 0.4
        ramp = (
            f"{previous:.1f}+({current - previous:.1f})*"
            f"(t-{boundary:.3f})/0.400"
        )
        expression = (
            f"if(lt(t,{boundary:.3f}),{previous:.1f},"
            f"if(lt(t,{ramp_end:.3f}),{ramp},{expression}))"
        )
    return expression


def _mix_soundtrack(
    narration: Path,
    music: Path,
    offsets: list[float],
    total: float,
    output: Path,
) -> None:
    gain = _music_gain_expression(offsets).replace(",", "\\,")
    graph = (
        f"[1:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,"
        "loudnorm=I=-34:TP=-8:LRA=4,"
        f"volume=pow(10\\,({gain})/20):eval=frame[bed];"
        "[0:a][bed]amix=inputs=2:duration=first:normalize=0,"
        "alimiter=limit=0.94:attack=5:release=50[mix]"
    )
    run(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(narration),
        "-i",
        str(music),
        "-filter_complex",
        graph,
        "-map",
        "[mix]",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(output),
    )


def _publish_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    try:
        shutil.copyfile(source, temporary)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def build(output: Path) -> float:
    scenes = load_scenes(NARRATION_PATH)
    if tuple(scene.id for scene in scenes) != SCENE_ORDER:
        raise ValueError("Narration must contain the seven ordered demo scenes")
    capture = load_capture_timeline(CAPTURE_TIMELINE_PATH)
    timing = _load_audio_timing()
    _require_file(CAPTURE_PATH)
    _require_file(MUSIC_PATH)

    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    staged_master = output.with_name(f".{output.stem}-stage-{uuid.uuid4().hex}.mp4")
    staged_master.unlink(missing_ok=True)

    with tempfile.TemporaryDirectory(prefix="assembly-", dir=WORK) as temporary_dir:
        temporary = Path(temporary_dir)
        clips: list[Path] = []
        voice_parts: list[Path] = []
        captions: list[str] = []
        scene_offsets: list[float] = []
        offset = 0.0

        for index, (scene, capture_scene, row) in enumerate(
            zip(scenes, capture.scenes, timing, strict=True)
        ):
            if row.get("id") != scene.id or capture_scene.id != scene.id:
                raise ValueError(f"Scene artifact mismatch at {scene.id}")
            media = AUDIO / str(row.get("media"))
            subtitles = AUDIO / str(row.get("subtitles"))
            _require_file(media)
            _require_file(subtitles)
            measured_audio = media_duration(media)
            declared_audio = float(row.get("duration", 0))
            if abs(measured_audio - declared_audio) > 0.08:
                raise ValueError(f"Audio timing does not match {media.name}")
            if int(row.get("pause_after_ms", -1)) != scene.pause_after_ms:
                raise ValueError(f"Narration pause does not match {scene.id}")
            visual = capture_scene.end - capture_scene.start
            length = scene_output_duration(
                measured_audio, scene.pause_after_ms, visual
            )
            scene_offsets.append(offset)

            clip = temporary / f"{index:02}-{scene.id}.mp4"
            voice = temporary / f"{index:02}-{scene.id}.wav"
            _extract_scene(CAPTURE_PATH, capture_scene.start, length, clip)
            _render_scene_audio(media, length, voice)
            clips.append(clip)
            voice_parts.append(voice)

            for cue_start, cue_end, text in _parse_srt(subtitles):
                if cue_end > measured_audio + 0.1:
                    raise ValueError(f"Caption exceeds narration in {subtitles.name}")
                for fitted_start, fitted_end, fitted_text in fit_caption_cues(
                    cue_start, cue_end, text
                ):
                    captions.extend(
                        [
                            str(len(captions) // 4 + 1),
                            f"{stamp(offset + fitted_start)} --> "
                            f"{stamp(offset + fitted_end)}",
                            fitted_text,
                            "",
                        ]
                    )
            offset += length

        total = offset
        if not 120 <= total < 180:
            raise ValueError(f"Demo duration must be 120-179 seconds, got {total:.2f}")

        video_list = temporary / "video-concat.txt"
        audio_list = temporary / "audio-concat.txt"
        _write_concat(clips, video_list)
        _write_concat(voice_parts, audio_list)
        visuals = temporary / "visuals.mp4"
        raw_narration = temporary / "narration-raw.wav"
        narration = temporary / "narration-minus16.wav"
        soundtrack = temporary / "soundtrack.m4a"
        merged_srt = temporary / "captions.srt"
        merged_srt.write_text("\n".join(captions).rstrip() + "\n", encoding="utf-8")

        run(
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(video_list),
            "-c",
            "copy",
            str(visuals),
        )
        run(
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(audio_list),
            "-c:a",
            "pcm_s16le",
            str(raw_narration),
        )
        run(
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(raw_narration),
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=9",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(narration),
        )
        _mix_soundtrack(narration, MUSIC_PATH, scene_offsets, total, soundtrack)
        burn_captions(visuals, soundtrack, merged_srt, staged_master)
        final_duration = media_duration(staged_master)
        if not 120 <= final_duration < 180:
            raise RuntimeError(f"Unexpected demo duration: {final_duration:.2f}s")
        _publish_copy(merged_srt, WORK / "captions.srt")
        os.replace(staged_master, output)
        return final_duration


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build the live, natural-voice OneDish founder demo."
    )
    parser.add_argument("--reuse-capture", action="store_true")
    parser.add_argument("--reuse-audio", action="store_true")
    parser.add_argument("--base-url", default="http://127.0.0.1:5173/")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    try:
        if not arguments.reuse_capture:
            run(
                "node",
                str(ROOT / "scripts" / "capture_demo.mjs"),
                "--base-url",
                arguments.base_url,
            )
        if not arguments.reuse_audio:
            run(
                sys.executable,
                str(ROOT / "scripts" / "synthesize_narration.py"),
                "--force",
            )
        result = build(arguments.output)
    except (FileNotFoundError, ValueError) as error:
        parser.error(str(error))
    finally:
        # Preserve an accepted master and remove only this process's stage files.
        for path in arguments.output.resolve().parent.glob(
            f".{arguments.output.stem}-stage-*.mp4"
        ):
            path.unlink(missing_ok=True)
    print(f"Built {arguments.output.resolve()} ({result:.2f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
