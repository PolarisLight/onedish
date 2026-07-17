from pathlib import Path

import pytest

from onedish_api.catalog import CatalogError, catalog_sha256, load_catalog


ROOT = Path(__file__).parents[2]


def test_versioned_catalog_has_reviewed_demo_shape() -> None:
    catalog = load_catalog(ROOT / "data/catalog.v1.json", asset_root=ROOT / "web/public")
    assert catalog.version == "catalog.v1"
    assert 80 <= len(catalog.dishes) <= 120
    assert 8 <= len(catalog.restaurants) <= 12
    assert len({dish.restaurant_id for dish in catalog.dishes}) == len(catalog.restaurants)
    assert all(dish.source_kind == "demo_menu" for dish in catalog.dishes)
    assert len(catalog_sha256(catalog)) == 64


def test_catalog_hash_is_stable() -> None:
    catalog = load_catalog(ROOT / "data/catalog.v1.json", asset_root=ROOT / "web/public")
    assert catalog_sha256(catalog) == catalog_sha256(catalog.model_copy(deep=True))


def test_catalog_rejects_missing_image(tmp_path: Path) -> None:
    path = ROOT / "data/catalog.v1.json"
    with pytest.raises(CatalogError, match="missing image"):
        load_catalog(path, asset_root=tmp_path)
