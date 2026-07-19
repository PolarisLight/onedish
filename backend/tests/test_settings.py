import importlib.util
from pathlib import Path
import shutil
import sys

import pytest

from onedish_api.settings import Settings


ROOT = Path(__file__).resolve().parents[2]


def test_settings_load_only_the_repository_root_local_environment() -> None:
    assert Settings.model_config["env_file"] == ROOT / ".env.local"


def test_openai_key_accepts_standard_name_and_prefixed_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ONEDISH_OPENAI_API_KEY", "prefixed-key")
    assert Settings(_env_file=None).openai_api_key == "prefixed-key"

    monkeypatch.setenv("OPENAI_API_KEY", "standard-key")
    assert Settings(_env_file=None).openai_api_key == "standard-key"


def test_explicit_empty_test_credentials_override_a_root_dotenv(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dotenv = tmp_path / ".env.local"
    dotenv.write_text(
        "AMAP_WEB_KEY=live-amap\n"
        "ONEDISH_AMAP_WEB_KEY=live-prefixed-amap\n"
        "OPENAI_API_KEY=live-openai\n"
        "ONEDISH_OPENAI_API_KEY=live-prefixed-openai\n"
        "FOURSQUARE_API_KEY=live-foursquare\n"
        "ONEDISH_FOURSQUARE_API_KEY=live-prefixed-foursquare\n",
        encoding="utf-8",
    )
    credential_names = (
        "AMAP_WEB_KEY",
        "ONEDISH_AMAP_WEB_KEY",
        "OPENAI_API_KEY",
        "ONEDISH_OPENAI_API_KEY",
        "FOURSQUARE_API_KEY",
        "ONEDISH_FOURSQUARE_API_KEY",
    )
    for name in credential_names:
        monkeypatch.setenv(name, "")

    settings = Settings(_env_file=dotenv)

    assert not settings.amap_web_key
    assert not settings.openai_api_key
    assert not settings.foursquare_api_key


def test_make_test_clears_provider_and_ai_credentials() -> None:
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
    test_environment = makefile.split("test: runtime-data", 1)[0]
    for name in (
        "AMAP_WEB_KEY",
        "ONEDISH_AMAP_WEB_KEY",
        "OPENAI_API_KEY",
        "ONEDISH_OPENAI_API_KEY",
        "FOURSQUARE_API_KEY",
        "ONEDISH_FOURSQUARE_API_KEY",
    ):
        assert f"{name}=" in test_environment
    assert "$(TEST_ENV) backend/.venv/bin/pytest" in makefile


def test_installed_layout_does_not_infer_a_virtual_environment_parent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    installed = tmp_path / "venv" / "lib" / "site-packages" / "onedish_api"
    installed.mkdir(parents=True)
    copied_settings = installed / "settings.py"
    shutil.copy2(ROOT / "backend" / "src" / "onedish_api" / "settings.py", copied_settings)
    spec = importlib.util.spec_from_file_location("installed_onedish_settings", copied_settings)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        assert module.Settings.model_config["env_file"] is None
        assert module.find_source_checkout_root(copied_settings) is None
        monkeypatch.delenv("ONEDISH_ROOT_PATH", raising=False)
        with pytest.raises(ValueError, match="ONEDISH_ROOT_PATH"):
            module.Settings(_env_file=None)
        deployment_root = tmp_path / "deployment-data"
        monkeypatch.setenv("ONEDISH_ROOT_PATH", str(deployment_root))
        assert module.Settings(_env_file=None).root_path == deployment_root
    finally:
        sys.modules.pop(spec.name, None)
