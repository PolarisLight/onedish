"""OpenAI Responses adapter that can only select a supplied candidate ID."""

from __future__ import annotations

import json
from collections.abc import Sequence

import httpx
from openai import AsyncOpenAI

from onedish_api.rerankers.base import RerankChoice
from onedish_api.restaurant_domain import RankedRestaurant, RestaurantRecommendRequest


_REASONS = [
    "higher_rating",
    "budget_match",
    "taste_match",
    "history_diversity",
    "closer_than_typical",
    "high_confidence",
]


class OpenAIRestaurantReranker:
    def __init__(self, api_key: str, model: str) -> None:
        http_client = httpx.AsyncClient(trust_env=False, timeout=httpx.Timeout(2.0))
        self._client = AsyncOpenAI(
            api_key=api_key,
            max_retries=0,
            timeout=2.0,
            http_client=http_client,
        )
        self._model = model

    async def choose(
        self,
        candidates: Sequence[RankedRestaurant],
        request: RestaurantRecommendRequest,
    ) -> RerankChoice:
        minimized = [
            {
                "id": item.candidate.id,
                "category": item.candidate.category,
                "cuisines": item.candidate.cuisine_tags,
                "distance_bucket_m": min(3000, (item.candidate.distance_m // 250 + 1) * 250),
                "cost_bucket_minor": (
                    None
                    if item.candidate.average_cost_minor is None
                    else (item.candidate.average_cost_minor // 1000 + 1) * 1000
                ),
                "rating": item.candidate.rating,
                "deterministic_score": item.score,
                "supported_reasons": item.reason_codes,
            }
            for item in candidates[:10]
        ]
        response = await self._client.responses.create(
            model=self._model,
            store=False,
            instructions=(
                "Choose exactly one supplied restaurant ID. Prefer the best evidence-bounded "
                "choice using the deterministic scores and supplied candidate fields. Return "
                "only reason codes already listed in supported_reasons for the restaurant you "
                "choose. Do not invent facts or reasons."
            ),
            input=json.dumps(
                {
                    "preferred_cuisines": request.profile.preferred_cuisines,
                    "candidates": minimized,
                },
                ensure_ascii=False,
            ),
            text={
                "format": {
                    "type": "json_schema",
                    "name": "restaurant_choice",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["restaurant_id", "reason_codes"],
                        "properties": {
                            "restaurant_id": {
                                "type": "string",
                                "enum": [item.candidate.id for item in candidates[:10]],
                            },
                            "reason_codes": {
                                "type": "array",
                                "maxItems": 3,
                                "items": {"type": "string", "enum": _REASONS},
                            },
                        },
                    },
                }
            },
        )
        return RerankChoice.model_validate_json(response.output_text)
