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


def test_task_breakdown_substitutes_all_vars() -> None:
    rendered = PromptManager().render("task_breakdown", _TASK_VARS)
    for value in _TASK_VARS.values():
        assert value in rendered
    assert "{{" not in rendered and "}}" not in rendered


def test_story_point_substitutes_all_vars() -> None:
    vars_with_history = {
        "title": _TASK_VARS["title"],
        "description": _TASK_VARS["description"],
        "labels": _TASK_VARS["labels"],
        "priority": _TASK_VARS["priority"],
        "sprint_goal": "Finish auth",
        "velocity": "25",
        "history": "Task A: 5",
    }
    rendered = PromptManager().render("story_point", vars_with_history)
    for value in vars_with_history.values():
        assert value in rendered
    assert "{{" not in rendered and "}}" not in rendered


_DOC_VARS = {
    "title": "Q3 Planning Notes",
    "content": "We agreed to ship the search revamp before the audit.",
}


def test_document_summary_substitutes_all_vars() -> None:
    rendered = PromptManager().render("document_summary", _DOC_VARS)
    assert _DOC_VARS["title"] in rendered
    assert _DOC_VARS["content"] in rendered
    assert "{{" not in rendered and "}}" not in rendered


def test_document_summary_instruction_phrases() -> None:
    rendered = PromptManager().render("document_summary", _DOC_VARS)
    for phrase in (
        "summary",
        "key_points",
        "key_decisions",
        "action_items",
        "structured",
    ):
        assert phrase in rendered
