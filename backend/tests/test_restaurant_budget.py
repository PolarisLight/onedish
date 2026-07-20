from onedish_api.restaurants.budget import budget_assessment, stretch_ceiling


def test_cny_stretch_is_percent_limited_then_absolute_capped() -> None:
    assert stretch_ceiling(5000, "CNY") == 6250
    assert stretch_ceiling(20_000, "CNY") == 23_000
    assert stretch_ceiling(50_000, "CNY") == 53_000


def test_usd_stretch_uses_five_dollar_absolute_cap() -> None:
    assert stretch_ceiling(1000, "USD") == 1250
    assert stretch_ceiling(5000, "USD") == 5500


def test_budget_states_and_penalties_are_truthful() -> None:
    assert budget_assessment(None, "CNY", None).state == "not_requested"
    unknown = budget_assessment(None, "CNY", 5000)
    assert (unknown.state, unknown.penalty) == ("unknown", 5.0)
    within = budget_assessment(4800, "CNY", 5000)
    assert (within.state, within.penalty) == ("within", 0.0)
    stretch = budget_assessment(6000, "CNY", 5000)
    assert (stretch.state, stretch.overage_minor, stretch.penalty) == (
        "stretch",
        1000,
        8.0,
    )
    excessive = budget_assessment(7000, "CNY", 5000)
    assert excessive.state == "excessive"
