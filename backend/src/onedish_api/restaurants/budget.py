"""Currency-aware restaurant budget stretch policy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


Currency = Literal["CNY", "USD"]
AssessmentState = Literal["not_requested", "within", "stretch", "unknown", "excessive"]
ABSOLUTE_STRETCH_CAP: dict[Currency, int] = {"CNY": 3000, "USD": 500}


@dataclass(frozen=True)
class BudgetAssessment:
    state: AssessmentState
    overage_minor: int | None
    penalty: float


def stretch_ceiling(budget_minor: int, currency: Currency) -> int:
    percent = budget_minor // 4
    return budget_minor + min(percent, ABSOLUTE_STRETCH_CAP[currency])


def budget_assessment(
    cost_minor: int | None,
    currency: Currency,
    budget_minor: int | None,
) -> BudgetAssessment:
    if budget_minor is None:
        return BudgetAssessment("not_requested", None, 0.0)
    if cost_minor is None:
        return BudgetAssessment("unknown", None, 5.0)
    if cost_minor <= budget_minor:
        return BudgetAssessment("within", None, 0.0)
    ceiling = stretch_ceiling(budget_minor, currency)
    overage = cost_minor - budget_minor
    if cost_minor <= ceiling:
        penalty = 10.0 * overage / (ceiling - budget_minor)
        return BudgetAssessment("stretch", overage, penalty)
    return BudgetAssessment("excessive", overage, 10.0)
