"""Integration tests for failure paths of `scripts/generate-client.sh`.

Implements task 3.3 of the `trella-frontend-api-codegen` spec and validates
Requirements 4.4, 4.5, and 4.7:

- Req 4.4: schema export failure halts execution before codegen and exits
  non-zero, with `lib/client/` not created/modified.
- Req 4.5: codegen failure exits non-zero and surfaces codegen stderr to
  the caller's stderr.
- Req 4.7: `SKIP_CODEGEN=1` exports schema, exits 0, and leaves
  `lib/client/` untouched.

Each test stages an isolated temp repo layout that mirrors the real one:

    <tmp>/scripts/generate-client.sh        (copied from real script)
    <tmp>/trella-backend/app/__init__.py
    <tmp>/trella-backend/app/main.py        (stubbed FastAPI-like app)
    <tmp>/trella-frontend/package.json      (stubbed npm generate-client)

The tests skip cleanly if no usable `bash` is available. On Windows we look
for Git Bash explicitly because the `bash` on PATH on a default Windows
installation is the WSL launcher, which cannot execute Windows-path scripts
or call `python.exe` / `npm.cmd` directly.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


REAL_SCRIPT_PATH = (
    Path(__file__).resolve().parents[3] / "scripts" / "generate-client.sh"
)


def _find_bash() -> str | None:
    """Return a bash executable that can run a Windows-path shell script.

    On Windows, prefer Git Bash over the system `bash.exe` (which is the WSL
    launcher and cannot run Windows-path scripts directly).
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


def _build_subprocess_env() -> dict[str, str]:
    """Build an env that lets the bash subprocess find `python` (and `npm`).

    We prepend the directory of `sys.executable` to PATH so the same Python
    that runs the tests is what the script invokes; this avoids depending on
    a separately-installed `python` on the host PATH.
    """
    env = os.environ.copy()
    python_dir = str(Path(sys.executable).parent)
    env["PATH"] = python_dir + os.pathsep + env.get("PATH", "")
    # Don't leak SKIP_CODEGEN from the host shell into tests that don't
    # explicitly set it.
    env.pop("SKIP_CODEGEN", None)
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
        # Some Windows tmp filesystems don't honour chmod fully; we always
        # invoke via `bash <path>` which doesn't require the executable bit.
        pass
    return dst


def _write_backend_stub(repo_root: Path, *, openapi_body: str) -> None:
    """Create a stubbed `trella-backend/app/main.py` exposing an `app` whose
    `openapi(self)` body is `openapi_body` (a single line of Python).
    """
    app_dir = repo_root / "trella-backend" / "app"
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / "__init__.py").write_text("", encoding="utf-8")
    main_py = (
        "class _App:\n"
        "    def openapi(self):\n"
        f"        {openapi_body}\n"
        "\n"
        "app = _App()\n"
    )
    (app_dir / "main.py").write_text(main_py, encoding="utf-8")


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
    )


# ---------------------------------------------------------------------------
# Test 1 - Requirement 4.4
# ---------------------------------------------------------------------------


