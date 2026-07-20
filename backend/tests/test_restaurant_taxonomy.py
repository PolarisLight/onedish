import pytest

from onedish_api.restaurants.taxonomy import INTENT_TAGS, query_filter, tags_for_place


def test_every_intent_tag_has_a_provider_filter() -> None:
    assert len(INTENT_TAGS) == 25
    assert all(spec.keywords or spec.type_codes for spec in INTENT_TAGS.values())


@pytest.mark.parametrize("tag", tuple(INTENT_TAGS))
def test_each_user_tag_builds_one_provider_filter(tag: str) -> None:
    filters = query_filter(tag)
    assert filters.keywords or filters.type_codes


def test_unknown_tag_is_rejected() -> None:
    with pytest.raises(KeyError):
        query_filter("not-a-tag")


def test_category_tokens_do_not_cross_match_unrelated_places() -> None:
    assert tags_for_place(
        "寿司 · 餐饮服务;外国餐厅;日本料理",
        "050201",
    ) == ("japanese",)
    assert "japanese" not in tags_for_place("咖啡厅", "050500")


def test_provider_type_code_can_identify_a_format() -> None:
    assert "hot_pot" in tags_for_place("餐饮服务;中餐厅", "050117")
