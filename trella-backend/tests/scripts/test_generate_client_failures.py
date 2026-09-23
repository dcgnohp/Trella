"""Integration tests for failure paths of `scripts/generate-client.sh`.

Originally written for the `trella-frontend-api-codegen` spec (task 3.3),
these tests have been refactored to track the new contract introduced by
`backend-modular-refactor` task 20.1 (Requirement 17.4): the script now
fetches the OpenAPI document from a *running* backend over HTTP rather
than importing `app.main` in-process.

Test ids (function names) are kept stable so CI / spec tracing still
references the same tests.

Validates:

- **Requirement 4.4 (orig spec) / 17.4 (refactor):** when the schema fetch
  fails (HTTP 5xx), the orchestration script halts before codegen and
  exits non-zero, with `lib/client/` not created/modified.
- **Requirement 4.5 (orig spec):** codegen failure exits non-zero and
  surfaces codegen stderr to the caller's stderr.
- **Requirement 4.7 (orig spec):** `SKIP_CODEGEN=1` writes
  `openapi.json`, exits 0, and leaves `lib/client/` untouched.

Each test stages an isolated temp repo layout that mirrors the real one:

    <tmp>/scripts/generate-client.sh        (copied from real script)
    <tmp>/trella-frontend/package.json      (stubbed npm generate-client)

A tiny HTTP stub backend is spun up on an ephemeral port (`port=0`) using
`http.server.HTTPServer` in a background thread; its URL is passed to the
script via the `NEXT_PUBLIC_API_URL` env var (the script reads that
directly). The stub is shut down cleanly via `try/finally` even if the
test fails.

The tests skip cleanly if no usable `bash` is available. On Windows we
look for Git Bash explicitly because the `bash` on PATH on a default
Windows installation is the WSL launcher, which cannot execute
Windows-path scripts or call `npm.cmd` directly.
"""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import socket
import subprocess
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest


REAL_SCRIPT_PATH = (
    Path(__file__).resolve().parents[3] / "scripts" / "generate-client.sh"
)

# Path under the running backend where the script fetches the schema.
# Must match `scripts/generate-client.sh`.
OPENAPI_PATH = "/api/v1/openapi.json"

# Minimal valid OpenAPI document used as the happy-path stub response.
STUB_OPENAPI_DOC: dict = {
    "openapi": "3.1.0",
    "info": {"title": "stub", "version": "0.0.0"},
    "paths": {},
}


def _find_bash() -> str | None:
    """Return a bash executable that can run a Windows-path shell script.

    On Windows, prefer Git Bash over the system `bash.exe` (which is the
    WSL launcher and cannot run Windows-path scripts directly).
    """
    if os.name == "nt":
        windows_candidates = [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
        ]
        for candidate in windows_candidates:
            if Path(candidate).is_file():
                return candidate
        # Fall back to PATH but exclude WSL's system32 bash.
        path_bash = shutil.which("bash")
        if path_bash and "system32" not in path_bash.lower():
            return path_bash
        return None
    return shutil.which("bash")


BASH = _find_bash()
NPM = shutil.which("npm") or shutil.which("npm.cmd")


pytestmark = pytest.mark.skipif(
    BASH is None,
    reason="No usable bash on PATH (Git Bash on Windows, or POSIX bash)",
)


# ---------------------------------------------------------------------------
# HTTP stub backend
# ---------------------------------------------------------------------------


def _make_handler(*, status: int, body: bytes | None) -> type[BaseHTTPRequestHandler]:
    """Build a request handler class that responds to GET ``OPENAPI_PATH``
    with the given status and body. Other paths get a 404. The handler
    silences access-log output to keep pytest output readable.
    """

    class _StubHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 — required by BaseHTTPRequestHandler
            if self.path != OPENAPI_PATH:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(status)
            if body is not None:
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_header("Content-Length", "0")
                self.end_headers()

        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            # Silence the default stderr access log; tests assert on
            # script output and noise from the stub would obscure it.
            return

    return _StubHandler


