"""P6-B8 checks: immutable, version-aware prompt resolution.

Versioned files (``<name>.<version>.md``) are preferred when present; the plain
``<name>.md`` is the backward-compatible fallback. Name and version tokens are
validated against path traversal at the trust boundary.
"""

from pathlib import Path

import pytest

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.utils.errors import InvalidPrompt


def test_resolve_picks_versioned_file() -> None:
    # chat.v1.md ships alongside chat.md (see app/ai/prompts).
    assert PromptManager().resolve_prompt_file("chat", "v1") == "chat.v1"


def test_resolve_unknown_version_falls_back_to_plain() -> None:
    # No chat.v9.md exists → fall back to the plain chat.md.
    assert PromptManager().resolve_prompt_file("chat", "v9") == "chat"


def test_resolve_no_version_uses_plain() -> None:
    assert PromptManager().resolve_prompt_file("chat", None) == "chat"


def test_resolve_sprint_analysis_v2() -> None:
    assert (
        PromptManager().resolve_prompt_file("sprint_analysis", "v2")
        == "sprint_analysis.v2"
    )


def test_render_with_version_uses_versioned_file(tmp_path: Path) -> None:
    (tmp_path / "p.md").write_text("PLAIN {{x}}")
    (tmp_path / "p.v2.md").write_text("V2 {{x}}")
    pm = PromptManager(prompts_dir=tmp_path)
    assert pm.render("p", {"x": "1"}, version="v2") == "V2 1"
    # No version → plain file (backward compatible).
    assert pm.render("p", {"x": "1"}) == "PLAIN 1"
    # Unknown version → plain fallback.
    assert pm.render("p", {"x": "1"}, version="v9") == "PLAIN 1"


def test_render_sprint_analysis_v2_content() -> None:
    variables = {
        "sprint": "Sprint 7",
        "metrics": "velocity 30",
        "blocked_tasks": "none",
        "carried_over_tasks": "none",
        "previous_summary": "None",
    }
    out = PromptManager().render("sprint_analysis", variables, version="v2")
    assert "prompt_version: v2" in out


def test_rejects_path_traversal_name() -> None:
    with pytest.raises(InvalidPrompt):
        PromptManager().resolve_prompt_file("../secrets", "v1")


@pytest.mark.parametrize("bad", ["../v1", "v1/../../etc", "1", "latest", "v1.5"])
def test_rejects_bad_version(bad: str) -> None:
    with pytest.raises(InvalidPrompt):
        PromptManager().resolve_prompt_file("chat", bad)
