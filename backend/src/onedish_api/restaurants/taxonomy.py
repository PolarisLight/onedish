"""Canonical restaurant-intent taxonomy and provider query mappings."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IntentTagSpec:
    keywords: tuple[str, ...]
    type_codes: tuple[str, ...]
    category_tokens: tuple[str, ...]


@dataclass(frozen=True)
class QueryFilters:
    keywords: tuple[str, ...]
    type_codes: tuple[str, ...]


INTENT_TAGS: dict[str, IntentTagSpec] = {
    "minnan_fujian": IntentTagSpec(("福建菜", "闽南菜"), (), ("闽菜", "闽南", "福建菜")),
    "sichuan_hunan": IntentTagSpec(("川菜", "湘菜"), (), ("川菜", "四川菜", "湘菜", "湖南菜")),
    "cantonese_dim_sum": IntentTagSpec(("粤菜", "早茶"), (), ("粤菜", "广东菜", "早茶")),
    "jiangzhe": IntentTagSpec(("江浙菜",), (), ("江浙菜", "江苏菜", "浙江菜", "本帮江浙菜")),
    "northeastern": IntentTagSpec(("东北菜",), (), ("东北菜",)),
    "yunnan_guizhou": IntentTagSpec(("云南菜", "贵州菜"), (), ("云南菜", "贵州菜", "云贵菜")),
    "northwestern_xinjiang": IntentTagSpec(("西北菜", "新疆菜"), (), ("西北菜", "新疆菜")),
    "home_style": IntentTagSpec(("家常菜",), (), ("家常菜",)),
    "vegetarian": IntentTagSpec(("素食",), (), ("素食", "素菜")),
    "japanese": IntentTagSpec(("日本料理",), (), ("日本料理", "日本菜", "日料")),
    "korean": IntentTagSpec(("韩国料理",), (), ("韩国料理", "韩国菜", "韩餐")),
    "western": IntentTagSpec(("西餐",), (), ("西餐",)),
    "southeast_asian": IntentTagSpec(("东南亚菜",), (), ("东南亚菜", "泰国菜", "越南菜")),
    "indian": IntentTagSpec(("印度菜",), (), ("印度菜", "印度料理")),
    "middle_eastern": IntentTagSpec(("中东菜",), (), ("中东菜", "阿拉伯餐厅")),
    "hot_pot": IntentTagSpec(("火锅",), ("050117",), ("火锅",)),
    "barbecue": IntentTagSpec(("烧烤", "烤肉"), (), ("烧烤", "烤串", "烤肉")),
    "seafood": IntentTagSpec(("海鲜",), (), ("海鲜",)),
    "noodles": IntentTagSpec(("面馆", "粉面"), (), ("面馆", "粉面", "米粉")),
    "dry_pot_grilled_fish": IntentTagSpec(("香锅", "烤鱼"), (), ("香锅", "烤鱼")),
    "snacks_fast_food": IntentTagSpec(("小吃快餐",), (), ("小吃", "快餐")),
    "buffet": IntentTagSpec(("自助餐",), (), ("自助餐",)),
    "coffee": IntentTagSpec(("咖啡厅",), (), ("咖啡厅", "咖啡店")),
    "bakery_dessert": IntentTagSpec(("面包甜点",), (), ("面包", "甜品", "甜点")),
    "drinks": IntentTagSpec(("饮品店",), (), ("饮品", "奶茶", "果汁")),
}


def query_filter(tag: str) -> QueryFilters:
    """Return the provider filter for one user-owned intent tag."""

    spec = INTENT_TAGS[tag]
    return QueryFilters(keywords=spec.keywords, type_codes=spec.type_codes)


def tags_for_place(category: str | None, category_code: str | None) -> tuple[str, ...]:
    """Classify a transient provider place using conservative evidence."""

    haystack = (category or "").casefold()
    matches: list[str] = []
    for tag, spec in INTENT_TAGS.items():
        token_match = any(token.casefold() in haystack for token in spec.category_tokens)
        code_match = bool(category_code and category_code in spec.type_codes)
        if token_match or code_match:
            matches.append(tag)
    return tuple(matches)
