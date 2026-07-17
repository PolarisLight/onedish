"""Validate the public OneDish demo catalog and assets."""

from __future__ import annotations

from pathlib import Path

from onedish_api.catalog import catalog_sha256, load_catalog


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    catalog = load_catalog(ROOT / "data/catalog.v1.json", asset_root=ROOT / "web/public")
    print(f"version={catalog.version}")
    print(f"restaurants={len(catalog.restaurants)}")
    print(f"dishes={len(catalog.dishes)}")
    print(f"sha256={catalog_sha256(catalog)}")
    print("errors=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
