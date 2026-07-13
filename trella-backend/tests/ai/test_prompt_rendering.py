"""B4 check: rendering of the bundled content-generation prompt templates.

These tests validate template rendering / variable substitution only — they
never call an LLM and make no assertions about model output.
"""

from app.ai.prompts.prompt_manager import PromptManager

_TASK_VARS = {
    "title": "Add OAuth login",
    "description": "Users need to sign in with Google.",
    "labels": "auth, backend",
    "priority": "high",
    "sprint": "Sprint 12",
}


def test_description_generator_substitutes_all_vars() -> None:
    rendered = PromptManager().render("description_generator", _TASK_VARS)
    for value in _TASK_VARS.values():
        assert value in rendered
    assert "{{" not in rendered and "}}" not in rendered


def test_description_summary_substitutes_all_vars() -> None:
    rendered = PromptManager().render("description_summary", _TASK_VARS)
    assert _TASK_VARS["title"] in rendered
    assert _TASK_VARS["description"] in rendered
    assert "{{" not in rendered and "}}" not in rendered


def test_description_generator_instruction_phrases() -> None:
    rendered = PromptManager().render("description_generator", _TASK_VARS)
    for phrase in (
        "acceptance_criteria",
        "technical_notes",
        "definition_of_done",
        "structured",
    ):
        assert phrase in rendered


def test_description_summary_instruction_phrases() -> None:
    rendered = PromptManager().render("description_summary", _TASK_VARS)
    for phrase in ("summary", "risks", "action_items", "structured"):
        assert phrase in rendered
