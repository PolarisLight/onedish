"""Deterministic place provider for demo and tests."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import TypeAdapter

from onedish_api.domain import Place
from onedish_api.providers.base import PlaceQuery


class FixturePlacesProvider:
    def __init__(self, path: Path) -> None:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("version") != "places.v1":
            raise ValueError("unsupported fixture places version")
        self._places = TypeAdapter(tuple[Place, ...]).validate_python(payload["places"])

    async def nearby(self, query: PlaceQuery) -> tuple[Place, ...]:
        return tuple(place for place in self._places if place.distance_m <= query.radius_m)[: query.limit]
