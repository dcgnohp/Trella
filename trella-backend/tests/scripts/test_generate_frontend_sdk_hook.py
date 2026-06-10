"""Integration test that the `generate-frontend-sdk` pre-commit hook blocks
commits when the orchestration script exits non-zero.

Implements task 9.4 of the `trella-frontend-api-codegen` spec and validates
Requirement 5.3:

    IF Generate_Client_Script kết thúc với mã lỗi khác 0 trong lúc
    Pre_Commit_Hook chạy, THEN THE Pre_Commit_Hook SHALL chặn commit và
    hiển thị mã lỗi.

Strategy
========

Two layers cover Requirement 5.3 with progressively more environment-specific
strength:

1. **Contract test (always runs).** The configured hook entry is
   ``bash ./scripts/generate-client.sh``. The pre-commit framework's
   contribution to the failure-propagation chain is "spawn entry as a
   subprocess and return non-zero if entry exits non-zero". The piece we own
   in ``.pre-commit-config.yaml`` is that the entry is invoked through
   ``bash``; we verify directly that ``bash <failing-script>`` exits non-zero.
   That contract is what makes Requirement 5.3 hold in any environment.

2. **End-to-end framework test (skipped if neither ``pre-commit`` nor ``prek``
   is available).** A temp git repository is initialised with a stubbed
   ``.pre-commit-config.yaml`` whose ``generate-frontend-sdk`` hook calls a
   forced-failure script. ``pre-commit run --all-files generate-frontend-sdk``
   is then invoked and asserted to exit non-zero.

Picking the most reliable runner that exists at test time keeps the test
green on dev machines (where the system ``pre-commit`` may not be on PATH)
while still catching wiring regressions in CI (which installs ``prek`` via
``uv``).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
import yaml

# tests/scripts/<this>.py -> tests -> trella-backend -> repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = Path(__file__).resolve().parents[2]
PRE_COMMIT_CONFIG_PATH = BACKEND_ROOT / ".pre-commit-config.yaml"
HOOK_ID = "generate-frontend-sdk"


def _load_hook(hook_id: str) -> dict[str, Any]:
    """Return the hook mapping with the given id from the live config."""
    with PRE_COMMIT_CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    assert isinstance(config, dict), "expected mapping at top level"
    for repo in config.get("repos", []):
        for hook in repo.get("hooks", []):
            if isinstance(hook, dict) and hook.get("id") == hook_id:
                return hook
    raise AssertionError(
        f"hook id={hook_id!r} not found in {PRE_COMMIT_CONFIG_PATH}"
    )


def _resolve_bash() -> str:
    """Return a path to a usable bash executable, or skip the test.

    On Windows, ``shutil.which("bash")`` may return ``C:\\Windows\\System32\\
    bash.exe`` which is the WSL launcher; on machines without a working WSL
    distribution that launcher fails before invoking the script. We probe
    each candidate by running ``bash --version`` and keep the first one that
    exits cleanly so the test only runs against a real bash.
    """
    on_path = shutil.which("bash")
    candidates: list[str | None] = [
        # Prefer Git Bash on Windows since the WSL launcher in System32 is
        # often broken on dev machines.
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
        on_path,
        "/usr/bin/bash",
        "/bin/bash",
    ]
    seen: set[str] = set()
    for cand in candidates:
        if not cand or cand in seen or not Path(cand).is_file():
            continue
        seen.add(cand)
        try:
            probe = subprocess.run(
                [cand, "--version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if probe.returncode == 0 and "bash" in (probe.stdout + probe.stderr).lower():
            return cand
    pytest.skip("no working bash executable available on this platform")


def _resolve_pre_commit_runner() -> list[str] | None:
    """Return a command prefix that runs the pre-commit framework, if any.

    Order: ``prek`` (the runner CI uses), then ``pre-commit`` on PATH, then
    ``python -m pre_commit`` if the module is importable.
    """
    prek = shutil.which("prek")
    if prek is not None:
        return [prek]
    pc = shutil.which("pre-commit")
    if pc is not None:
        return [pc]
    try:
        import pre_commit  # noqa: F401  (presence-only check)
    except ImportError:
        return None
    return [sys.executable, "-m", "pre_commit"]


# ---------------------------------------------------------------------------
# Layer 1 — contract test
# ---------------------------------------------------------------------------


def test_generate_frontend_sdk_entry_uses_bash() -> None:
    """The hook entry must invoke a bash script.

    This is the precondition that makes Requirement 5.3 hold under any
    pre-commit-compatible runner: bash will propagate the script's non-zero
    exit code unchanged, and the pre-commit framework propagates the entry's
    exit code to the commit.
    """
    hook = _load_hook(HOOK_ID)
    entry = hook.get("entry", "")
    assert isinstance(entry, str) and entry.startswith("bash "), (
        "Expected hook entry to invoke a bash script so failures propagate "
        f"via the shell, got entry={entry!r}"
    )


def test_failing_script_exits_non_zero_when_invoked_by_bash(
    tmp_path: Path,
) -> None:
    """Direct contract check: when the script exits non-zero, the hook's
    invocation form (``bash <script>``) must surface that non-zero code.

    This is the part of Requirement 5.3 the spec controls directly. The
    pre-commit framework only adds "stop the commit on non-zero entry exit"
    on top of this contract.
    """
    bash = _resolve_bash()
    failing_script = tmp_path / "fail.sh"
    failing_script.write_text(
        "#!/usr/bin/env bash\n"
        "set -e\n"
        'echo "forced failure for hook test" 1>&2\n'
        "exit 1\n",
        encoding="utf-8",
    )
    if os.name != "nt":
        failing_script.chmod(0o755)

    result = subprocess.run(
        [bash, str(failing_script)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0, (
        f"Expected non-zero exit from bash <failing-script>; "
        f"got {result.returncode}; stdout={result.stdout!r}; "
        f"stderr={result.stderr!r}"
    )
    assert "forced failure" in result.stderr, (
        "Expected the script's stderr to reach the caller unchanged; "
        f"got stderr={result.stderr!r}"
    )


# ---------------------------------------------------------------------------
# Layer 2 — end-to-end framework test
# ---------------------------------------------------------------------------


def _init_temp_git_repo(repo: Path) -> None:
    """Initialise a minimal git repo so pre-commit will run inside it."""
    subprocess.run(
        ["git", "init", "-q", "-b", "main", str(repo)],
        check=True,
        capture_output=True,
    )
    for cmd in (
        ["git", "config", "user.email", "hook-test@example.com"],
        ["git", "config", "user.name", "hook-test"],
        ["git", "config", "commit.gpgsign", "false"],
    ):
        subprocess.run(cmd, cwd=repo, check=True, capture_output=True)


def test_pre_commit_run_blocks_when_hook_script_exits_non_zero(
    tmp_path: Path,
) -> None:
    """End-to-end check: ``pre-commit run`` must exit non-zero when the
    ``generate-frontend-sdk`` hook script exits non-zero.

    Skipped if neither ``pre-commit`` nor ``prek`` is reachable from the
    test environment; the contract test above still guarantees Requirement
    5.3's load-bearing piece in that case.
    """
    runner = _resolve_pre_commit_runner()
    if runner is None:
        pytest.skip(
            "neither pre-commit nor prek is available in this environment"
        )
    bash = _resolve_bash()

    repo = tmp_path / "repo"
    repo.mkdir()
    _init_temp_git_repo(repo)

    # Forced-failure stub that mimics `scripts/generate-client.sh`.
    fail_script = repo / "fail.sh"
    fail_script.write_text(
        "#!/usr/bin/env bash\n"
        'echo "stub: forced failure" 1>&2\n'
        "exit 1\n",
        encoding="utf-8",
    )
    if os.name != "nt":
        fail_script.chmod(0o755)

    # Stub config: same hook id, language=system so vanilla pre-commit also
    # accepts it. Use forward slashes so the YAML is portable across OSes.
    fail_script_posix = fail_script.as_posix()
    config = {
        "repos": [
            {
                "repo": "local",
                "hooks": [
                    {
                        "id": HOOK_ID,
                        "name": "stub failing generate-frontend-sdk",
                        "entry": f"bash {fail_script_posix}",
                        "language": "system",
                        "pass_filenames": False,
                        "always_run": True,
                    }
                ],
            }
        ]
    }
    config_path = repo / ".pre-commit-config.yaml"
    config_path.write_text(yaml.safe_dump(config), encoding="utf-8")

    # Stage a sentinel file so `--all-files` has something to iterate over.
    sentinel = repo / "sentinel.txt"
    sentinel.write_text("hello\n", encoding="utf-8")
    subprocess.run(
        ["git", "add", "sentinel.txt", ".pre-commit-config.yaml", "fail.sh"],
        cwd=repo,
        check=True,
        capture_output=True,
    )

    # Make sure pre-commit can find bash even when it's only at Git's path.
    env = os.environ.copy()
    bash_dir = str(Path(bash).parent)
    if bash_dir not in env.get("PATH", ""):
        env["PATH"] = bash_dir + os.pathsep + env.get("PATH", "")

    result = subprocess.run(
        [*runner, "run", "--all-files", HOOK_ID],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0, (
        "Expected pre-commit to exit non-zero when the hook script fails; "
        f"got returncode={result.returncode}; "
        f"stdout={result.stdout!r}; stderr={result.stderr!r}"
    )
