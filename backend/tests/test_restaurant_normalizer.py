from onedish_api.domain import Place
from onedish_api.restaurants.normalizer import deduplicate, normalize_name, normalize_places


def place(source: str, place_id: str, name: str, distance: int) -> Place:
    return Place(
        id=place_id,
        name=name,
        category="餐饮服务;中餐厅;闽菜",
        distance_m=distance,
        open_state="unknown",
        source_kind=source,
        attribution="source",
        latitude=24.48,
        longitude=118.09,
    )


def test_normalizes_chinese_and_english_punctuation() -> None:
    assert normalize_name(" 沙茶里（厦门店） ") == "沙茶里厦门店"
    assert normalize_name("Taco & Co.") == "tacoco"


def test_source_ids_and_persistence_are_explicit() -> None:
    values = normalize_places((place("amap_place", "A1", "沙茶里", 200),))
    assert values[0].id == "amap:A1"
    assert values[0].persistence == "active_only"
    assert values[0].cuisine_tags == ("fujian",)


def test_deduplicates_same_name_within_eighty_metres() -> None:
    values = normalize_places((
        place("overture_place", "O1", "沙茶里", 240),
        place("amap_place", "A1", "沙 茶 里", 200),
    ))
    result = deduplicate(values)
    assert len(result) == 1
    assert result[0].id == "amap:A1"
    assert result[0].persistence == "active_only"
