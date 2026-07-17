#!/usr/bin/env python3
"""Fail closed when public OneDish artifacts contain unsafe or stale material."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".py", ".svg", ".ts", ".tsx", ".txt", ".yml", ".yaml"}
MAX_ASSET_BYTES = 3 * 1024 * 1024
MAX_VIDEO_BYTES = 25 * 1024 * 1024


def tracked_files() -> list[Path]:
    output = subprocess.check_output(["git", "ls-files", "-co", "--exclude-standard"], cwd=ROOT, text=True)
    return [ROOT / line for line in output.splitlines() if line and (ROOT / line).is_file()]


def main() -> int:
    errors: list[str] = []
    private_path = re.compile(re.escape("/" + "Users" + "/"))
    secret = re.compile(r"(?i)(sk-proj-[a-z0-9_-]{12,}|gh[opsu]_[a-z0-9]{20,})")
    private_host = re.compile(r"\b(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|59\.77\.\d+\.\d+)\b")
    for path in tracked_files():
        relative = path.relative_to(ROOT)
        limit = MAX_VIDEO_BYTES if path.suffix.lower() == ".mp4" else MAX_ASSET_BYTES
        if path.stat().st_size > limit:
            errors.append(f"oversized artifact: {relative}")
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if private_path.search(text):
            errors.append(f"private filesystem path: {relative}")
        if secret.search(text):
            errors.append(f"credential-like value: {relative}")
        if private_host.search(text):
            errors.append(f"private host: {relative}")
    required = [
        ROOT / "web" / "public" / "demo" / name
        for name in ("day1.json", "day1_rejected.json", "day2.json")
    ]
    for path in required:
        if not path.is_file():
            errors.append(f"missing demo record: {path.name}")
    runtime_names = ("decision.v2.json", "catalog.v1.json", "places.v1.json", "parity.v2.json")
    for name in runtime_names:
        canonical = ROOT / "data" / name
        generated = ROOT / "web" / "public" / "data" / name
        if not canonical.is_file():
            errors.append(f"missing canonical runtime data: {name}")
        if not generated.is_file():
            errors.append(f"missing browser runtime data: {name}")
        elif canonical.is_file() and generated.read_bytes() != canonical.read_bytes():
            errors.append(f"stale browser runtime data: {name}")
    if errors:
        for error in sorted(set(errors)):
            print(f"ERROR: {error}")
        return 1
    print(f"Public artifact scan passed ({len(tracked_files())} files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
