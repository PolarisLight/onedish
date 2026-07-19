"""Reranker protocol and evidence validation."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Literal, NamedTuple, Protocol

from pydantic import Field

from onedish_api.domain import StrictFrozenModel
from onedish_api.restaurant_domain import (
    RankedRestaurant,
    RestaurantReasonCode,
    RestaurantRecommendRequest,
)


class RerankChoice(StrictFrozenModel):
    restaurant_id: str
    reason_codes: tuple[RestaurantReasonCode, ...] = Field(default=(), max_length=3)


class RestaurantReranker(Protocol):
    async def choose(
        self,
        candidates: Sequence[RankedRestaurant],
        request: RestaurantRecommendRequest,
    ) -> RerankChoice: ...


class RerankOutcome(NamedTuple):
    selected: RankedRestaurant | None
    status: Literal["selected", "timeout", "invalid", "error"]
    reason_codes: tuple[RestaurantReasonCode, ...] = ()


def validate_choice(
    choice: RerankChoice, candidates: Sequence[RankedRestaurant]
) -> RankedRestaurant | None:
    selected = next(
        (item for item in candidates if item.candidate.id == choice.restaurant_id), None
    )
    if selected is None:
        return None
    if any(reason not in selected.reason_codes for reason in choice.reason_codes):
        return None
    return selected


async def choose_with_timeout(
    reranker: RestaurantReranker,
    candidates: Sequence[RankedRestaurant],
    request: RestaurantRecommendRequest,
    *,
    timeout_seconds: float = 2.0,
) -> RerankOutcome:
    try:
        choice = await asyncio.wait_for(
            reranker.choose(candidates, request), timeout=timeout_seconds
        )
    except TimeoutError:
        return RerankOutcome(None, "timeout")
    except Exception:
        return RerankOutcome(None, "error")
    selected = validate_choice(choice, candidates)
    if selected is None:
        return RerankOutcome(None, "invalid")
    return RerankOutcome(selected, "selected", choice.reason_codes)
