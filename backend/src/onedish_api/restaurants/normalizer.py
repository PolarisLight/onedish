"""Pure normalization and conservative cross-source deduplication."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable

from onedish_api.domain import Place
from onedish_api.restaurant_domain import RestaurantCandidate, RestaurantEvidence
from onedish_api.restaurants.taxonomy import tags_for_place


def normalize_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())


def normalize_places(places: Iterable[Place]) -> tuple[RestaurantCandidate, ...]:
    result: list[RestaurantCandidate] = []
    for place in places:
        if place.source_kind not in {"amap_place", "overture_place"}:
            continue
        source = "amap" if place.source_kind == "amap_place" else "overture"
        result.append(RestaurantCandidate(
            id=f"{source}:{place.id}",
            name=place.name,
            category=place.category,
            intent_tags=tags_for_place(place.category, place.category_code)[:6],
            distance_m=place.distance_m,
            rating=place.rating,
            average_cost_minor=place.average_cost_minor,
            currency=place.currency if place.currency in {"CNY", "USD"} else None,
            open_state=place.open_state,
            navigation_url=place.order_destination,
            source_kind=place.source_kind,
            attribution=place.attribution,
            persistence=(
                "active_only" if place.source_kind == "amap_place" else "licensed_open_data"
            ),
            evidence=RestaurantEvidence(
                distance=True,
                rating=place.rating is not None,
                average_cost=place.average_cost_minor is not None,
                category=bool(place.category),
                open_state=place.open_state != "unknown",
            ),
        ))
    return tuple(result)


def deduplicate(
    candidates: Iterable[RestaurantCandidate],
) -> tuple[RestaurantCandidate, ...]:
    ordered = sorted(
        candidates,
        key=lambda item: (
            normalize_name(item.name),
            0 if item.source_kind == "amap_place" else 1,
            item.distance_m,
            item.id,
        ),
    )
    kept: list[RestaurantCandidate] = []
    for candidate in ordered:
        duplicate = next((
            item for item in kept
            if normalize_name(item.name) == normalize_name(candidate.name)
            and abs(item.distance_m - candidate.distance_m) <= 80
        ), None)
        if duplicate is None:
            kept.append(candidate)
            continue
        if candidate.source_kind == "amap_place" and duplicate.source_kind != "amap_place":
            kept[kept.index(duplicate)] = candidate
    return tuple(sorted(kept, key=lambda item: (item.distance_m, item.id)))
