"""Structural example test for `trella-backend/.pre-commit-config.yaml`.

Validates Requirements 5.1, 5.2 and 7.3 of the `trella-frontend-api-codegen`
spec by parsing the YAML and asserting the shape of the relevant hooks:

- The `generate-frontend-sdk` hook entry calls `bash ./scripts/generate-client.sh`
  and its `files:` regex covers `^backend/.*$` and `^scripts/generate-client\\.sh$`.
- Both `end-of-file-fixer` and `trailing-whitespace` hooks exclude the
  generated client directory `trella-frontend/lib/client/.*`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

# The pre-commit config lives at the root of `trella-backend/`, two levels
# above this test file (`tests/scripts/test_pre_commit_config.py`).
PRE_COMMIT_CONFIG_PATH = (
    Path(__file__).resolve().parents[2] / ".pre-commit-config.yaml"
)


def _load_config() -> dict[str, Any]:
    with PRE_COMMIT_CONFIG_PATH.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    assert isinstance(data, dict), (
        f"Expected top-level mapping in {PRE_COMMIT_CONFIG_PATH}, "
        f"got {type(data).__name__}"
    )
    return data


def _iter_hooks(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten all hooks across every repo entry."""
    repos = config.get("repos", [])
    assert isinstance(repos, list) and repos, (
        "`repos` must be a non-empty list in .pre-commit-config.yaml"
    )
    hooks: list[dict[str, Any]] = []
    for repo in repos:
        assert isinstance(repo, dict), "each repo entry must be a mapping"
        repo_hooks = repo.get("hooks", [])
        assert isinstance(repo_hooks, list), "`hooks` must be a list"
        for hook in repo_hooks:
            assert isinstance(hook, dict), "each hook entry must be a mapping"
            hooks.append(hook)
    return hooks


def _find_hook(hooks: list[dict[str, Any]], hook_id: str) -> dict[str, Any]:
    matches = [h for h in hooks if h.get("id") == hook_id]
    assert len(matches) == 1, (
        f"Expected exactly one hook with id={hook_id!r}, found {len(matches)}"
    )
    return matches[0]


@pytest.fixture(scope="module")
def hooks() -> list[dict[str, Any]]:
    return _iter_hooks(_load_config())


def test_pre_commit_config_file_exists() -> None:
    """The .pre-commit-config.yaml must exist at the backend root."""
    assert PRE_COMMIT_CONFIG_PATH.is_file(), (
        f"Missing .pre-commit-config.yaml at {PRE_COMMIT_CONFIG_PATH}"
    )


def test_generate_frontend_sdk_entry_invokes_generate_client_script(
    hooks: list[dict[str, Any]],
) -> None:
    """Requirement 5.1: hook `entry` must call `bash ./scripts/generate-client.sh`."""
    hook = _find_hook(hooks, "generate-frontend-sdk")
    assert hook.get("entry") == "bash ./scripts/generate-client.sh", (
        f"generate-frontend-sdk.entry must be exactly "
        f"'bash ./scripts/generate-client.sh', got {hook.get('entry')!r}"
    )


def test_generate_frontend_sdk_files_pattern_covers_backend_and_script(
    hooks: list[dict[str, Any]],
) -> None:
    """Requirement 5.2: `files:` must match backend changes and the script itself."""
    hook = _find_hook(hooks, "generate-frontend-sdk")
    files_pattern = hook.get("files")
    assert isinstance(files_pattern, str) and files_pattern, (
        "generate-frontend-sdk.files must be a non-empty string"
    )
    assert "^backend/.*$" in files_pattern, (
        f"generate-frontend-sdk.files must include '^backend/.*$', "
        f"got {files_pattern!r}"
    )
    assert r"^scripts/generate-client\.sh$" in files_pattern, (
        r"generate-frontend-sdk.files must include "
        r"'^scripts/generate-client\.sh$', "
        f"got {files_pattern!r}"
    )


@pytest.mark.parametrize(
    "hook_id",
    ["end-of-file-fixer", "trailing-whitespace"],
)
def test_whitespace_hooks_exclude_generated_client(
    hooks: list[dict[str, Any]], hook_id: str
) -> None:
    """Requirement 7.3: both hooks must exclude `trella-frontend/lib/client/.*`."""
    hook = _find_hook(hooks, hook_id)
    exclude_pattern = hook.get("exclude")
    assert isinstance(exclude_pattern, str) and exclude_pattern, (
        f"{hook_id}.exclude must be a non-empty string"
    )
    assert "trella-frontend/lib/client/.*" in exclude_pattern, (
        f"{hook_id}.exclude must contain the substring "
        f"'trella-frontend/lib/client/.*', got {exclude_pattern!r}"
    )
