"""Copy canonical runtime data into the Vite public bundle."""

from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).parents[1]
DESTINATION = ROOT / "web" / "public" / "data"
FILES = ("decision.v2.json", "catalog.v1.json", "places.v1.json", "parity.v2.json")


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copyfile(ROOT / "data" / name, DESTINATION / name)


if __name__ == "__main__":
    main()
