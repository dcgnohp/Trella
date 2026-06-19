"""Integration test for the happy path of `scripts/generate-client.sh`.

Originally written for the `trella-frontend-api-codegen` spec (task 3.2),
this test has been refactored to track the new contract introduced by
`backend-modular-refactor` task 20.1 (Requirement 17.4): the script now
fetches the OpenAPI document from a *running* backend over HTTP rather
than importing `app.main` in-process.

The function name (test id) is kept stable so CI / spec tracing still
references the same test.

Validates:

- **Requirement 4.2 (orig spec) / 17.4 (refactor):** when the script is
  run with the backend reachable at `NEXT_PUBLIC_API_URL`, it fetches
  the OpenAPI schema from `${NEXT_PUBLIC_API_URL}/api/v1/openapi.json`
  and writes it to `trella-frontend/openapi.json`.
- **Requirement 4.3:** after writing the schema file, the script invokes
  the `generate-client` npm script inside `trella-frontend/`.

Strategy: build a sandboxed repo layout under pytest's `tmp_path` containing
- a copy of the real `scripts/generate-client.sh`,
- a stubbed `package.json` whose `generate-client` script writes a
  sentinel file into `lib/client/` (mimicking what the real codegen
  does).

A tiny HTTP stub backend is spun up on an ephemeral port (`port=0`) using
`http.server.HTTPServer` in a background thread; its URL is passed to
the script via the `NEXT_PUBLIC_API_URL` env var. The stub is shut down
cleanly via `try/finally` even if the test fails.

The test skips when no working `bash` or `npm` is available on the host.
"""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import socket
import subprocess
import sys
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

# Repo root is three levels above this file:
#   tests/scripts/<this>.py -> tests -> trella-backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
REAL_SCRIPT_PATH = REPO_ROOT / "scripts" / "generate-client.sh"

# Path under the running backend where the script fetches the schema.
# Must match `scripts/generate-client.sh`.
OPENAPI_PATH = "/api/v1/openapi.json"

# Stub OpenAPI document the backend serves; after the script runs we
# expect this exact JSON body to be saved to trella-frontend/openapi.json.
STUB_OPENAPI_DOC: dict = {
    "openapi": "3.1.0",
    "info": {"title": "stub", "version": "0.1.0"},
    "paths": {},
}


def _find_working_bash() -> str | None:
    """Return the first bash executable that runs `echo ok` successfully.

    On Windows the default `bash` on PATH is often the WSL shim, which
    can be misconfigured on dev machines. We prefer Git Bash when
    available and fall back to PATH bash. On Unix the PATH bash is
    typically sufficient.
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


# ---------------------------------------------------------------------------
# HTTP stub backend
# ---------------------------------------------------------------------------


def _make_handler(*, body: bytes) -> type[BaseHTTPRequestHandler]:
    """Build a request handler class that serves ``body`` as JSON for GET
    on ``OPENAPI_PATH`` and 404s every other path.
    """

    class _StubHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 — required by BaseHTTPRequestHandler
            if self.path != OPENAPI_PATH:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            # Silence the default stderr access log; tests assert on
            # script output and noise from the stub would obscure it.
            return

    return _StubHandler


@contextlib.contextmanager
def _http_stub_backend(*, body: bytes) -> Iterator[str]:
    """Run an HTTP stub backend on an ephemeral port for the duration of
    the ``with`` block. Yields the base URL (without trailing slash).
    Always shuts the server down cleanly.
    """
    handler_cls = _make_handler(body=body)
    server = HTTPServer(("127.0.0.1", 0), handler_cls)
    host, port = server.server_address[:2]
    thread = threading.Thread(
        target=server.serve_forever,
        name="generate-client-stub-backend",
        daemon=True,
    )
    thread.start()
    try:
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        # Sanity: ensure the port has been released so the temp dir
        # cleanup that follows doesn't race with a still-bound socket.
        with contextlib.suppress(OSError):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.bind(("127.0.0.1", port))


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
    frontend_dir = root / "trella-frontend"

    scripts_dir.mkdir(parents=True)
    frontend_dir.mkdir(parents=True)

    shutil.copy2(REAL_SCRIPT_PATH, scripts_dir / "generate-client.sh")

    (frontend_dir / "package.json").write_text(_STUB_PACKAGE_JSON, encoding="utf-8")
    (frontend_dir / "generate-stub.js").write_text(
        _STUB_GENERATE_STUB_JS, encoding="utf-8"
    )


def test_generate_client_script_writes_openapi_and_regenerates_client(
    tmp_path: Path,
    bash_path: str,
    npm_path: str,
) -> None:
    """Validates Requirements 4.2, 4.3 / 17.4.

    The orchestration script SHALL fetch the OpenAPI schema from the
    running backend at ``${NEXT_PUBLIC_API_URL}/api/v1/openapi.json``
    and write it to ``trella-frontend/openapi.json`` (Req 4.2 / 17.4),
    then SHALL run the ``generate-client`` npm script which regenerates
    ``trella-frontend/lib/client/`` (Req 4.3).
    """
    _build_sandbox(tmp_path)
    frontend_dir = tmp_path / "trella-frontend"

    env = os.environ.copy()
    # Don't leak caller-side overrides into the test.
    for var in ("NEXT_PUBLIC_API_URL", "API_BASE_URL", "SKIP_CODEGEN"):
        env.pop(var, None)
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    body = json.dumps(STUB_OPENAPI_DOC).encode("utf-8")
    with _http_stub_backend(body=body) as base_url:
        env["NEXT_PUBLIC_API_URL"] = base_url
        # Use a relative path for the script so bash on Windows (Git
        # Bash) resolves BASH_SOURCE to a posix-style path inside the
        # sandbox cwd.
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

    # Requirement 4.2 / 17.4: openapi.json must be written with the
    # schema content fetched from the running backend.
    openapi_path = frontend_dir / "openapi.json"
    assert openapi_path.is_file(), (
        f"Expected openapi.json at {openapi_path}; "
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    schema = json.loads(openapi_path.read_text(encoding="utf-8"))
    assert schema == STUB_OPENAPI_DOC, (
        f"openapi.json content drifted from stub: {schema!r}"
    )

    # Requirement 4.3: lib/client/ must be regenerated by `npm run generate-client`.
    regen_marker = frontend_dir / "lib" / "client" / "index.ts"
    assert regen_marker.is_file(), (
        f"Expected `lib/client/index.ts` at {regen_marker} after codegen; "
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert regen_marker.read_text(encoding="utf-8") == "// regenerated stub\n", (
        "regen sentinel file did not contain expected content"
    )