def test_schema_export_failure_halts_before_codegen(tmp_path: Path) -> None:
    """`app.openapi()` raises -> script exits non-zero AND codegen never runs.

    Validates Requirement 4.4: if the OpenAPI schema export fails, the
    orchestration script must halt immediately, must not invoke the codegen
    step, and must exit with a non-zero status.
    """
    repo_root = tmp_path / "repo"
    script = _copy_script_into(repo_root)

    _write_backend_stub(
        repo_root,
        openapi_body='raise RuntimeError("FORCED_SCHEMA_EXPORT_FAILURE")',
    )

    # If npm IS reached (bug), this script would create a marker file inside
    # lib/client/. Its absence after the run proves codegen was not invoked.
    package_json = (
        '{\n'
        '  "name": "trella-frontend-stub",\n'
        '  "private": true,\n'
        '  "scripts": {\n'
        '    "generate-client": "node -e \\"const fs=require(\'fs\');'
        ' fs.mkdirSync(\'lib/client\',{recursive:true});'
        ' fs.writeFileSync(\'lib/client/CANARY.txt\',\'reached\');'
        ' process.exit(0)\\""\n'
        '  }\n'
        '}\n'
    )
    _write_frontend(repo_root, package_json=package_json)

    result = _run_script(script)

    assert result.returncode != 0, (
        "Expected non-zero exit when schema export fails, got "
        f"{result.returncode}.\nstdout={result.stdout!r}\n"
        f"stderr={result.stderr!r}"
    )

    canary = repo_root / "trella-frontend" / "lib" / "client" / "CANARY.txt"
    assert not canary.exists(), (
        "Codegen step ran even though schema export failed: "
        f"{canary} exists.\nstdout={result.stdout!r}\n"
        f"stderr={result.stderr!r}"
    )

    lib_client = repo_root / "trella-frontend" / "lib" / "client"
    assert not lib_client.exists(), (
        f"lib/client/ must not be created when schema export fails: "
        f"{lib_client} exists.\nstderr={result.stderr!r}"
    )


# ---------------------------------------------------------------------------
# Test 2 - Requirement 4.5
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    NPM is None, reason="npm is not on PATH; cannot run codegen-failure test"
)
def test_codegen_failure_exits_nonzero_and_propagates_stderr(
    tmp_path: Path,
) -> None:
    """`npm run generate-client` fails -> non-zero exit AND stderr surfaces.

    Validates Requirement 4.5: when codegen fails, the orchestration script
    must exit non-zero and the codegen command's stderr must reach the
    caller's stderr (we don't redirect or swallow it).
    """
    repo_root = tmp_path / "repo"
    script = _copy_script_into(repo_root)

    # Schema export succeeds with a minimal valid OpenAPI document.
    _write_backend_stub(
        repo_root,
        openapi_body=(
            'return {"openapi": "3.0.0", '
            '"info": {"title": "stub", "version": "0.0.0"}, '
            '"paths": {}}'
        ),
    )

    marker = "CODEGEN_FAILURE_MARKER_a17c5"
    package_json = (
        '{\n'
        '  "name": "trella-frontend-stub",\n'
        '  "private": true,\n'
        '  "scripts": {\n'
        f'    "generate-client": "node -e \\"console.error(\'{marker}\');'
        ' process.exit(17)\\""\n'
        '  }\n'
        '}\n'
    )
    _write_frontend(repo_root, package_json=package_json)

    result = _run_script(script)

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
# Test 3 - Requirement 4.7
# ---------------------------------------------------------------------------


def test_skip_codegen_writes_schema_and_leaves_client_untouched(
    tmp_path: Path,
) -> None:
    """`SKIP_CODEGEN=1` -> exit 0, openapi.json written, lib/client/ absent.

    Validates Requirement 4.7: when `SKIP_CODEGEN` is set non-empty, the
    script must exit 0 right after writing `openapi.json`, without invoking
    the codegen step.
    """
    repo_root = tmp_path / "repo"
    script = _copy_script_into(repo_root)

    _write_backend_stub(
        repo_root,
        openapi_body=(
            'return {"openapi": "3.0.0", '
            '"info": {"title": "stub", "version": "0.0.0"}, '
            '"paths": {}}'
        ),
    )

    # If reached (bug), generate-client would error loudly; its absence in
    # the output combined with exit 0 confirms it was skipped.
    package_json = (
        '{\n'
        '  "name": "trella-frontend-stub",\n'
        '  "private": true,\n'
        '  "scripts": {\n'
        '    "generate-client": "node -e \\"console.error(\'SHOULD_NOT_RUN\');'
        ' process.exit(99)\\""\n'
        '  }\n'
        '}\n'
    )
    _write_frontend(repo_root, package_json=package_json)

    result = _run_script(script, extra_env={"SKIP_CODEGEN": "1"})

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
    written = openapi_path.read_text(encoding="utf-8").strip()
    assert written, (
        "openapi.json must be non-empty when schema export succeeds, "
        f"got empty file.\nstderr={result.stderr!r}"
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
