import pytest

from onedish_api.order_links import OrderLinkProvider


def test_search_link_is_https_encoded_and_truthfully_labeled() -> None:
    result = OrderLinkProvider("https://www.ubereats.com/search").build(
        restaurant_name="Ember & Bowl", dish_name="Hot rice / chicken"
    )
    assert result.label == "Search on Uber Eats"
    assert result.url.startswith("https://www.ubereats.com/search?")
    assert "Ember+%26+Bowl" in result.url
    assert "Hot+rice+%2F+chicken" in result.url


def test_missing_host_returns_copy_action() -> None:
    result = OrderLinkProvider(None).build(restaurant_name="Ember Bowl", dish_name="Rice Bowl")
    assert result.url is None
    assert result.label == "Copy dish name"
    assert result.copy_text == "Rice Bowl - Ember Bowl"


@pytest.mark.parametrize("url", ["http://example.com", "https://evil.example", "javascript:alert(1)"])
def test_unapproved_search_host_is_rejected(url: str) -> None:
    with pytest.raises(ValueError):
        OrderLinkProvider(url)


def test_control_characters_are_rejected() -> None:
    with pytest.raises(ValueError):
        OrderLinkProvider(None).build(restaurant_name="safe", dish_name="bad\nname")
