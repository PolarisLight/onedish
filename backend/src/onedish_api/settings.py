"""Runtime configuration with explicit demo/live boundaries."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="ONEDISH_",
        extra="ignore",
    )

    mode: Literal["demo", "live"] = "demo"
    environment: Literal["development", "production", "test"] = "development"
    root_path: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[3])
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1", "testserver")
    openai_api_key: str | None = None
    foursquare_api_key: str | None = None
    max_body_bytes: int = Field(default=65_536, ge=1_024, le=1_048_576)

    @property
    def catalog_path(self) -> Path:
        return self.root_path / "data" / "catalog.v1.json"

    @property
    def places_path(self) -> Path:
        return self.root_path / "data" / "places.v1.json"

    @property
    def web_public_path(self) -> Path:
        return self.root_path / "web" / "public"

    @property
    def cache_path(self) -> Path:
        return self.root_path / ".cache" / "interpretations.sqlite3"
