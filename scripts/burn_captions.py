#!/usr/bin/env python3
"""Render safe-area captions without depending on FFmpeg's optional libass."""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SRT_TIMESTAMP = re.compile(
    r"^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$"
)


def stable_h264_options() -> list[str]:
    """Make one-second random seeks independent of a long prediction chain."""
    return ["-g", "30", "-keyint_min", "30", "-sc_threshold", "0"]


def wrap_caption(text: str, width: int = 44) -> list[str]:
    """Wrap a caption into at most two readable safe-area lines."""
    lines = textwrap.wrap(
        text,
        width=width,
        break_long_words=False,
        break_on_hyphens=False,
    )
    if len(lines) > 2:
        midpoint = len(text) // 2
        split = text.rfind(" ", 0, midpoint + 1)
        if split <= 0:
            split = text.find(" ", midpoint)
        if split <= 0:
            raise ValueError(f"Caption cannot fit safe area: {text}")
        lines = [text[:split].strip(), text[split:].strip()]
    if not lines or len(lines) > 2 or any(len(line) > 52 for line in lines):
        raise ValueError(f"Caption cannot fit safe area: {text}")
    return lines


def master_output_duration(visuals: float, soundtrack: float) -> float:
    """Use the soundtrack end, rejecting a materially short picture track."""
    if visuals + 0.5 < soundtrack:
        raise ValueError(
            f"Visual track is shorter than soundtrack: {visuals:.3f}s < {soundtrack:.3f}s"
        )
    return soundtrack


def _media_duration(path: Path) -> float:
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


def _seconds(value: str) -> float:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for path in candidates:
        if path.is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def _entries(srt: Path) -> list[tuple[float, float, str]]:
    contents = srt.read_text(encoding="utf-8").strip()
    if not contents:
        raise ValueError("Malformed caption cue 1")
    blocks = re.split(r"\n[ \t]*\n", contents)
    entries: list[tuple[float, float, str]] = []
    previous_end = -1.0
    for expected, block in enumerate(blocks, start=1):
        lines = block.splitlines()
        if len(lines) < 3 or lines[0].strip() != str(expected):
            raise ValueError(f"Malformed caption cue {expected}")
        match = SRT_TIMESTAMP.fullmatch(lines[1].strip())
        if match is None:
            raise ValueError(f"Malformed caption cue {expected}: timestamp")
        start = _seconds(match.group(1))
        end = _seconds(match.group(2))
        text = " ".join(line.strip() for line in lines[2:] if line.strip())
        if not text:
            raise ValueError(f"Malformed caption cue {expected}: empty text")
        if end <= start:
            raise ValueError(f"Malformed caption cue {expected}: non-positive range")
        if start < previous_end:
            raise ValueError(f"Malformed caption cue {expected}: overlapping range")
        entries.append((start, end, text))
        previous_end = end
    return entries


def burn_captions(visuals: Path, soundtrack: Path, srt: Path, output: Path) -> None:
    """Burn caption cards and atomically publish an H.264/AAC master."""
    entries = _entries(srt)
    render_duration = master_output_duration(
        _media_duration(visuals), _media_duration(soundtrack)
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="caption-images-", dir=srt.parent) as image_dir:
        images = Path(image_dir)
        font = _font(34)
        caption_paths: list[Path] = []
        for index, (_, _, text) in enumerate(entries):
            wrapped = "\n".join(wrap_caption(text))
            image = Image.new("RGBA", (1540, 170), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            box = draw.multiline_textbbox(
                (0, 0), wrapped, font=font, spacing=9, align="center"
            )
            text_width = box[2] - box[0]
            text_height = box[3] - box[1]
            left = (image.width - text_width) // 2 - 30
            top = (image.height - text_height) // 2 - 16
            draw.rounded_rectangle(
                (left, top, left + text_width + 60, top + text_height + 32),
                radius=20,
                fill=(7, 10, 8, 224),
                outline=(255, 255, 255, 28),
                width=1,
            )
            draw.multiline_text(
                (image.width / 2, image.height / 2),
                wrapped,
                font=font,
                fill=(250, 250, 246, 255),
                anchor="mm",
                spacing=9,
                align="center",
            )
            path = images / f"caption-{index:03}.png"
            image.save(path, optimize=True)
            caption_paths.append(path)

        with tempfile.NamedTemporaryFile(
            prefix=f".{output.stem}-",
            suffix=".mp4",
            dir=output.parent,
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
        temporary.unlink(missing_ok=True)
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(visuals),
            "-i",
            str(soundtrack),
        ]
        for path in caption_paths:
            command.extend(["-loop", "1", "-i", str(path)])
        chains: list[str] = []
        previous = "0:v"
        for index, (start, end, _) in enumerate(entries):
            output_label = f"v{index}"
            chains.append(
                f"[{previous}][{index + 2}:v]overlay=(W-w)/2:H-h-42:"
                f"enable='between(t,{start:.3f},{end:.3f})'[{output_label}]"
            )
            previous = output_label
        try:
            command.extend(
                [
                    "-filter_complex",
                    ";".join(chains),
                    "-map",
                    f"[{previous}]",
                    "-map",
                    "1:a",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "medium",
                    "-crf",
                    "18",
                    "-pix_fmt",
                    "yuv420p",
                    *stable_h264_options(),
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-ar",
                    "48000",
                    "-t",
                    f"{render_duration:.3f}",
                    "-shortest",
                    "-movflags",
                    "+faststart",
                    str(temporary),
                ]
            )
            subprocess.run(command, check=True)
            os.replace(temporary, output)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("visuals", type=Path)
    parser.add_argument("soundtrack", type=Path)
    parser.add_argument("srt", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    burn_captions(args.visuals, args.soundtrack, args.srt, args.output)
