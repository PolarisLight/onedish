# OneDish Natural-Voice Demo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current static, robotic OneDish demo with a sub-three-minute English founder demo built from real product interaction, natural male neural narration, phrase-timed captions, and a restrained original audio bed.

**Architecture:** Playwright records one deterministic English product session and writes scene timestamps beside the raw WebM. A scene-oriented Python pipeline renders narration with `edge-tts`, trims the captured session into clips, composes the mobile UI into 1920×1080, mixes a generated low-volume music bed, merges TTS-derived captions, and validates the final MP4.

**Tech Stack:** Playwright, Python 3.12, edge-tts 7.2.8, FFmpeg/ffprobe, Pillow, pytest, H.264/AAC.

---

## File Map

- Modify `docs/demo-script.md` — final story order, recording rules, and honest capability statements.
- Modify `docs/demo/narration.json` — exact English founder narration plus per-scene voice controls.
- Create `scripts/video-requirements.txt` — pinned neural narration dependency.
- Create `scripts/demo_video_model.py` — typed loading and validation for narration and capture timelines.
- Create `scripts/synthesize_narration.py` — scene-level Edge TTS media/subtitle generation.
- Modify `scripts/capture_demo.mjs` — continuous real-interaction recording and scene timestamp export.
- Create `scripts/generate_demo_bed.py` — deterministic, original, restrained instrumental bed.
- Modify `scripts/build_demo_video.py` — clip extraction, framing, narration/music mix, caption assembly, and master render.
- Modify `scripts/burn_captions.py` — safe-area-aware two-line caption rendering.
- Create `scripts/validate_demo_video.py` — automated media, language, scene, and loudness checks.
- Create `scripts/tests/test_demo_video_pipeline.py` — contract and timing tests independent of network TTS.
- Replace `docs/demo/onedish-demo.mp4` — validated final master.

Generated files under `docs/demo/.build/` remain ignored and are not committed.

### Task 1: Lock the English Founder Script and Scene Contract

**Files:**
- Modify: `docs/demo-script.md`
- Modify: `docs/demo/narration.json`
- Create: `scripts/demo_video_model.py`
- Create: `scripts/tests/test_demo_video_pipeline.py`

- [ ] **Step 1: Write failing narration contract tests**

Create `scripts/tests/test_demo_video_pipeline.py` with:

```python
from pathlib import Path

import pytest

from scripts.demo_video_model import load_scenes


ROOT = Path(__file__).resolve().parents[2]
NARRATION = ROOT / "docs" / "demo" / "narration.json"


def test_narration_is_complete_english_founder_demo():
    scenes = load_scenes(NARRATION)
    assert [scene.id for scene in scenes] == [
        "home", "context", "elimination", "winner", "orbit", "privacy", "close"
    ]
    assert all(scene.voice == "en-US-AndrewMultilingualNeural" for scene in scenes)
    assert all(scene.text.isascii() for scene in scenes)
    assert 280 <= sum(len(scene.text.split()) for scene in scenes) <= 360
    assert scenes[0].text.startswith("Food apps don't solve indecision.")
    assert scenes[-1].text.endswith("stop browsing, and eat this.")


def test_narration_rejects_samantha_or_chinese(tmp_path: Path):
    source = tmp_path / "bad.json"
    source.write_text(
        '[{"id":"home","text":"今天吃什么",'
        '"voice":"Samantha","rate":"+0%","pitch":"+0Hz",'
        '"pause_after_ms":500}]',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="English neural voice"):
        load_scenes(source)
```

- [ ] **Step 2: Run the tests and verify the missing model fails**

