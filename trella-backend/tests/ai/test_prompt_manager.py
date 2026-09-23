"""B4 check: prompt loading + variable substitution and failure modes."""

from pathlib import Path

import pytest

from app.ai.prompts.prompt_manager import PromptManager
from app.ai.utils.errors import InvalidPrompt


def test_renders_and_substitutes(tmp_path: Path) -> None:
    (tmp_path / "greet.md").write_text("Hello {{name}}, welcome to {{place}}.")
    pm = PromptManager(prompts_dir=tmp_path)
    assert pm.render("greet", {"name": "Ada", "place": "Trella"}) == (
        "Hello Ada, welcome to Trella."
    )


def test_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(InvalidPrompt):
        PromptManager(prompts_dir=tmp_path).render("nope")


def test_missing_variable_raises(tmp_path: Path) -> None:
    (tmp_path / "p.md").write_text("Hi {{name}}")
    with pytest.raises(InvalidPrompt):
        PromptManager(prompts_dir=tmp_path).render("p", {})


def test_rejects_path_traversal_name(tmp_path: Path) -> None:
    with pytest.raises(InvalidPrompt):
        PromptManager(prompts_dir=tmp_path).render("../secrets")


def test_bundled_ping_prompt_loads() -> None:
    # The real _ping.md ships with the package and is used by the health probe.
    assert "confirming" in PromptManager().render("_ping", {"message": "ok"})
