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
    assert all(dish.translations["zh-CN"].name.strip() for dish in catalog.dishes)
    assert all(dish.translations["zh-CN"].description.strip() for dish in catalog.dishes)
    assert len(catalog_sha256(catalog)) == 64


def test_catalog_hash_is_stable() -> None:
    catalog = load_catalog(ROOT / "data/catalog.v1.json", asset_root=ROOT / "web/public")
    assert catalog_sha256(catalog) == catalog_sha256(catalog.model_copy(deep=True))


def test_catalog_has_complete_natural_chinese_dish_copy() -> None:
    catalog = load_catalog(ROOT / "data/catalog.v1.json", asset_root=ROOT / "web/public")
    assert len(catalog.dishes) == 90
    assert len({dish.id for dish in catalog.dishes}) == 90
    assert all(set(dish.translations) == {"zh-CN"} for dish in catalog.dishes)
    by_id = {dish.id: dish for dish in catalog.dishes}
    assert by_id["ember-bowl-charred-chicken-rice"].translations["zh-CN"].name == "炭烤鸡肉饭"
    assert by_id["night-market-fire-noodle-cup"].translations["zh-CN"].name == "香辣热拌面"


def test_catalog_rejects_missing_image(tmp_path: Path) -> None:
    path = ROOT / "data/catalog.v1.json"
    with pytest.raises(CatalogError, match="missing image"):
        load_catalog(path, asset_root=tmp_path)