Run:

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
```

Expected: collection fails because `scripts.demo_video_model` does not exist.

- [ ] **Step 3: Implement the narration model**

Create `scripts/demo_video_model.py`:

```python
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
    if not scenes or any(
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
```

- [ ] **Step 4: Replace the narration source with the approved founder script**

Replace `docs/demo/narration.json` with seven objects using this exact scene text and voice configuration:

```json
[
  {
    "id": "home",
    "text": "Food apps don't solve indecision. They multiply it. OneDish takes the opposite approach. Tell it what today looks like - or don't - and tap once. No feed. No swiping. Just one meal.",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+1%",
    "pitch": "-2Hz",
    "pause_after_ms": 650
  },
  {
    "id": "context",
    "text": "Optional context can sharpen the choice: budget, time, allergies, cravings, and eventually wellness signals. But the default remains one tap. Missing information stays unknown, and hard allergy rules are never relaxed.",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+0%",
    "pitch": "-2Hz",
    "pause_after_ms": 500
  },
  {
    "id": "elimination",
    "text": "Behind that tap, OneDish starts with ninety demo dishes. The decision is already complete before this animation begins. You're not watching fake A.I. thinking. You're watching the evidence: availability, safety, nutrition, repetition, taste, time, and budget - reduced, step by step, to one.",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+2%",
    "pitch": "-2Hz",
    "pause_after_ms": 700
  },
  {
    "id": "winner",
    "text": "Here's the answer. One dish, with a price estimate, calorie and protein ranges, and the exact reasons it won. The menu is clearly labeled as demo data, and every decision keeps its input hash. If this misses, I can give one reason and get one reserve - not another endless list.",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+1%",
    "pitch": "-2Hz",
    "pause_after_ms": 600
  },
  {
    "id": "orbit",
    "text": "That correction stays on this device. Over time, Taste Orbit turns meal history into visible preference memory. I can focus a signal, inspect why it matters, then tap You and return to the natural orbit. It's useful, but it never becomes a hidden black box.",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+0%",
    "pitch": "-2Hz",
    "pause_after_ms": 550
  },
  {
    "id": "privacy",
    "text": "Privacy is a boundary you can see. Meal history, taste, identifiers, health signals, and precise location each have a clear purpose, storage rule, and deletion rule. Health data does not leave the device. Location only reaches OpenStreetMap after permission, and the connector shows that path - nothing more.",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "-1%",
    "pitch": "-2Hz",
    "pause_after_ms": 700
  },
  {
    "id": "close",
    "text": "OneDish is an offline-ready P.W.A. with deterministic decisions and optional A.I. interpretation behind a strict boundary. It doesn't order for you, and it doesn't pretend demo inventory is live. It does one thing well: stop browsing, and eat this.",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "-2%",
    "pitch": "-3Hz",
    "pause_after_ms": 900
  }
]
```

Rewrite `docs/demo-script.md` so its timing table contains these seven scene ids, a target of 2:15–2:35, English-only recording rules, current product labels, and the capability boundaries from the design spec.

- [ ] **Step 5: Run the narration contract tests**

Run:

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit the script contract**

```bash
git add docs/demo-script.md docs/demo/narration.json scripts/demo_video_model.py scripts/tests/test_demo_video_pipeline.py
git commit -m "docs: rewrite OneDish founder demo narration"
```

### Task 2: Generate Natural Scene-Level Narration and Timed Subtitles

**Files:**
- Create: `scripts/video-requirements.txt`
- Create: `scripts/synthesize_narration.py`
- Modify: `scripts/tests/test_demo_video_pipeline.py`

- [ ] **Step 1: Add failing synthesis command tests**

Append to `scripts/tests/test_demo_video_pipeline.py`:

```python
from scripts.synthesize_narration import edge_tts_command, scene_stem


def test_edge_tts_command_uses_natural_voice_and_writes_subtitles():
    scene = load_scenes(NARRATION)[0]
    command = edge_tts_command(scene, Path("voice.mp3"), Path("voice.srt"))
    assert command[:3] == ["python", "-m", "edge_tts"]
    assert command[command.index("--voice") + 1] == "en-US-AndrewMultilingualNeural"
    assert "--write-media" in command
    assert "--write-subtitles" in command
    assert "Samantha" not in command


def test_scene_stem_is_stable():
    assert scene_stem(3, "winner") == "03-winner"
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
```

Expected: collection fails because `scripts.synthesize_narration` does not exist.

- [ ] **Step 3: Pin the narration dependency**

Create `scripts/video-requirements.txt`:

```text
edge-tts==7.2.8
```

The version is pinned to the current PyPI release. Do not add an API key or a fallback system voice.

- [ ] **Step 4: Implement scene-level synthesis**

Create `scripts/synthesize_narration.py` with these public functions and CLI behavior:

```python
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from demo_video_model import Scene, load_scenes


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "demo"
AUDIO = DEMO / ".build" / "audio"


def scene_stem(index: int, scene_id: str) -> str:
    return f"{index:02d}-{scene_id}"


def edge_tts_command(scene: Scene, media: Path, subtitles: Path) -> list[str]:
    return [
        "python", "-m", "edge_tts",
        "--voice", scene.voice,
        "--rate", scene.rate,
        "--pitch", scene.pitch,
        "--text", scene.text,
        "--write-media", str(media),
        "--write-subtitles", str(subtitles),
    ]


def duration(path: Path) -> float:
    result = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        text=True,
    )
    return float(result.strip())


