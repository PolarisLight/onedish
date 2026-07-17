"""Safe attributed search-link generation; never cart or checkout actions."""

from __future__ import annotations

from urllib.parse import urlencode, urlsplit

from pydantic import BaseModel, ConfigDict


ALLOWED_SEARCH_HOSTS = {
    "www.ubereats.com": "Uber Eats",
    "deliveroo.co.uk": "Deliveroo",
    "www.doordash.com": "DoorDash",
}


class OrderLink(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    label: str
    url: str | None
    copy_text: str


class OrderLinkProvider:
    def __init__(self, base_url: str | None) -> None:
        self._base_url = base_url
        self._platform = None
        if base_url is not None:
            parsed = urlsplit(base_url)
            if parsed.scheme != "https" or parsed.hostname not in ALLOWED_SEARCH_HOSTS:
                raise ValueError("search link host is not approved")
            self._platform = ALLOWED_SEARCH_HOSTS[parsed.hostname]

    def build(self, *, restaurant_name: str, dish_name: str) -> OrderLink:
        if any(ord(char) < 32 for char in f"{restaurant_name}{dish_name}"):
            raise ValueError("search text contains control characters")
        copy_text = f"{dish_name} — {restaurant_name}"
        if self._base_url is None or self._platform is None:
            return OrderLink(label="Copy dish name", url=None, copy_text=copy_text)
        query = urlencode({"q": f"{dish_name} {restaurant_name}"})
        return OrderLink(
            label=f"Search on {self._platform}",
            url=f"{self._base_url}?{query}",
            copy_text=copy_text,
        )
