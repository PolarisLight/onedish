import asyncio

import pytest

from onedish_api.rerankers.base import RerankChoice, choose_with_timeout, validate_choice
from onedish_api.rerankers.openai import OpenAIRestaurantReranker, _REASONS
from onedish_api.restaurant_domain import (
    RankedRestaurant,
    RestaurantCandidate,
    RestaurantEvidence,
    RestaurantRecommendRequest,
)


def ranked(identifier: str, reasons: tuple[str, ...]) -> RankedRestaurant:
    return RankedRestaurant(
        candidate=RestaurantCandidate(
            id=f"overture:{identifier}",
            name=identifier,
            category="restaurant",
            cuisine_tags=("fujian",),
            distance_m=200,
            open_state="unknown",
            navigation_url="https://www.openstreetmap.org/",
            source_kind="overture_place",
            attribution="Overture",
            persistence="licensed_open_data",
            evidence=RestaurantEvidence(category=True),
        ),
        score=80,
        reason_codes=reasons,
    )


class FakeReranker:
    def __init__(self, choice=None, error=None, delay=0.0):
        self.choice = choice
        self.error = error
        self.delay = delay

    async def choose(self, candidates, request):
        await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return self.choice


def request() -> RestaurantRecommendRequest:
    return RestaurantRecommendRequest(latitude=24.48, longitude=118.09, meal_period="lunch")


def test_validates_id_and_evidence_backed_reasons() -> None:
    values = (ranked("a", ("closer_than_typical",)), ranked("b", ("budget_match",)))
    assert (
        validate_choice(
            RerankChoice(restaurant_id="overture:b", reason_codes=("budget_match",)), values
        )
        == values[1]
    )
    assert (
        validate_choice(RerankChoice(restaurant_id="overture:x", reason_codes=()), values) is None
    )
    assert (
        validate_choice(
            RerankChoice(restaurant_id="overture:b", reason_codes=("higher_rating",)), values
        )
        is None
    )


def test_openai_reranker_exposes_only_current_reason_vocabulary() -> None:
    assert _REASONS == [
        "higher_rating",
        "budget_match",
        "taste_match",
        "history_diversity",
        "closer_than_typical",
        "high_confidence",
    ]


@pytest.mark.asyncio
async def test_openai_reranker_does_not_send_or_instruct_meal_period_reasoning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class Response:
        output_text = '{"restaurant_id":"overture:a","reason_codes":["taste_match"]}'

    async def create(**kwargs):
        captured.update(kwargs)
        return Response()

    reranker = OpenAIRestaurantReranker(api_key="test-key", model="test-model")
    monkeypatch.setattr(reranker._client.responses, "create", create)

    choice = await reranker.choose((ranked("a", ("taste_match",)),), request())

    serialized_input = str(captured["input"]).lower()
    instructions = str(captured["instructions"]).lower()
    schema = captured["text"]["format"]["schema"]
    assert "meal_period" not in serialized_input
    assert "lunch" not in serialized_input
    assert "meal period" not in instructions
    assert "breakfast" not in instructions
    assert "lunch" not in instructions
    assert "dinner" not in instructions
    assert schema["properties"]["restaurant_id"]["enum"] == ["overture:a"]
    assert schema["properties"]["reason_codes"]["items"]["enum"] == _REASONS
    assert choice == RerankChoice(
        restaurant_id="overture:a", reason_codes=("taste_match",)
    )


@pytest.mark.asyncio
async def test_timeout_and_errors_keep_deterministic_order() -> None:
    values = (ranked("a", ("closer_than_typical",)),)
    timeout = await choose_with_timeout(
        FakeReranker(RerankChoice(restaurant_id="overture:a"), delay=0.1),
        values,
        request(),
        timeout_seconds=0.01,
    )
    error = await choose_with_timeout(FakeReranker(error=RuntimeError("no key")), values, request())
    assert timeout.selected is None and timeout.status == "timeout"
    assert error.selected is None and error.status == "error"


@pytest.mark.asyncio
async def test_foreign_choice_is_invalid() -> None:
    values = (ranked("a", ("closer_than_typical",)),)
    outcome = await choose_with_timeout(
        FakeReranker(RerankChoice(restaurant_id="overture:x")), values, request()
    )
    assert outcome.selected is None and outcome.status == "invalid"
