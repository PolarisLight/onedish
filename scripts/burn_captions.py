#!/usr/bin/env python3
"""Burn SRT captions without requiring FFmpeg's optional libass build."""

from __future__ import annotations

import re
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


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


def burn_captions(visuals: Path, narration: Path, srt: Path, output: Path) -> None:
    blocks = re.split(r"\n\s*\n", srt.read_text(encoding="utf-8").strip())
    entries: list[tuple[float, float, str]] = []
    for block in blocks:
        lines = block.splitlines()
        if len(lines) < 3:
            continue
        start, end = lines[1].split(" --> ")
        entries.append((_seconds(start), _seconds(end), " ".join(lines[2:])))

    images = srt.parent / "caption-images"
    images.mkdir(exist_ok=True)
    font = _font(34)
    caption_paths: list[Path] = []
    for index, (_, _, text) in enumerate(entries):
        wrapped = textwrap.fill(text, width=64)
        image = Image.new("RGBA", (1540, 150), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        box = draw.multiline_textbbox((0, 0), wrapped, font=font, spacing=8, align="center")
        width = box[2] - box[0]
        height = box[3] - box[1]
        left = (image.width - width) // 2 - 28
        top = (image.height - height) // 2 - 15
        draw.rounded_rectangle(
            (left, top, left + width + 56, top + height + 30),
            radius=18,
            fill=(8, 10, 8, 218),
        )
        draw.multiline_text(
            (image.width / 2, image.height / 2),
            wrapped,
            font=font,
            fill=(248, 249, 244, 255),
            anchor="mm",
            spacing=8,
            align="center",
        )
        path = images / f"caption-{index:03}.png"
        image.save(path, optimize=True)
        caption_paths.append(path)

    command = ["ffmpeg", "-v", "error", "-i", str(visuals), "-i", str(narration)]
    for path in caption_paths:
        command.extend(["-loop", "1", "-i", str(path)])
    chains: list[str] = []
    previous = "0:v"
    for index, (start, end, _) in enumerate(entries):
        output_label = f"v{index}"
        chains.append(
            f"[{previous}][{index + 2}:v]overlay=(W-w)/2:H-h-28:"
            f"enable='between(t,{start:.3f},{end:.3f})'[{output_label}]"
        )
        previous = output_label
    command.extend(
        [
            "-filter_complex", ";".join(chains),
            "-map", f"[{previous}]", "-map", "1:a",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-af", "volume=-0.2dB", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart",
            str(output),
        ]
    )
    subprocess.run(command, check=True)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("visuals", type=Path)
    parser.add_argument("narration", type=Path)
    parser.add_argument("srt", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    burn_captions(args.visuals, args.narration, args.srt, args.output)
