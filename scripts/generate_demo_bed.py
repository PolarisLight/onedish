from __future__ import annotations

import argparse
import math
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "docs" / "demo" / ".build" / "music-bed.wav"
# The recorded WebM is 135.040 seconds long; matching it avoids an audible
# cutoff while keeping the generated asset no longer than the final picture.
DEFAULT_DURATION = 135.04
MIN_DURATION = 120.0
MAX_DURATION = 179.0


def validate_duration(duration: float) -> float:
    if not math.isfinite(duration) or not MIN_DURATION <= duration <= MAX_DURATION:
        raise ValueError("duration must be between 120 and 179 seconds")
    return duration


def music_filter(duration: float) -> str:
    duration = validate_duration(duration)
    fade_out = max(0.0, duration - 3.0)
    return (
        f"aevalsrc=0.022*sin(2*PI*55*t)+0.012*sin(2*PI*82.41*t)"
        f":s=48000:d={duration}[pad];"
        f"aevalsrc=0.055*exp(-14*mod(t\\,2))*sin(2*PI*65*t)"
        f":s=48000:d={duration}[pulse];"
        f"anoisesrc=color=pink:amplitude=0.004:r=48000:d={duration}:seed=104729[noise];"
        "[pad]lowpass=f=420[padf];"
        "[pulse]lowpass=f=160[pulsef];"
        "[noise]lowpass=f=900[noisef];"
        "[padf][pulsef][noisef]amix=inputs=3:normalize=0,"
        f"afade=t=in:st=0:d=2,afade=t=out:st={fade_out}:d=3,"
        "loudnorm=I=-34:TP=-8:LRA=4[out]"
    )


def generate_music_bed(duration: float, output: Path = DEFAULT_OUTPUT) -> Path:
    duration = validate_duration(duration)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp.wav")
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-filter_complex",
        music_filter(duration),
        "-map",
        "[out]",
        "-t",
        str(duration),
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        str(temporary),
    ]
    try:
        subprocess.run(command, check=True)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate the deterministic original OneDish demo music bed."
    )
    parser.add_argument("--duration", type=float, default=DEFAULT_DURATION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        output = generate_music_bed(args.duration, args.output)
    except ValueError as error:
        parser.error(str(error))
    print(f"Generated {args.duration:.3f}s music bed at {output}")


if __name__ == "__main__":
    main()
