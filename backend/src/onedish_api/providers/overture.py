"""Read-only nearby search over a licensed local Overture artifact."""

from __future__ import annotations

import json
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from urllib.parse import urlencode

from pydantic import BaseModel, ConfigDict, Field

from onedish_api.domain import Place
from onedish_api.providers.base import PlaceQuery


class _OpenPlace(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    confidence: float = Field(default=0.5, ge=0, le=1)
    upstream_sources: tuple[str, ...] = Field(min_length=1)


class _Artifact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: str = Field(pattern=r"^onedish-overture\.v1$")
    generated_at: str
    bbox: tuple[float, float, float, float]
    attribution: str = Field(min_length=1, max_length=160)
    places: tuple[_OpenPlace, ...]


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    earth_m = 6_371_000
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    value = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return round(2 * earth_m * asin(sqrt(value)))


class OverturePlacesProvider:
    def __init__(self, path: Path) -> None:
        self._artifact = _Artifact.model_validate(json.loads(path.read_text(encoding="utf-8")))

    async def nearby(self, query: PlaceQuery) -> tuple[Place, ...]:
        matches: list[Place] = []
        for item in self._artifact.places:
            distance = _distance_m(
                query.latitude, query.longitude, item.latitude, item.longitude
            )
            if distance > query.radius_m:
                continue
            marker = "https://www.openstreetmap.org/?" + urlencode({
                "mlat": f"{item.latitude:.6f}",
                "mlon": f"{item.longitude:.6f}",
                "zoom": "18",
            })
            matches.append(Place(
                id=item.id,
                name=item.name,
                category=item.category,
                distance_m=distance,
                price_tier=None,
                rating=None,
                open_state="unknown",
                order_destination=marker,
                source_kind="overture_place",
                attribution=self._artifact.attribution,
                latitude=item.latitude,
                longitude=item.longitude,
            ))
        matches.sort(key=lambda place: (place.distance_m, place.name.casefold(), place.id))
        return tuple(matches[: query.limit])
