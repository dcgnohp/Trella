"""B3 check: ContextBuilder optional hooks + TaskContext payload builder."""

from app.ai.context.base import ContextBuilder
from app.ai.context.task_context import TaskContext

_EXPECTED_KEYS = {"title", "description", "labels", "priority", "sprint"}


class _BareContext(ContextBuilder):
    def build(self) -> dict[str, str]:
        return {"title": "x"}


def test_default_metadata_and_estimated_tokens() -> None:
    bare = _BareContext()
    assert bare.metadata() == {}
    assert bare.estimated_tokens() is None


def test_build_has_all_keys_as_strings_when_optionals_omitted() -> None:
    result = TaskContext(title="Ship it").build()
    assert set(result) == _EXPECTED_KEYS
    assert all(isinstance(v, str) for v in result.values())
    assert result == {
        "title": "Ship it",
        "description": "",
        "labels": "",
        "priority": "",
        "sprint": "",
    }


def test_labels_joined_comma_separated() -> None:
    result = TaskContext(title="T", labels=["bug", "urgent", "backend"]).build()
    assert result["labels"] == "bug, urgent, backend"


def test_build_passes_through_redact() -> None:
    # A credential-looking value stays (redact drops keys, not values); the 5
    # keys are non-sensitive, so build() output is unchanged by redact().
    result = TaskContext(
        title="T", description="see api_key sk-123", priority="high"
    ).build()
    assert set(result) == _EXPECTED_KEYS
    assert result["description"] == "see api_key sk-123"
    assert result["priority"] == "high"


def test_metadata_reports_has_description_and_label_count() -> None:
    with_desc = TaskContext(title="T", description="d", labels=["a", "b"])
    assert with_desc.metadata() == {"has_description": True, "label_count": 2}

    without = TaskContext(title="T")
    assert without.metadata() == {"has_description": False, "label_count": 0}
