"""Runtime configuration with explicit demo/live boundaries."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_source_checkout_root(module_path: Path) -> Path | None:
    """Return a repository root only when source-checkout markers are present."""
    for candidate in module_path.resolve().parents:
        if (
            (candidate / ".env.example").is_file()
            and (candidate / "backend" / "pyproject.toml").is_file()
            and (candidate / "web" / "vite.config.ts").is_file()
        ):
            return candidate
    return None


SOURCE_CHECKOUT_ROOT = find_source_checkout_root(Path(__file__))


def default_root_path() -> Path:
    if SOURCE_CHECKOUT_ROOT is not None:
        return SOURCE_CHECKOUT_ROOT
    raise ValueError(
        "ONEDISH_ROOT_PATH is required when OneDish runs outside its source checkout"
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(SOURCE_CHECKOUT_ROOT / ".env.local" if SOURCE_CHECKOUT_ROOT else None),
        env_prefix="ONEDISH_",
        extra="ignore",
        populate_by_name=True,
    )

    mode: Literal["demo", "live"] = "demo"
    environment: Literal["development", "production", "test"] = "development"
    root_path: Path = Field(default_factory=default_root_path)
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1", "testserver")
    openai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_API_KEY", "ONEDISH_OPENAI_API_KEY"),
    )
    foursquare_api_key: str | None = None
    amap_web_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("AMAP_WEB_KEY", "ONEDISH_AMAP_WEB_KEY"),
    )
    max_body_bytes: int = Field(default=65_536, ge=1_024, le=1_048_576)

    @property
    def catalog_path(self) -> Path:
        return self.root_path / "data" / "catalog.v1.json"

    @property
    def places_path(self) -> Path:
        return self.root_path / "data" / "places.v1.json"

    @property
    def decision_rules_path(self) -> Path:
        return self.root_path / "data" / "decision.v2.json"

    @property
    def overture_places_path(self) -> Path:
        return self.root_path / "data" / "restaurants.xiamen.v1.json"

    @property
    def web_public_path(self) -> Path:
        return self.root_path / "web" / "public"

    @property
    def cache_path(self) -> Path:
        return self.root_path / ".cache" / "interpretations.sqlite3"
