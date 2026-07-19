#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


MARKER = "__AMAP_SECURITY_CODE__"
VALID_CODE = re.compile(r"[A-Za-z0-9_-]{8,128}")


def render(template_path: Path, secret_path: Path, output_path: Path) -> None:
    template = template_path.read_text(encoding="utf-8")
    secret = secret_path.read_text(encoding="utf-8").strip()
    if template.count(MARKER) != 1:
        raise ValueError("template must contain exactly one security-code marker")
    if VALID_CODE.fullmatch(secret) is None:
        raise ValueError("security code has an invalid format")
    rendered = template.replace(MARKER, secret)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary.write_text(rendered, encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(output_path)


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print("usage: render_openresty_config.py TEMPLATE SECRET OUTPUT", file=sys.stderr)
        return 2
    try:
        render(Path(argv[1]), Path(argv[2]), Path(argv[3]))
    except (OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
