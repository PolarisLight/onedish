"""OneDish FastAPI application factory."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from onedish_api.catalog import load_catalog
from onedish_api.engine import load_decision_rules
from onedish_api.privacy import (
    PrivacyHeadersMiddleware,
    RequestBodyLimitMiddleware,
    sanitized_validation_error,
)
from onedish_api.providers.amap import AmapPlacesProvider
from onedish_api.providers.fixtures import FixturePlacesProvider
from onedish_api.providers.foursquare import FoursquarePlacesProvider
from onedish_api.providers.overture import OverturePlacesProvider
from onedish_api.restaurants.service import RestaurantRecommendationService
from onedish_api.routes import build_router
from onedish_api.settings import Settings


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):  # type: ignore[no-untyped-def]
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or "." in path.rsplit("/", 1)[-1]:
                raise
            return FileResponse(Path(str(self.directory)) / "index.html")


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    catalog = load_catalog(
        config.catalog_path,
        asset_root=config.web_public_path,
    )
    decision_rules = load_decision_rules(config.decision_rules_path)
    recommendation_places_provider = FixturePlacesProvider(config.places_path)
    if config.amap_web_key:
        places_provider = AmapPlacesProvider(config.amap_web_key)
    elif config.mode == "live" and config.foursquare_api_key:
        places_provider = FoursquarePlacesProvider(config.foursquare_api_key)
    else:
        places_provider = recommendation_places_provider

    restaurant_providers = [OverturePlacesProvider(config.overture_places_path)]
    if config.amap_web_key:
        restaurant_providers.append(AmapPlacesProvider(config.amap_web_key))
    restaurant_service = RestaurantRecommendationService(providers=restaurant_providers)

    app = FastAPI(title="OneDish API", version="0.1.0", docs_url=None, redoc_url=None)
    app.state.settings = config
    app.state.catalog = catalog
    app.state.decision_rules = decision_rules
    app.state.places_provider = places_provider
    app.state.recommendation_places_provider = recommendation_places_provider
    app.state.restaurant_service = restaurant_service
    app.add_exception_handler(RequestValidationError, sanitized_validation_error)
    app.include_router(
        build_router(
            catalog=catalog,
            places_provider=places_provider,
            recommendation_places_provider=recommendation_places_provider,
            decision_rules=decision_rules,
            restaurant_service=restaurant_service,
        )
    )

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
    production_dist = config.root_path / "web" / "dist"
    if config.environment == "production" and production_dist.is_dir():
        app.mount("/", SPAStaticFiles(directory=production_dist, html=True), name="pwa")
    return app


app = create_app()
