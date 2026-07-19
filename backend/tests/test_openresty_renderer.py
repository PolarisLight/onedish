from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "render_openresty_config.py"


def run_renderer(tmp_path: Path, code: str) -> subprocess.CompletedProcess[str]:
    template = tmp_path / "template.conf"
    template.write_text(
        "set $args '$args&jscode=__AMAP_SECURITY_CODE__';\n", encoding="utf-8"
    )
    secret = tmp_path / "security-code"
    secret.write_text(code, encoding="utf-8")
    output = tmp_path / "onedish.conf"
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(template), str(secret), str(output)],
        check=False,
        capture_output=True,
        text=True,
    )


def test_renderer_injects_one_valid_code_without_printing_it(tmp_path: Path) -> None:
    code = "safeSecurityCode_1234567890"
    result = run_renderer(tmp_path, code)
    output = tmp_path / "onedish.conf"
    assert result.returncode == 0
    assert result.stdout == ""
    assert result.stderr == ""
    assert output.read_text(encoding="utf-8").count(code) == 1
    assert oct(os.stat(output).st_mode & 0o777) == "0o600"


def test_renderer_rejects_invalid_code_without_printing_it(tmp_path: Path) -> None:
    code = "bad code with spaces"
    result = run_renderer(tmp_path, code)
    assert result.returncode != 0
    assert code not in result.stderr
