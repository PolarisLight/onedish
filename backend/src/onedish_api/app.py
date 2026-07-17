"""OneDish FastAPI application factory."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from onedish_api.catalog import load_catalog
from onedish_api.privacy import (
    PrivacyHeadersMiddleware,
    RequestBodyLimitMiddleware,
    sanitized_validation_error,
)
from onedish_api.providers.fixtures import FixturePlacesProvider
from onedish_api.providers.foursquare import FoursquarePlacesProvider
from onedish_api.routes import build_router
from onedish_api.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    catalog = load_catalog(
        config.catalog_path,
        asset_root=config.web_public_path,
    )
    if config.mode == "live" and config.foursquare_api_key:
        places_provider = FoursquarePlacesProvider(config.foursquare_api_key)
    else:
        places_provider = FixturePlacesProvider(config.places_path)

    app = FastAPI(title="OneDish API", version="0.1.0", docs_url=None, redoc_url=None)
    app.state.settings = config
    app.state.catalog = catalog
    app.state.places_provider = places_provider
    app.add_exception_handler(RequestValidationError, sanitized_validation_error)
    app.include_router(build_router(catalog=catalog, places_provider=places_provider))

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(config.allowed_hosts))
    if config.environment == "development":
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Content-Type", "X-Request-ID"],
        )
    app.add_middleware(PrivacyHeadersMiddleware)
    app.add_middleware(RequestBodyLimitMiddleware, max_bytes=config.max_body_bytes)
    return app


app = create_app()
