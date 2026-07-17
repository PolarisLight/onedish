"""Privacy-minimized Foursquare Places adapter."""

from __future__ import annotations

from time import monotonic
from typing import Any

import httpx

from onedish_api.domain import Place
from onedish_api.providers.base import PlaceQuery


class FoursquarePlacesProvider:
    URL = "https://places-api.foursquare.com/places/search"
    VERSION = "2025-06-17"

    def __init__(self, api_key: str, *, cache_seconds: int = 900) -> None:
        if not api_key.strip():
            raise ValueError("Foursquare API key is required")
        self._api_key = api_key
        self._cache_seconds = cache_seconds
        self._cache: dict[tuple[float, float, int, int], tuple[float, tuple[Place, ...]]] = {}

    async def nearby(self, query: PlaceQuery) -> tuple[Place, ...]:
        key = (round(query.latitude, 2), round(query.longitude, 2), query.radius_m, query.limit)
        cached = self._cache.get(key)
        if cached and monotonic() - cached[0] < self._cache_seconds:
            return cached[1]
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "X-Places-Api-Version": self.VERSION,
            "Accept": "application/json",
        }
        params = {
            "ll": f"{query.latitude:.6f},{query.longitude:.6f}",
            "radius": str(query.radius_m),
            "limit": str(query.limit),
            "query": "restaurant",
            "fields": "fsq_place_id,name,categories,distance,price,rating,hours,link",
        }
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0), trust_env=False) as client:
                response = await client.get(self.URL, headers=headers, params=params)
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"Foursquare request failed with status {exc.response.status_code}") from None
        except (httpx.HTTPError, ValueError, TypeError):
            raise RuntimeError("Foursquare request failed") from None
        results = payload.get("results")
        if not isinstance(results, list):
            raise RuntimeError("Foursquare returned an invalid response")
        places = tuple(self._normalize(item) for item in results[: query.limit])
        self._cache[key] = (monotonic(), places)
        return places

    @staticmethod
    def _normalize(raw: dict[str, Any]) -> Place:
        categories = raw.get("categories") or []
        category = categories[0].get("name", "Restaurant") if categories else "Restaurant"
        open_now = (raw.get("hours") or {}).get("open_now")
        open_state = "open" if open_now is True else "closed" if open_now is False else "unknown"
        link = raw.get("link")
        destination = link if isinstance(link, str) and link.startswith("https://") else None
        return Place(
            id=str(raw["fsq_place_id"]),
            name=str(raw["name"]),
            category=str(category),
            distance_m=int(raw.get("distance", 0)),
            price_tier=raw.get("price"),
            rating=raw.get("rating"),
            open_state=open_state,
            order_destination=destination,
            source_kind="foursquare_place",
            attribution="Foursquare Places",
        )