def synthesize(force: bool) -> list[dict[str, object]]:
    scenes = load_scenes(DEMO / "narration.json")
    AUDIO.mkdir(parents=True, exist_ok=True)
    timing = []
    for index, scene in enumerate(scenes):
        stem = scene_stem(index, scene.id)
        media = AUDIO / f"{stem}.mp3"
        subtitles = AUDIO / f"{stem}.srt"
        if force or not media.is_file() or not subtitles.is_file():
            command = edge_tts_command(scene, media, subtitles)
            command[0] = sys.executable
            subprocess.run(command, check=True)
        timing.append({
            "id": scene.id,
            "media": media.name,
            "subtitles": subtitles.name,
            "duration": duration(media),
            "pause_after_ms": scene.pause_after_ms,
        })
    (AUDIO / "timing.json").write_text(json.dumps(timing, indent=2) + "\n", encoding="utf-8")
    return timing


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    rows = synthesize(args.force)
    print(f"Synthesized {len(rows)} narration scenes with timed subtitles")
```

- [ ] **Step 5: Install and verify the neural voice dependency**

Run:

```bash
backend/.venv/bin/pip install -r scripts/video-requirements.txt
backend/.venv/bin/python -m edge_tts --list-voices
```

Expected: installation succeeds and the voice list contains `en-US-AndrewMultilingualNeural`. If it does not, stop and report the unavailable voice; do not select Samantha.

- [ ] **Step 6: Generate the first voice pass**

Run:

```bash
backend/.venv/bin/python scripts/synthesize_narration.py --force
```

Expected: seven MP3 files, seven SRT files, and `docs/demo/.build/audio/timing.json` are created.

- [ ] **Step 7: Listen to a representative voice sample**

Play `docs/demo/.build/audio/00-home.mp3`, `02-elimination.mp3`, and `06-close.mp3`. Verify the voice is male, warm, intelligible, and varies in pace. If one line is weak, adjust only its punctuation/rate/pitch in `narration.json` and regenerate that scene with `--force` after moving the other accepted files aside.

- [ ] **Step 8: Run tests and commit the synthesis pipeline**

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
git add scripts/video-requirements.txt scripts/synthesize_narration.py scripts/tests/test_demo_video_pipeline.py docs/demo/narration.json
git commit -m "feat: synthesize natural OneDish narration"
```

Expected: all focused tests pass; generated `.build` audio remains untracked.

### Task 3: Record One Continuous English Product Session

**Files:**
- Modify: `scripts/capture_demo.mjs`
- Modify: `scripts/tests/test_demo_video_pipeline.py`

- [ ] **Step 1: Add a failing capture timeline contract test**

Append to `scripts/tests/test_demo_video_pipeline.py`:

```python
from scripts.demo_video_model import load_capture_timeline


def test_capture_timeline_is_ordered_and_complete(tmp_path: Path):
    path = tmp_path / "capture-timeline.json"
    path.write_text(
        '{"language":"en","scenes":['
        '{"id":"home","start":0.0,"end":10.0},'
        '{"id":"context","start":10.0,"end":20.0},'
        '{"id":"elimination","start":20.0,"end":50.0},'
        '{"id":"winner","start":50.0,"end":75.0},'
        '{"id":"orbit","start":75.0,"end":100.0},'
        '{"id":"privacy","start":100.0,"end":125.0},'
        '{"id":"close","start":125.0,"end":135.0}]}'
    )
    timeline = load_capture_timeline(path)
    assert timeline.language == "en"
    assert all(scene.end > scene.start for scene in timeline.scenes)
```

