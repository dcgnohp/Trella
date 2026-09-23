"""Integration test that ``npm run generate-client`` errors when
``openapi.json`` is missing.

Implements task 4.2 of the ``trella-frontend-api-codegen`` spec and
validates Requirement 3.3:

  IF OpenAPI_Spec_File không tồn tại tại ``trella-frontend/openapi.json``
  khi chạy ``npm run generate-client``, THEN THE Codegen_Tool SHALL kết
  thúc với mã lỗi khác 0 và in thông báo chỉ rõ file nào bị thiếu.

Strategy
--------

Build a sandbox ``trella-frontend`` directory under pytest's ``tmp_path``
that mirrors the real project layout enough for ``openapi-ts`` to run:

* copy the real ``package.json``,
* copy the real ``openapi-ts.config.ts``,
* copy the helper module ``lib/codegen/method-name-builder.ts`` it imports,
* link ``node_modules`` to the real ``trella-frontend/node_modules`` so
  the codegen binary and its dependencies resolve.

Crucially, the sandbox does **not** contain ``openapi.json``. Then run
``npm run generate-client`` with ``cwd`` set to the sandbox and assert:

* the process exits with a non-zero status, and
* the combined stdout/stderr explicitly names ``openapi.json``.

The test skips cleanly when ``npm`` is not on PATH or when the real
``trella-frontend/node_modules`` has not been installed.

Notes on the linking strategy
-----------------------------

* On POSIX we use ``os.symlink``.
* On Windows we use a directory junction (``mklink /J``) created via
  ``cmd.exe``: junctions don't require admin or Developer Mode and
  work on any NTFS volume on the same machine, which is the reliable
  default for CI sandboxes.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

# tests/scripts/<this>.py -> tests -> trella-backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
TRELLA_FRONTEND = REPO_ROOT / "trella-frontend"
REAL_NODE_MODULES = TRELLA_FRONTEND / "node_modules"
REAL_PACKAGE_JSON = TRELLA_FRONTEND / "package.json"
REAL_CODEGEN_CONFIG = TRELLA_FRONTEND / "openapi-ts.config.ts"
REAL_METHOD_NAME_BUILDER = (
    TRELLA_FRONTEND / "lib" / "codegen" / "method-name-builder.ts"
)


def _find_npm() -> str | None:
    """Locate ``npm`` in a Windows-friendly way.

    On Windows ``shutil.which("npm")`` returns ``npm.cmd``; on POSIX it
    returns ``npm``. Either is fine for ``subprocess.run``.
    """
    return shutil.which("npm") or shutil.which("npm.cmd")


def _link_node_modules(target: Path, source: Path) -> None:
    """Create ``target`` pointing at ``source`` (a directory).

    Uses a real symlink on POSIX and an NTFS directory junction on
    Windows. Junctions don't require admin and work across most CI
    environments.
    """
    if os.name == "nt":
        # mklink is a cmd.exe built-in, not a standalone executable.
        result = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(target), str(source)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "Failed to create directory junction "
                f"{target} -> {source}: {result.stderr.strip()}"
            )
        return
    os.symlink(source, target, target_is_directory=True)


def _unlink_node_modules(link: Path) -> None:
    """Remove the link without descending into the linked target."""
    if not link.exists() and not link.is_symlink():
        return
    if os.name == "nt":
        # ``rmdir`` removes a junction without recursing into it; using
        # ``Remove-Item -Recurse`` or ``shutil.rmtree`` would delete the
        # real ``node_modules`` contents.
        subprocess.run(
            ["cmd", "/c", "rmdir", str(link)],
            capture_output=True,
            text=True,
        )
        return
    try:
        link.unlink()
    except OSError:
        pass


def _build_sandbox(root: Path) -> Path:
    """Materialize a minimal ``trella-frontend`` clone at ``root``.

    Returns the sandbox frontend directory. Caller is responsible for
    cleaning up the ``node_modules`` link via ``_unlink_node_modules``.
    """
    sandbox = root / "trella-frontend"
    sandbox.mkdir(parents=True)

    shutil.copy2(REAL_PACKAGE_JSON, sandbox / "package.json")
    shutil.copy2(REAL_CODEGEN_CONFIG, sandbox / "openapi-ts.config.ts")

    codegen_dir = sandbox / "lib" / "codegen"
    codegen_dir.mkdir(parents=True)
    shutil.copy2(REAL_METHOD_NAME_BUILDER, codegen_dir / "method-name-builder.ts")

    _link_node_modules(sandbox / "node_modules", REAL_NODE_MODULES)
    return sandbox


def _run_npm_generate_client(
    sandbox: Path, npm: str
) -> subprocess.CompletedProcess[str]:
    """Run ``npm run generate-client`` inside ``sandbox`` and return the
    completed process.

    ``stdin`` is silenced so the codegen tool's interactive
    "Open a GitHub issue?" prompt does not stall the test.
    """
    env = os.environ.copy()
    # Don't let an ambient SKIP_CODEGEN bias anything (the npm script
    # ignores it but defence in depth keeps results reproducible).
    env.pop("SKIP_CODEGEN", None)
    # Make npm think it's not in CI to keep behaviour identical to a
    # developer machine; remove any value rather than overriding.
    env.pop("CI", None)

    return subprocess.run(
        [npm, "run", "generate-client"],
        cwd=str(sandbox),
        capture_output=True,
        text=True,
        env=env,
        timeout=180,
        # Closing stdin prevents the crash-reporter prompt from blocking.
        stdin=subprocess.DEVNULL,
        # The codegen tool emits emoji in its diagnostics; force UTF-8
        # decoding with replacement so Windows's default cp1252 codec
        # doesn't crash the reader thread (which would leave stdout and
        # stderr as ``None``).
        encoding="utf-8",
        errors="replace",
        check=False,
    )


@pytest.fixture(scope="module")
def npm_path() -> str:
    npm = _find_npm()
    if npm is None:
        pytest.skip("npm is not installed on this host")
    return npm


@pytest.fixture(scope="module")
def real_node_modules_present() -> None:
    if not REAL_NODE_MODULES.is_dir():
        pytest.skip(
            f"trella-frontend/node_modules is missing at {REAL_NODE_MODULES}; "
            "run `npm install` in trella-frontend/ before running this test."
        )
    # Sanity-check that the codegen binary is actually installed; without
    # it the test would be checking the wrong failure mode.
    bin_name = "openapi-ts.cmd" if os.name == "nt" else "openapi-ts"
    if not (REAL_NODE_MODULES / ".bin" / bin_name).exists():
        pytest.skip(
            "openapi-ts binary is not present in "
            "trella-frontend/node_modules/.bin; install dependencies first."
        )


def test_npm_run_generate_client_errors_when_openapi_json_missing(
    tmp_path: Path,
    npm_path: str,
    real_node_modules_present: None,
) -> None:
    """Validates Requirement 3.3.

    When ``openapi.json`` is absent, ``npm run generate-client`` SHALL
    exit non-zero AND emit an error message that names the missing file.
    """
    sandbox = _build_sandbox(tmp_path)
    try:
        # Precondition: the sandbox must NOT contain openapi.json. If a
        # future change copies files indiscriminately we want to fail
        # loudly rather than silently pass.
        openapi_path = sandbox / "openapi.json"
        assert not openapi_path.exists(), (
            f"Sandbox unexpectedly contains {openapi_path}; "
            "the test cannot validate the missing-input failure mode."
        )

        result = _run_npm_generate_client(sandbox, npm_path)

        # Diagnostic blob included in every assertion to make CI failures
        # debuggable without re-running locally.
        diagnostic = (
            f"\nreturncode={result.returncode}"
            f"\nstdout=\n{result.stdout}"
            f"\nstderr=\n{result.stderr}"
        )

        assert result.returncode != 0, (
            "Expected `npm run generate-client` to exit non-zero when "
            "openapi.json is missing, but it succeeded." + diagnostic
        )

        # The error mentions the missing input. Some platforms send the
        # codegen banner to stdout and the ENOENT detail to stderr, so we
        # search the combined output.
        combined = (result.stdout or "") + (result.stderr or "")
        assert "openapi.json" in combined, (
            "Expected the error output to name the missing `openapi.json` "
            "file, but no such reference was found." + diagnostic
        )

        # Stronger check: the message should describe a missing-file
        # condition, not some unrelated failure (e.g. a syntax error in
        # the config). Accept any of the common phrasings the codegen
        # surfaces ("ENOENT", "no such file", "Error opening file").
        lowered = combined.lower()
        assert any(
            marker in lowered
            for marker in (
                "enoent",
                "no such file",
                "error opening file",
            )
        ), (
            "Expected the error output to indicate the file is missing "
            "(ENOENT / no such file / error opening file)." + diagnostic
        )
    finally:
        _unlink_node_modules(sandbox / "node_modules")
