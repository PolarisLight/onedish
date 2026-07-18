"""Build the reviewed fictional OneDish demo catalog deterministically."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FOOD = ROOT / "web/public/food"

RESTAURANTS = (
    ("ember-bowl", "Ember Bowl", "asian", "#d45e2c"),
    ("green-room", "Green Room", "mediterranean", "#b7dd49"),
    ("copper-tandoor", "Copper Tandoor", "indian", "#d98727"),
    ("mesa-luna", "Mesa Luna", "latin", "#e0b94e"),
    ("olive-line", "Olive Line", "mediterranean", "#8fad63"),
    ("night-market", "Night Market", "asian", "#cf584d"),
    ("grain-signal", "Grain Signal", "mixed", "#d8c77a"),
    ("broth-house", "Broth House", "asian", "#db7447"),
    ("field-fire", "Field & Fire", "american", "#c46b3c"),
    ("sumac-kitchen", "Sumac Kitchen", "middle-eastern", "#c5a555"),
)

TEMPLATES = (
    ("charred-chicken-rice", "Charred Chicken Rice Bowl", "rice", 560, 660, 42, 50, 20, ("warm", "filling"), ("soy", "sesame")),
    ("ginger-tofu-bowl", "Ginger Tofu Bowl", "rice", 480, 590, 25, 34, 20, ("warm", "fresh"), ("soy", "sesame")),
    ("crisp-herb-salad", "Crisp Herb Salad", "greens", 330, 430, 18, 26, 10, ("cold", "light", "crisp"), ("milk",)),
    ("fire-noodle-cup", "Fire Noodle Cup", "noodles", 610, 760, 21, 30, 25, ("warm", "spicy", "rich"), ("gluten", "soy")),
    ("turmeric-chicken-wrap", "Turmeric Chicken Wrap", "flatbread", 510, 630, 36, 44, 20, ("warm", "filling"), ("gluten", "milk")),
    ("lentil-comfort-curry", "Lentil Comfort Curry", "lentils", 470, 600, 24, 32, 25, ("warm", "comforting"), ()),
    ("miso-salmon-plate", "Miso Salmon Plate", "fish", 520, 650, 39, 48, 30, ("warm", "fresh"), ("fish", "soy")),
    ("roasted-veg-soup", "Roasted Vegetable Soup", "vegetables", 300, 420, 12, 20, 15, ("warm", "light", "comforting"), ("celery",)),
    ("smoky-beef-plate", "Smoky Beef Plate", "beef", 650, 790, 45, 55, 30, ("warm", "rich", "filling"), ("milk",)),
)

DISH_COPY = {
    "charred-chicken-rice": (
        "炭烤鸡肉饭",
        "炭烤鸡肉搭配米饭和时蔬，香气浓郁，饱腹感十足。",
    ),
    "ginger-tofu-bowl": (
        "姜香豆腐饭",
        "嫩豆腐裹上姜香酱汁，搭配米饭和时蔬，清新又温暖。",
    ),
    "crisp-herb-salad": (
        "脆爽香草沙拉",
        "新鲜叶菜与香草拌成的轻盈沙拉，口感脆爽。",
    ),
    "fire-noodle-cup": (
        "香辣热拌面",
        "热面拌入香辣酱汁和时蔬，味道浓郁，辣度醒目。",
    ),
    "turmeric-chicken-wrap": (
        "姜黄鸡肉卷",
        "姜黄香料鸡肉与时蔬裹入柔软饼皮，温热又饱腹。",
    ),
    "lentil-comfort-curry": (
        "暖香扁豆咖喱",
        "扁豆与温和香料慢煮成浓郁咖喱，温暖舒心。",
    ),
    "miso-salmon-plate": (
        "味噌三文鱼餐盘",
        "味噌调味的三文鱼搭配时蔬，鲜香清爽，蛋白质充足。",
    ),
    "roasted-veg-soup": (
        "烤蔬菜浓汤",
        "烤蔬菜慢煮成温热浓汤，口感轻盈，柔和舒心。",
    ),
    "smoky-beef-plate": (
        "烟熏牛肉餐盘",
        "烟香牛肉搭配时蔬，风味浓厚，饱腹感十足。",
    ),
}


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build() -> None:
    FOOD.mkdir(parents=True, exist_ok=True)
    restaurants = []
    dishes = []
    attributions = {}
    for restaurant_index, (rid, name, cuisine, color) in enumerate(RESTAURANTS):
        restaurants.append(
            {"id": rid, "name": name, "cuisine_tags": [cuisine], "source_kind": "demo_restaurant"}
        )
        image = f"/food/{rid}.svg"
        attributions[image] = "Original geometric placeholder generated for OneDish; replace before publication."
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#100d0b"/><circle cx="600" cy="390" r="290" fill="{color}"/>
<circle cx="505" cy="330" r="95" fill="#f3ead8"/><circle cx="700" cy="430" r="120" fill="#23201b"/>
<text x="72" y="730" fill="#f3ead8" font-family="Arial" font-size="58">{name}</text></svg>'''
        (FOOD / f"{rid}.svg").write_text(svg, encoding="utf-8")

        for template_index, template in enumerate(TEMPLATES):
            slug, dish_name, base, emin, emax, pmin, pmax, minutes, tastes, allergens = template
            zh_name, zh_description = DISH_COPY[slug]
            price = 1_080 + restaurant_index * 45 + template_index * 57
            energy_shift = (restaurant_index % 3 - 1) * 15
            protein_shift = restaurant_index % 4
            description = f"A fictional demo serving of {dish_name.lower()} with a {cuisine} profile."
            dishes.append(
                {
                    "id": f"{rid}-{slug}",
                    "restaurant_id": rid,
                    "name": dish_name,
                    "description": description,
                    "translations": {
                        "zh-CN": {
                            "name": zh_name,
                            "description": zh_description,
                        }
                    },
                    "price_minor": price,
                    "currency": "USD",
                    "energy_kcal": {"min": emin + energy_shift, "max": emax + energy_shift},
                    "protein_g": {"min": pmin + protein_shift, "max": pmax + protein_shift},
                    "confidence": "medium" if template_index % 3 else "high",
                    "allergens": list(allergens),
                    "possible_allergens": [],
                    "ingredients": [base, "vegetables", "house seasoning"],
                    "cuisine_tags": [cuisine],
                    "taste_tags": list(tastes),
                    "base_ingredient": base,
                    "image": image,
                    "nutrition_provenance": "estimated_demo",
                    "source_kind": "demo_menu",
                    "estimated_minutes": minutes,
                }
            )

    write_json(
        DATA / "catalog.v1.json",
        {
            "version": "catalog.v1",
            "restaurants": restaurants,
            "dishes": dishes,
            "image_attribution": attributions,
        },
    )
    write_json(
        DATA / "places.v1.json",
        {
            "version": "places.v1",
            "places": [
                {
                    "id": f"fixture-{rid}",
                    "name": name,
                    "category": "Restaurant",
                    "distance_m": 420 + index * 135,
                    "price_tier": 2,
                    "rating": round(8.8 - index * 0.13, 1),
                    "open_state": "open" if index != 8 else "closed",
                    "order_destination": f"https://example.com/search?q={rid}",
                    "source_kind": "fixture_place",
                    "attribution": "OneDish fixture place",
                }
                for index, (rid, name, _cuisine, _color) in enumerate(RESTAURANTS)
            ],
        },
    )
    now = datetime(2026, 7, 18, 11, 0, tzinfo=timezone.utc)
    write_json(
        DATA / "history.v1.json",
        {
            "version": "history.v1",
            "events": [
                {
                    "id": f"meal-{index + 1}",
                    "occurred_at": (now - timedelta(days=index + 1)).isoformat(),
                    "kind": "eaten",
                    "dish_id": "night-market-fire-noodle-cup" if index < 2 else f"meal-demo-{index}",
                    "cuisine_tags": ["asian" if index < 2 else "mixed"],
                    "taste_tags": ["warm", "filling"],
                    "base_ingredient": "noodles" if index < 2 else "rice",
                    "energy_kcal": {"min": 560, "max": 680},
                    "protein_g": {"min": 22, "max": 30},
                    "price_minor": 1450,
                    "rejection_reason": None,
                }
                for index in range(6)
            ],
        },
    )
    write_json(
        DATA / "context.v1.json",
        {
            "version": "context.v1",
            "entry": {
                "source": "synthetic",
                "energy_consumed_kcal": 1180,
                "protein_consumed_g": 72,
                "daily_energy_goal_kcal": 1900,
                "daily_protein_goal_g": 110,
                "meal_energy_range_kcal": {"min": 500, "max": 720},
                "sleep_minutes": 342,
                "comfort_from_sleep_enabled": True,
            },
        },
    )


if __name__ == "__main__":
    build()