- [ ] **Step 2: Run the focused tests and verify the loader fails**

Run:

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
```

Expected: fails because `load_capture_timeline` is not defined.

- [ ] **Step 3: Add capture timeline types and validation**

Extend `scripts/demo_video_model.py` with `CaptureScene`, `CaptureTimeline`, and `load_capture_timeline(path)`. It must require language `en`, the exact seven scene ids in narration order, non-overlapping ascending timestamps, and positive duration for every scene.

```python
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
    raw = json.loads(path.read_text(encoding="utf-8"))
    scenes = [CaptureScene(**item) for item in raw["scenes"]]
    expected = ["home", "context", "elimination", "winner", "orbit", "privacy", "close"]
    if raw.get("language") != "en" or [scene.id for scene in scenes] != expected:
        raise ValueError("Capture must contain the complete English scene order")
    if any(scene.end <= scene.start for scene in scenes):
        raise ValueError("Capture scene durations must be positive")
    if any(right.start < left.end for left, right in zip(scenes, scenes[1:], strict=False)):
        raise ValueError("Capture scenes must not overlap")
    return CaptureTimeline(language="en", scenes=scenes)
```

- [ ] **Step 4: Replace screenshot capture with video capture**

Rewrite `scripts/capture_demo.mjs` to:

- accept `--base-url`, defaulting to `http://127.0.0.1:5173/`;
- record a 390×844 viewport at 2× device scale into `docs/demo/.build/capture/`;
- force English by clicking `EN` when it is not pressed;
- use Node `performance.now()` to mark exact scene start/end seconds;
- record real actions using the current accessible labels from the E2E tests;
- write `capture-session.webm` and `capture-timeline.json` after closing the context;
- fail if `document.documentElement.lang !== "en"` at any scene boundary;
- collect visible body text at each boundary and fail if it contains `中文`, `隐私`, `口味轨道`, or `帮我选一餐`.

The exact interaction order is:

```javascript
await mark("home", async () => {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
});
await mark("context", async () => {
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Cancel" }).click();
});
await mark("elimination", async () => {
  await page.getByRole("button", { name: "Pick my meal" }).click();
  await page.getByRole("heading", { name: "From ninety to one." }).waitFor();
  await page.waitForTimeout(5200);
});
await mark("winner", async () => {
  const meet = page.getByRole("button", { name: "Meet your dish" });
  await meet.scrollIntoViewIfNeeded();
  await meet.click();
  await page.getByRole("heading", { name: "Why this one" }).waitFor();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Pick another" }).click();
  await page.waitForTimeout(1700);
});
await mark("orbit", async () => {
  await page.goto(new URL("history", baseUrl).href);
  await page.getByRole("heading", { name: "Your taste has an orbit." }).waitFor();
  await page.waitForTimeout(2200);
  await page.locator(".orbit-signal").first().click();
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: "YOU" }).click();
  await page.waitForTimeout(1600);
});
await mark("privacy", async () => {
  await page.goto(new URL("privacy", baseUrl).href);
  await page.getByRole("heading", { name: "Your body is not the product." }).waitFor();
  await page.getByRole("button", { name: "Health signals" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Precise location" }).click();
  await page.waitForTimeout(2200);
});
await mark("close", async () => {
  await page.goto(baseUrl);
  await page.waitForTimeout(2200);
});
```

If `Pick another` is below the fold, scroll it into view before clicking. Do not hard-code a winner dish name because it varies with meal period.

- [ ] **Step 5: Run the model tests**