@contextlib.contextmanager
def _http_stub_backend(*, status: int, body: bytes | None) -> Iterator[str]:
    """Run an HTTP stub backend on an ephemeral port for the duration of
    the ``with`` block. Yields the base URL (without trailing slash). The
    server is shut down cleanly even if the body of the ``with`` raises.
    """
    handler_cls = _make_handler(status=status, body=body)
    # Bind to 127.0.0.1 explicitly so the script's `localhost` curl works
    # under any IPv6/IPv4 default. port=0 lets the OS assign an ephemeral
    # port; we read it back from server_address.
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
        # Stop accepting new requests and join the background thread so
        # the port is released before the test's tmp_path is torn down.
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def _ephemeral_unused_port() -> int:
    """Return a likely-unused localhost port for the schema-fetch-failure
    test, which must hit a port that *refuses* the connection.

    There is an inherent race here (another process could bind the port
    between the time we close the socket and the time the script issues
    its curl), but in practice the window is tiny and curl will still
    fail on any 5xx response anyway. We bind+release rather than picking
    a fixed port to avoid colliding with services running on the host.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


# ---------------------------------------------------------------------------
# Helpers for staging the temp repo
# ---------------------------------------------------------------------------


def _build_subprocess_env() -> dict[str, str]:
    """Build a clean env for the bash subprocess.

    We deliberately drop env vars that the script reads as configuration
    so each test starts from a known baseline (NEXT_PUBLIC_API_URL,
    API_BASE_URL, SKIP_CODEGEN). Each test sets the ones it needs via
    ``extra_env``.
    """
    env = os.environ.copy()
    for var in ("NEXT_PUBLIC_API_URL", "API_BASE_URL", "SKIP_CODEGEN"):
        env.pop(var, None)
    return env


def _copy_script_into(repo_root: Path) -> Path:
    """Copy the real `scripts/generate-client.sh` into the temp repo root."""
    target_dir = repo_root / "scripts"
    target_dir.mkdir(parents=True, exist_ok=True)
    dst = target_dir / "generate-client.sh"
    # Preserve bytes exactly so line endings stay as authored.
    dst.write_bytes(REAL_SCRIPT_PATH.read_bytes())
    try:
        dst.chmod(0o755)
    except OSError:
        # Some Windows tmp filesystems don't honour chmod fully; we
        # always invoke via `bash <path>` which doesn't require the
        # executable bit.
        pass
    return dst


def _write_frontend(repo_root: Path, *, package_json: str) -> Path:
    frontend = repo_root / "trella-frontend"
    frontend.mkdir(parents=True, exist_ok=True)
    (frontend / "package.json").write_text(package_json, encoding="utf-8")
    return frontend


def _run_script(
    script: Path,
    *,
    extra_env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    env = _build_subprocess_env()
    if extra_env:
        env.update(extra_env)
    assert BASH is not None  # guarded by pytestmark
    return subprocess.run(
        [BASH, str(script)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
        timeout=60,
    )


# ---------------------------------------------------------------------------
# Test 1 - schema-fetch failure halts before codegen
# ---------------------------------------------------------------------------


def test_schema_export_failure_halts_before_codegen(tmp_path: Path) -> None:
    """Backend returns 500 -> script exits non-zero AND codegen never runs.

    Validates Requirement 4.4 (orig spec) / 17.4 (refactor): if the
    OpenAPI schema fetch fails, the orchestration script must halt
    immediately, must not invoke the codegen step, and must exit with a
    non-zero status.
    """
    repo_root = tmp_path / "repo"
    script = _copy_script_into(repo_root)

    # If npm IS reached (bug), this script would create a marker file
    # inside lib/client/. Its absence after the run proves codegen was
    # not invoked.
    package_json = (
        "{\n"
        '  "name": "trella-frontend-stub",\n'
        '  "private": true,\n'
        '  "scripts": {\n'
        '    "generate-client": "node -e \\"const fs=require(\'fs\');'
        " fs.mkdirSync('lib/client',{recursive:true});"
        " fs.writeFileSync('lib/client/CANARY.txt','reached');"
        ' process.exit(0)\\""\n'
        "  }\n"
        "}\n"
    )
    _write_frontend(repo_root, package_json=package_json)

    # Stand up a backend that responds 500 to the schema endpoint. Using
    # a real HTTP 500 (rather than a closed port) exercises the script's
    # `curl -f` failure handling for non-2xx responses.
    with _http_stub_backend(status=500, body=b"internal error") as base_url:
        result = _run_script(script, extra_env={"NEXT_PUBLIC_API_URL": base_url})

    assert result.returncode != 0, (
        "Expected non-zero exit when schema fetch fails, got "
        f"{result.returncode}.\nstdout={result.stdout!r}\n"
        f"stderr={result.stderr!r}"
    )

    canary = repo_root / "trella-frontend" / "lib" / "client" / "CANARY.txt"
    assert not canary.exists(), (
        "Codegen step ran even though schema fetch failed: "
        f"{canary} exists.\nstdout={result.stdout!r}\n"
        f"stderr={result.stderr!r}"
    )

    lib_client = repo_root / "trella-frontend" / "lib" / "client"
    assert not lib_client.exists(), (
        f"lib/client/ must not be created when schema fetch fails: "
        f"{lib_client} exists.\nstderr={result.stderr!r}"
    )


# ---------------------------------------------------------------------------
# Test 2 - codegen failure exits non-zero and propagates stderr
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    NPM is None, reason="npm is not on PATH; cannot run codegen-failure test"
)
def test_codegen_failure_exits_nonzero_and_propagates_stderr(
    tmp_path: Path,
) -> None:
    """`npm run generate-client` fails -> non-zero exit AND stderr surfaces.

    Validates Requirement 4.5: when codegen fails, the orchestration
    script must exit non-zero and the codegen command's stderr must reach
    the caller's stderr (we don't redirect or swallow it).
    """
    repo_root = tmp_path / "repo"
    script = _copy_script_into(repo_root)

    marker = "CODEGEN_FAILURE_MARKER_a17c5"
    package_json = (
        "{\n"
        '  "name": "trella-frontend-stub",\n'
        '  "private": true,\n'
        '  "scripts": {\n'
        f'    "generate-client": "node -e \\"console.error(\'{marker}\');'
        ' process.exit(17)\\""\n'
        "  }\n"
        "}\n"
    )
    _write_frontend(repo_root, package_json=package_json)

    body = json.dumps(STUB_OPENAPI_DOC).encode("utf-8")
    with _http_stub_backend(status=200, body=body) as base_url:
        result = _run_script(script, extra_env={"NEXT_PUBLIC_API_URL": base_url})

    assert result.returncode != 0, (
        "Expected non-zero exit when codegen fails, got "
        f"{result.returncode}.\nstdout={result.stdout!r}\n"
        f"stderr={result.stderr!r}"
    )
    assert marker in result.stderr, (
        f"Expected codegen stderr marker {marker!r} in script stderr.\n"
        f"stdout={result.stdout!r}\nstderr={result.stderr!r}"
    )


# ---------------------------------------------------------------------------
# Test 3 - SKIP_CODEGEN writes schema and leaves client untouched
# ---------------------------------------------------------------------------


def test_skip_codegen_writes_schema_and_leaves_client_untouched(
    tmp_path: Path,
) -> None:
    """`SKIP_CODEGEN=1` -> exit 0, openapi.json written, lib/client/ absent.

    Validates Requirement 4.7: when `SKIP_CODEGEN` is set non-empty, the
    script must exit 0 right after writing `openapi.json`, without
    invoking the codegen step.
    """
    repo_root = tmp_path / "repo"
    script = _copy_script_into(repo_root)

    # If reached (bug), generate-client would error loudly; its absence
    # in the output combined with exit 0 confirms it was skipped.
    package_json = (
        "{\n"
        '  "name": "trella-frontend-stub",\n'
        '  "private": true,\n'
        '  "scripts": {\n'
        '    "generate-client": "node -e \\"console.error(\'SHOULD_NOT_RUN\');'
        ' process.exit(99)\\""\n'
        "  }\n"
        "}\n"
    )
    _write_frontend(repo_root, package_json=package_json)

    body = json.dumps(STUB_OPENAPI_DOC).encode("utf-8")
    with _http_stub_backend(status=200, body=body) as base_url:
        result = _run_script(
            script,
            extra_env={
                "NEXT_PUBLIC_API_URL": base_url,
                "SKIP_CODEGEN": "1",
            },
        )

    assert result.returncode == 0, (
        "Expected exit 0 with SKIP_CODEGEN=1, got "
        f"{result.returncode}.\nstdout={result.stdout!r}\n"
        f"stderr={result.stderr!r}"
    )

    openapi_path = repo_root / "trella-frontend" / "openapi.json"
    assert openapi_path.is_file(), (
        f"openapi.json was not written at {openapi_path}.\n"
        f"stdout={result.stdout!r}\nstderr={result.stderr!r}"
    )
    written = json.loads(openapi_path.read_text(encoding="utf-8"))
    assert written == STUB_OPENAPI_DOC, (
        f"openapi.json content drifted from stub: {written!r}\nstderr={result.stderr!r}"
    )

    assert "SHOULD_NOT_RUN" not in result.stderr, (
        "generate-client was invoked even though SKIP_CODEGEN=1.\n"
        f"stdout={result.stdout!r}\nstderr={result.stderr!r}"
    )

    lib_client = repo_root / "trella-frontend" / "lib" / "client"
    assert not lib_client.exists(), (
        f"lib/client/ must remain untouched when SKIP_CODEGEN=1: "
        f"{lib_client} exists.\nstderr={result.stderr!r}"
    )
