"""Versioned demonstration catalog loading and validation."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pydantic import ValidationError

from onedish_api.domain import Catalog


class CatalogError(ValueError):
    """Raised when the reviewed demonstration catalog is inconsistent."""


def load_catalog(path: Path, *, asset_root: Path) -> Catalog:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        catalog = Catalog.model_validate(raw)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        raise CatalogError(f"invalid catalog: {exc}") from exc

    restaurant_ids = {restaurant.id for restaurant in catalog.restaurants}
    if len(restaurant_ids) != len(catalog.restaurants):
        raise CatalogError("duplicate restaurant id")
    dish_ids = {dish.id for dish in catalog.dishes}
    if len(dish_ids) != len(catalog.dishes):
        raise CatalogError("duplicate dish id")
    unknown = sorted({dish.restaurant_id for dish in catalog.dishes} - restaurant_ids)
    if unknown:
        raise CatalogError(f"unknown restaurant ids: {', '.join(unknown)}")
    missing_zh = sorted(dish.id for dish in catalog.dishes if "zh-CN" not in dish.translations)
    if missing_zh:
        raise CatalogError(f"missing zh-CN dish translations: {', '.join(missing_zh)}")

    for dish in catalog.dishes:
        relative = dish.image.removeprefix("/")
        if not (asset_root / relative).is_file():
            raise CatalogError(f"missing image for {dish.id}: {dish.image}")
        if dish.image not in catalog.image_attribution:
            raise CatalogError(f"missing image attribution for {dish.id}: {dish.image}")
    return catalog


def catalog_sha256(catalog: Catalog) -> str:
    canonical = json.dumps(
        catalog.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()