Run:

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
```

Expected: timeline and narration contract tests pass.

- [ ] **Step 6: Start the real English PWA and record**

Terminal 1:

```bash
pnpm --dir web dev --host 127.0.0.1 --port 5173
```

Terminal 2:

```bash
node scripts/capture_demo.mjs --base-url http://127.0.0.1:5173/
```

Expected: `capture-session.webm` and a validated seven-scene timeline are created. The script prints `Captured 7 English scenes`.

- [ ] **Step 7: Inspect capture contact frames**

Extract one frame from the middle of each timeline segment with FFmpeg and inspect the resulting contact sheet. Confirm every page is English, the winner and retry are visible, Taste Orbit focus returns via YOU, and the privacy connector reaches OpenStreetMap without overlap.

- [ ] **Step 8: Commit the capture pipeline**

```bash
git add scripts/capture_demo.mjs scripts/demo_video_model.py scripts/tests/test_demo_video_pipeline.py
git commit -m "feat: record the real English OneDish flow"
```

### Task 4: Create an Original Restrained Audio Bed

**Files:**
- Create: `scripts/generate_demo_bed.py`
- Modify: `scripts/tests/test_demo_video_pipeline.py`

- [ ] **Step 1: Add a failing music command test**

Append a test asserting that `music_filter(150.0)` includes a pad, a soft pulse, pink noise, fade-in, fade-out, and a target below narration:

```python
from scripts.generate_demo_bed import music_filter


def test_music_filter_is_restrained_and_fades():
    graph = music_filter(150.0)
    assert "aevalsrc" in graph
    assert "anoisesrc=color=pink" in graph
    assert "afade=t=in" in graph
    assert "afade=t=out" in graph
    assert "loudnorm=I=-34" in graph
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
```

Expected: collection fails because `scripts.generate_demo_bed` does not exist.

- [ ] **Step 3: Implement deterministic FFmpeg music generation**

Create `scripts/generate_demo_bed.py` with `music_filter(duration)` and a CLI. The filter must synthesize a low pad, a soft two-second pulse, and very low pink noise, then normalize to −34 LUFS:

```python
def music_filter(duration: float) -> str:
    fade_out = max(0.0, duration - 3.0)
    return (
        f"aevalsrc=0.022*sin(2*PI*55*t)+0.012*sin(2*PI*82.41*t):s=48000:d={duration}[pad];"
        f"aevalsrc=0.055*exp(-14*mod(t\\,2))*sin(2*PI*65*t):s=48000:d={duration}[pulse];"
        f"anoisesrc=color=pink:amplitude=0.004:r=48000:d={duration}[noise];"
        "[pad]lowpass=f=420[padf];[pulse]lowpass=f=160[pulsef];[noise]lowpass=f=900[noisef];"
        "[padf][pulsef][noisef]amix=inputs=3:normalize=0,"
        f"afade=t=in:st=0:d=2,afade=t=out:st={fade_out}:d=3,"
        "loudnorm=I=-34:TP=-8:LRA=4[out]"
    )
```

The CLI writes `docs/demo/.build/music-bed.wav` with PCM 48 kHz stereo and refuses durations outside 120–179 seconds.

- [ ] **Step 4: Run tests and generate the bed**

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
backend/.venv/bin/python scripts/generate_demo_bed.py --duration 150
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 docs/demo/.build/music-bed.wav
```

Expected: tests pass and the reported duration is approximately 150 seconds.

- [ ] **Step 5: Audition under narration**

Mix the home narration over the first twenty seconds of the bed at narration −16 LUFS and bed −34 LUFS. Confirm the pulse adds movement without masking consonants. If it draws attention to itself, lower the generated bed to −37 LUFS rather than raising narration.

- [ ] **Step 6: Commit the bed generator**

```bash
git add scripts/generate_demo_bed.py scripts/tests/test_demo_video_pipeline.py
git commit -m "feat: add an original restrained demo soundtrack"
```

### Task 5: Assemble Live Clips, Natural Narration, Music, and Captions

**Files:**
- Modify: `scripts/build_demo_video.py`
- Modify: `scripts/burn_captions.py`
- Modify: `scripts/tests/test_demo_video_pipeline.py`

- [ ] **Step 1: Add failing assembly timing tests**

Append tests for `scene_output_duration`, `stamp`, and caption wrapping:

```python
from scripts.build_demo_video import scene_output_duration, stamp
from scripts.burn_captions import wrap_caption


def test_scene_duration_includes_pause_and_visual_guard():
    assert scene_output_duration(audio=18.0, pause_ms=700, visual=25.0) == pytest.approx(18.7)
    with pytest.raises(ValueError, match="too short"):
        scene_output_duration(audio=25.0, pause_ms=700, visual=20.0)


def test_caption_stamp_and_two_line_wrap():
    assert stamp(62.345) == "00:01:02,345"
    lines = wrap_caption("OneDish gives you one inspectable answer instead of another feed.")
    assert 1 <= len(lines) <= 2
    assert all(len(line) <= 44 for line in lines)
```

- [ ] **Step 2: Run tests and verify the new helpers fail**

Run:

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
```

Expected: import or assertion failures for the missing assembly helpers.

- [ ] **Step 3: Refactor caption rendering for safe two-line captions**

In `scripts/burn_captions.py`, expose:

```python
def wrap_caption(text: str, width: int = 44) -> list[str]:
    lines = textwrap.wrap(text, width=width, break_long_words=False, break_on_hyphens=False)
    if len(lines) > 2:
        midpoint = len(text) // 2
        split = text.rfind(" ", 0, midpoint + 1)
        lines = [text[:split].strip(), text[split:].strip()]
    if len(lines) > 2 or any(len(line) > 52 for line in lines):
        raise ValueError(f"Caption cannot fit safe area: {text}")
    return lines
```

Render the joined lines inside a 1540×170 transparent image, positioned 42 pixels above the bottom safe margin. Preserve the dark rounded backing and H.264/AAC output.

- [ ] **Step 4: Rewrite the assembly pipeline around captured scene clips**

In `scripts/build_demo_video.py`:

- load narration with `load_scenes` and capture timestamps with `load_capture_timeline`;
- read audio timing from `.build/audio/timing.json`;
- require all seven narration MP3/SRT pairs, the capture WebM, timeline JSON, and music bed;
- implement `scene_output_duration(audio, pause_ms, visual)` so it returns `audio + pause` and fails when the recorded scene is shorter than that duration by more than 0.5 seconds;
- extract each recorded scene with FFmpeg `-ss` and `-t`;
- crop/scale the 390×844 recording into a centered phone composition over a blurred 1920×1080 background;
- concatenate the seven visual clips;
- concatenate narration with each configured silence gap;
- merge Edge TTS SRT files by offsetting their real timestamps with final scene offsets;
- generate section-level bed automation: −31 LUFS for home/elimination/close and −37 LUFS for evidence/privacy, with 400 ms transitions;
- mix narration and bed, apply final narration loudness `I=-16:TP=-1.5:LRA=9`, and pass the result plus merged SRT to `burn_captions`;
- reject total duration outside 120–179 seconds;
- support `--reuse-capture`, `--reuse-audio`, and `--output` options without silently generating Samantha audio.

Use these exact public helpers:

```python
def scene_output_duration(audio: float, pause_ms: int, visual: float) -> float:
    required = audio + pause_ms / 1000
    if visual + 0.5 < required:
        raise ValueError(f"Captured scene is too short: {visual:.2f}s for {required:.2f}s")
    return required


