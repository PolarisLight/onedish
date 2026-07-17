def test_package_version() -> None:
    from onedish_api import __version__

    assert __version__ == "0.1.0"
