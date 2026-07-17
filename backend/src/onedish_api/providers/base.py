"""Provider protocols and minimized query contracts."""

from __future__ import annotations

from typing import Protocol

from pydantic import Field

from onedish_api.domain import Place, StrictFrozenModel


class PlaceQuery(StrictFrozenModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=5_000, ge=100, le=100_000)
    limit: int = Field(default=50, ge=1, le=50)


class PlacesProvider(Protocol):
    async def nearby(self, query: PlaceQuery) -> tuple[Place, ...]: ...