def stamp(seconds: float) -> str:
    total = round(max(0.0, seconds) * 1000)
    hours, rest = divmod(total, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    secs, millis = divmod(rest, 1_000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"
```

- [ ] **Step 5: Run assembly unit tests**

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
backend/.venv/bin/python -m py_compile scripts/demo_video_model.py scripts/synthesize_narration.py scripts/generate_demo_bed.py scripts/build_demo_video.py scripts/burn_captions.py
```

Expected: all tests and Python compilation pass.

- [ ] **Step 6: Build the first complete master**

Run:

```bash
backend/.venv/bin/python scripts/build_demo_video.py --reuse-capture --reuse-audio --output docs/demo/onedish-demo.mp4
```

Expected: a 1920×1080 H.264/AAC MP4 between 2:00 and 2:59 is created with burned captions.

- [ ] **Step 7: Commit the assembly pipeline**

```bash
git add scripts/build_demo_video.py scripts/burn_captions.py scripts/tests/test_demo_video_pipeline.py
git commit -m "feat: assemble live OneDish founder demo"
```

### Task 6: Validate, Review, and Package the Final Video

**Files:**
- Create: `scripts/validate_demo_video.py`
- Modify: `scripts/tests/test_demo_video_pipeline.py`
- Modify: `docs/demo/onedish-demo.mp4`
- Modify: `docs/demo-script.md`

- [ ] **Step 1: Add failing media validation tests**

Append tests for a pure `validate_probe` helper:

```python
from scripts.validate_demo_video import validate_probe


def test_probe_requires_demo_delivery_contract():
    valid = {
        "format": {"duration": "145.5"},
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080},
            {"codec_type": "audio", "codec_name": "aac", "sample_rate": "48000"},
        ],
    }
    assert validate_probe(valid) == []
    invalid = {"format": {"duration": "181"}, "streams": []}
    assert "duration must be between 120 and 179 seconds" in validate_probe(invalid)
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
```

Expected: collection fails because `scripts.validate_demo_video` does not exist.

- [ ] **Step 3: Implement automated master validation**

Create `scripts/validate_demo_video.py` that:

- runs `ffprobe -show_format -show_streams -of json`;
- requires duration 120–179 seconds;
- requires exactly one H.264 1920×1080 video stream and at least one AAC 48 kHz audio stream;
- checks `.build/captions.srt` contains the opening and closing phrases;
- checks `capture-timeline.json` declares English and all seven scenes;
- checks narration text contains none of `Synthetic demo context`, `GPT-5.6`, `future app`, or Chinese characters;
- prints every failure and exits nonzero; otherwise prints the duration and `Demo video validation passed`.

The pure helper must have this interface:

```python
def validate_probe(probe: dict[str, object]) -> list[str]:
    errors: list[str] = []
    duration = float(probe.get("format", {}).get("duration", 0))
    if not 120 <= duration < 180:
        errors.append("duration must be between 120 and 179 seconds")
    streams = probe.get("streams", [])
    videos = [stream for stream in streams if stream.get("codec_type") == "video"]
    audios = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(videos) != 1 or videos[0].get("codec_name") != "h264" or (videos[0].get("width"), videos[0].get("height")) != (1920, 1080):
        errors.append("video must be one 1920x1080 H.264 stream")
    if not audios or audios[0].get("codec_name") != "aac" or audios[0].get("sample_rate") != "48000":
        errors.append("audio must include AAC at 48 kHz")
    return errors
```

- [ ] **Step 4: Run automated validation**

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py -q
backend/.venv/bin/python scripts/validate_demo_video.py docs/demo/onedish-demo.mp4
```

Expected: all tests pass and the validator prints `Demo video validation passed`.

- [ ] **Step 5: Perform visual and audio QA**

Watch the complete MP4 once with sound and once muted. Verify:

- the voice feels like a person presenting, with audible pace changes and pauses;
- narration never competes with the music;
- all visible UI is English;
- every tap matches the spoken claim;
- the 90-to-1 sequence, winner evidence, retry, Orbit focus/return, and privacy connector are legible;
- captions match the exact spoken words and never cover primary controls;
- the opening has impact while privacy becomes calmer;
- the closing line lands cleanly before the music resolves.

Extract contact frames at 0:05, 0:20, 0:45, 1:10, 1:38, 2:02, and five seconds before the end. Inspect the contact sheet at original resolution for clipping, stale copy, Chinese text, and overlay collisions.

- [ ] **Step 6: Update delivery documentation**

Add the final duration, default voice, build command, validation command, and a statement that the music bed is procedurally generated to `docs/demo-script.md`.

- [ ] **Step 7: Commit the final master and validator**

```bash
git add scripts/validate_demo_video.py scripts/tests/test_demo_video_pipeline.py docs/demo-script.md docs/demo/onedish-demo.mp4
git commit -m "docs: deliver the natural-voice OneDish demo"
```

- [ ] **Step 8: Run final repository checks**

```bash
backend/.venv/bin/pytest scripts/tests/test_demo_video_pipeline.py backend/tests -q
pnpm --dir web exec vitest run
pnpm --dir web lint
git diff --check main...HEAD
git status --short
```

Expected: all tests and lint pass, the branch diff has no whitespace errors, and the worktree is clean.
