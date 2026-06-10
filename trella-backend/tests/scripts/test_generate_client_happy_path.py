"""Integration test for the happy path of `scripts/generate-client.sh`.

Implements task 3.2 of the `trella-frontend-api-codegen` spec and validates
Requirements 4.2 and 4.3:

  4.2: WHEN Generate_Client_Script được chạy với venv của Trella_Backend đã
       active, THE Generate_Client_Script SHALL gọi Trella_Backend bằng Python
       để xuất OpenAPI schema bằng `app.main:app.openapi()` và ghi kết quả ra
       `trella-frontend/openapi.json`.

  4.3: WHEN Generate_Client_Script đã ghi xong OpenAPI_Spec_File, THE
       Generate_Client_Script SHALL chạy NPM_Script `generate-client` bên
       trong thư mục `trella-frontend/`.

Strategy: build a sandboxed repo layout under pytest's `tmp_path` containing
- a copy of the real `scripts/generate-client.sh`,
- a stub `app.main` exposing a minimal valid OpenAPI document,
- a stub `package.json` whose `generate-client` script writes a sentinel
  file into `lib/client/` (mimicking what the real codegen does).

Then execute the script with `bash` and assert that both `openapi.json`
(with the expected stub content) and `lib/client/index.ts` (the regen
sentinel) are present after the run. The test skips when no working `bash`
or `npm` is available on the host.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

# Repo root is three levels above this file:
#   tests/scripts/<this>.py -> tests -> trella-backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
REAL_SCRIPT_PATH = REPO_ROOT / "scripts" / "generate-client.sh"


def _find_working_bash() -> str | None:
    """Return the first bash executable that runs `echo ok` successfully.

    On Windows the default `bash` on PATH is often the WSL shim, which can
    be misconfigured on dev machines. We prefer Git Bash when available and
    fall back to PATH bash. On Unix the PATH bash is typically sufficient.
    """
    candidates: list[str] = []
    if sys.platform == "win32":
        candidates.extend(
            [
                r"C:\Program Files\Git\bin\bash.exe",
                r"C:\Program Files (x86)\Git\bin\bash.exe",
            ]
        )
    path_bash = shutil.which("bash")
    if path_bash and path_bash not in candidates:
        candidates.append(path_bash)

    for candidate in candidates:
        if not os.path.isfile(candidate):
            continue
        try:
            result = subprocess.run(
                [candidate, "-c", "echo ok"],
                capture_output=True,
                timeout=15,
                text=True,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if result.returncode == 0 and "ok" in result.stdout:
            return candidate
    return None


def _find_npm() -> str | None:
    """Locate `npm` (Windows-friendly) so the test can skip when Node is absent."""
    return shutil.which("npm") or shutil.which("npm.cmd")


_STUB_APP_MAIN = '''"""Stub `app.main` module used by the orchestration-script integration test.

Exposes a single ``app`` object whose ``openapi()`` method returns a minimal
but valid OpenAPI document, mirroring the contract used by the real FastAPI
application.
"""


class _StubApp:
    def openapi(self) -> dict:
        return {
            "openapi": "3.0.0",
            "info": {"title": "stub", "version": "0.1.0"},
            "paths": {},
        }


app = _StubApp()
'''

_STUB_GENERATE_STUB_JS = """// Stub for `npm run generate-client`. Mimics the real codegen by writing
// a sentinel file into `lib/client/` so the integration test can prove
// the codegen step ran end-to-end.
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, 'lib', 'client');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.ts'), '// regenerated stub\\n');
"""

_STUB_PACKAGE_JSON = json.dumps(
    {
        "name": "trella-frontend-stub",
        "version": "0.0.0",
        "private": True,
        "scripts": {
            "generate-client": "node ./generate-stub.js",
        },
    },
    indent=2,
)


@pytest.fixture(scope="module")
def bash_path() -> str:
    bash = _find_working_bash()
    if bash is None:
        pytest.skip("No working bash interpreter available on this host")
    return bash


@pytest.fixture(scope="module")
def npm_path() -> str:
    npm = _find_npm()
    if npm is None:
        pytest.skip("npm is not installed on this host")
    return npm


def _build_sandbox(root: Path) -> None:
    """Materialize a minimal repo layout under ``root`` for the script to run in."""
    scripts_dir = root / "scripts"
    backend_dir = root / "trella-backend"
    backend_app_dir = backend_dir / "app"
    frontend_dir = root / "trella-frontend"

    scripts_dir.mkdir(parents=True)
    backend_app_dir.mkdir(parents=True)
    frontend_dir.mkdir(parents=True)

    shutil.copy2(REAL_SCRIPT_PATH, scripts_dir / "generate-client.sh")

    (backend_app_dir / "__init__.py").write_text("", encoding="utf-8")
    (backend_app_dir / "main.py").write_text(_STUB_APP_MAIN, encoding="utf-8")

    (frontend_dir / "package.json").write_text(
        _STUB_PACKAGE_JSON, encoding="utf-8"
    )
    (frontend_dir / "generate-stub.js").write_text(
        _STUB_GENERATE_STUB_JS, encoding="utf-8"
    )


def test_generate_client_script_writes_openapi_and_regenerates_client(
    tmp_path: Path,
    bash_path: str,
    npm_path: str,
) -> None:
    """Validates Requirements 4.2, 4.3.

    The orchestration script SHALL export the OpenAPI schema from ``app.main``
    to ``trella-frontend/openapi.json`` and SHALL run the ``generate-client``
    npm script which regenerates ``trella-frontend/lib/client/``.
    """
    _build_sandbox(tmp_path)
    backend_dir = tmp_path / "trella-backend"
    frontend_dir = tmp_path / "trella-frontend"

    env = os.environ.copy()
    # Force the stub `app.main` to be the only one Python can see, regardless
    # of any globally installed `app` package on the developer's machine.
    env["PYTHONPATH"] = str(backend_dir)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    # Ensure no caller-side `SKIP_CODEGEN` leaks in and short-circuits the script.
    env.pop("SKIP_CODEGEN", None)

    # Use a relative path for the script so bash on Windows (Git Bash)
    # resolves BASH_SOURCE to a posix-style path inside the sandbox cwd.
    result = subprocess.run(
        [bash_path, "scripts/generate-client.sh"],
        cwd=str(tmp_path),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert result.returncode == 0, (
        f"orchestration script exited {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )

    # Requirement 4.2: openapi.json must be written with the schema content.
    openapi_path = frontend_dir / "openapi.json"
    assert openapi_path.is_file(), (
        f"Expected openapi.json at {openapi_path}; "
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    schema = json.loads(openapi_path.read_text(encoding="utf-8"))
    assert schema == {
        "openapi": "3.0.0",
        "info": {"title": "stub", "version": "0.1.0"},
        "paths": {},
    }, f"openapi.json content drifted from stub: {schema!r}"

    # Requirement 4.3: lib/client/ must be regenerated by `npm run generate-client`.
    regen_marker = frontend_dir / "lib" / "client" / "index.ts"
    assert regen_marker.is_file(), (
        f"Expected `lib/client/index.ts` at {regen_marker} after codegen; "
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert (
        regen_marker.read_text(encoding="utf-8") == "// regenerated stub\n"
    ), "regen sentinel file did not contain expected content"
