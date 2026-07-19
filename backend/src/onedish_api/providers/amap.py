"""Privacy-bounded AMap restaurant discovery adapter."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx

from onedish_api.domain import Place
from onedish_api.providers.base import PlaceQuery


class AmapPlacesProvider:
    CONVERT_URL = "https://restapi.amap.com/v3/assistant/coordinate/convert"
    AROUND_URL = "https://restapi.amap.com/v5/place/around"

    def __init__(self, api_key: str) -> None:
        if not api_key.strip():
            raise ValueError("AMap Web service key is required")
        self._api_key = api_key

    async def nearby(self, query: PlaceQuery) -> tuple[Place, ...]:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0), trust_env=False) as client:
                converted = await client.get(
                    self.CONVERT_URL,
                    params={
                        "key": self._api_key,
                        "locations": f"{query.longitude:.6f},{query.latitude:.6f}",
                        "coordsys": "gps",
                        "output": "json",
                    },
                )
                converted.raise_for_status()
                gcj_location = self._converted_location(converted.json())
                response = await client.get(
                    self.AROUND_URL,
                    params={
                        "key": self._api_key,
                        "location": gcj_location,
                        "radius": str(min(query.radius_m, 50_000)),
                        "types": "050000",
                        "sortrule": "weight",
                        "show_fields": "business,photos",
                        "page_size": str(min(query.limit, 25)),
                        "page_num": "1",
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"AMap request failed with status {exc.response.status_code}") from None
        except (httpx.HTTPError, ValueError, TypeError):
            raise RuntimeError("AMap request failed") from None

        if payload.get("status") != "1" or not isinstance(payload.get("pois"), list):
            raise RuntimeError("AMap returned an invalid response")
        return tuple(self._normalize(item) for item in payload["pois"][: query.limit])

    @staticmethod
    def _converted_location(payload: dict[str, Any]) -> str:
        location = payload.get("locations")
        if payload.get("status") != "1" or not isinstance(location, str):
            raise ValueError("invalid coordinate conversion")
        longitude, latitude = AmapPlacesProvider._coordinates(location)
        return f"{longitude:.6f},{latitude:.6f}"

    @staticmethod
    def _coordinates(value: object) -> tuple[float, float]:
        if not isinstance(value, str):
            raise ValueError("missing coordinates")
        longitude_text, latitude_text = value.split(",", 1)
        return float(longitude_text), float(latitude_text)

    @staticmethod
    def _number(value: object) -> float | None:
        try:
            return float(value) if value not in (None, "", []) else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _text(value: object) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() else None

    @classmethod
    def _normalize(cls, raw: dict[str, Any]) -> Place:
        business = raw.get("business") if isinstance(raw.get("business"), dict) else {}
        photos = raw.get("photos") if isinstance(raw.get("photos"), list) else []
        longitude, latitude = cls._coordinates(raw.get("location"))
        name = cls._text(raw.get("name")) or "餐厅"
        cost = cls._number(business.get("cost"))
        rating = cls._number(business.get("rating"))
        distance = cls._number(raw.get("distance")) or 0
        poi_type = cls._text(raw.get("type")) or "餐饮服务"
        category = cls._text(business.get("tag")) or poi_type.rsplit(";", 1)[-1]
        photo = photos[0].get("url") if photos and isinstance(photos[0], dict) else None
        photo_url = photo if isinstance(photo, str) and photo.startswith("https://") else None
        marker_url = "https://uri.amap.com/marker?" + urlencode(
            {
                "position": f"{longitude:.6f},{latitude:.6f}",
                "name": name,
                "src": "onedish",
                "coordinate": "gaode",
                "callnative": "1",
            }
        )
        price_tier = None
        if cost is not None:
            price_tier = 1 if cost <= 30 else 2 if cost <= 80 else 3 if cost <= 150 else 4
        return Place(
            id=str(raw["id"]),
            name=name[:160],
            category=category[:100],
            distance_m=max(0, min(round(distance), 100_000)),
            price_tier=price_tier,
            rating=rating,
            open_state="unknown",
            order_destination=marker_url,
            source_kind="amap_place",
            attribution="高德地图",
            address=cls._text(raw.get("address")),
            average_cost_minor=round(cost * 100) if cost is not None else None,
            currency="CNY" if cost is not None else None,
            latitude=latitude,
            longitude=longitude,
            photo_url=photo_url,
        )
