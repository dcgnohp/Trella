"""Tests for the Phase 8 write tools (propose + apply adapters).

No real DB: fake business services (``SimpleNamespace`` with callables) are
injected into each tool constructor. A stub stands in for ``Session``.

Contract under test:
* every tool is ``mutating`` and carries the ``"write"`` capability;
* ``run`` (PROPOSE) validates + previews and NEVER calls the business service;
* bad/missing args in ``run`` surface as ``error="invalid_args"``;
* ``apply`` calls the frozen service with a correctly-typed DTO and returns a
  tiny summary, and lets a business ``HTTPException`` propagate (not swallowed).
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from typing import Any, cast

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.ai.tools.base import ToolContext
from app.ai.tools.data_access.doc_write_tools import CreateDocTool, UpdateDocTool
from app.ai.tools.data_access.sprint_write_tools import (
    CompleteSprintTool,
    CreateSprintTool,
    StartSprintTool,
)
from app.ai.tools.data_access.task_write_tools import (
    AssignTaskTool,
    CreateTaskTool,
    MoveTaskTool,
    UpdateTaskTool,
)
from app.ai.tools.data_access.write_tools import all_write_tools
from app.models.users_model import User
from app.schemas.docs_schema import DocCreate, DocUpdate
from app.schemas.sprints_schema import SprintComplete, SprintCreate, SprintStart
from app.schemas.tasks_schema import TaskCreate, TaskUpdate


# --------------------------------------------------------------------------- #
# Shared stubs                                                                #
# --------------------------------------------------------------------------- #
def _session() -> Session:
    return cast(Session, object())


def _user() -> User:
    return cast(User, SimpleNamespace(id=uuid.uuid4()))


def _ctx(workspace_id: uuid.UUID | None = None) -> ToolContext:
    return ToolContext(session=_session(), user=_user(), workspace_id=workspace_id)


def _run(tool: Any, args: dict[str, Any]) -> Any:
    return asyncio.run(tool.run(args, tool_ctx))


def _apply(tool: Any, args: dict[str, Any], ctx: ToolContext) -> Any:
    return asyncio.run(tool.apply(args, ctx))


tool_ctx = _ctx(workspace_id=uuid.uuid4())


def _boom(*_a: Any, **_k: Any) -> Any:
    """Fake service method that fails if ``run`` ever calls it (proves no mutation)."""
    raise AssertionError("business service must not be called during run()/PROPOSE")


def _fake_task() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(), issue_key="PROJ-1", title="T", sprint_id=None
    )


def _fake_sprint() -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), name="Sprint 1", status="PLANNED")


def _fake_doc() -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), title="Release notes")


# --------------------------------------------------------------------------- #
# 1. Spec taxonomy: every tool is mutating + write                            #
# --------------------------------------------------------------------------- #
def test_all_tools_are_mutating_write() -> None:
    tools = all_write_tools()
    assert len(tools) == 9
    for tool in tools:
        assert tool.spec.mutating is True
        assert "write" in tool.spec.capabilities


# --------------------------------------------------------------------------- #
# 2. run() PROPOSE returns preview + args and never calls the service         #
# --------------------------------------------------------------------------- #
def test_create_task_run_proposes_without_mutation() -> None:
    tool = CreateTaskTool(tasks_service=cast(Any, SimpleNamespace(create_task=_boom)))
    res = _run(
        tool,
        {
            "board_id": str(uuid.uuid4()),
            "column_id": str(uuid.uuid4()),
            "title": "Ship it",
        },
    )
    assert res.ok is True
    assert isinstance(res.content["preview"], str)
    assert "Ship it" in res.content["preview"]
    assert isinstance(res.content["args"], dict)
    assert res.content["args"]["title"] == "Ship it"


def test_start_sprint_run_proposes_without_mutation() -> None:
    tool = StartSprintTool(
        sprints_service=cast(Any, SimpleNamespace(start_sprint=_boom))
    )
    res = _run(
        tool,
        {
            "sprint_id": str(uuid.uuid4()),
            "start_date": "2024-01-01",
            "end_date": "2024-01-14",
        },
    )
    assert res.ok is True
    assert isinstance(res.content["preview"], str)
    assert isinstance(res.content["args"], dict)


# --------------------------------------------------------------------------- #
# 3. run() invalid args                                                       #
# --------------------------------------------------------------------------- #
def test_create_task_run_missing_title_invalid() -> None:
    tool = CreateTaskTool(tasks_service=cast(Any, SimpleNamespace(create_task=_boom)))
    res = _run(tool, {"board_id": str(uuid.uuid4()), "column_id": str(uuid.uuid4())})
    assert res.ok is False
    assert res.error == "invalid_args"


def test_update_task_run_requires_a_field() -> None:
    tool = UpdateTaskTool(tasks_service=cast(Any, SimpleNamespace(update_task=_boom)))
    res = _run(tool, {"task_id": str(uuid.uuid4())})  # no fields to change
    assert res.ok is False
    assert res.error == "invalid_args"


def test_move_task_run_bad_uuid_invalid() -> None:
    tool = MoveTaskTool(tasks_service=cast(Any, SimpleNamespace(update_task=_boom)))
    res = _run(tool, {"task_id": str(uuid.uuid4()), "sprint_id": "not-a-uuid"})
    assert res.ok is False
    assert res.error == "invalid_args"


# --------------------------------------------------------------------------- #
# 4. apply() builds the correct DTO and returns a tiny summary                #
# --------------------------------------------------------------------------- #
def test_create_task_apply_builds_task_create() -> None:
    captured: dict[str, Any] = {}

    def _create_task(
        _session: Any, board_id: Any, column_id: Any, data: Any, _user: Any
    ) -> Any:
        captured["board_id"] = board_id
        captured["column_id"] = column_id
        captured["data"] = data
        return _fake_task()

    board_id, column_id = str(uuid.uuid4()), str(uuid.uuid4())
    explicit_col = SimpleNamespace(
        id=uuid.UUID(column_id), name="Doing", status_key="IN_PROGRESS"
    )
    tool = CreateTaskTool(
        tasks_service=cast(Any, SimpleNamespace(create_task=_create_task)),
        columns_repo=cast(
            Any, SimpleNamespace(list_by_board=lambda s, b: [explicit_col])
        ),
    )
    res = _apply(
        tool,
        {"board_id": board_id, "column_id": column_id, "title": "T", "story_point": 3},
        tool_ctx,
    )
    assert res.ok is True
    assert res.content["issue_key"] == "PROJ-1"
    assert str(captured["column_id"]) == column_id  # honoured the explicit column
    assert isinstance(captured["data"], TaskCreate)
    assert captured["data"].title == "T"
    assert captured["data"].story_point == 3
    assert str(captured["board_id"]) == board_id


def test_assign_task_apply_sets_and_unsets() -> None:
    calls: list[str] = []

    def _set(_session: Any, _task_id: Any, _assignee_id: Any, _user: Any) -> Any:
        calls.append("set")
        return _fake_task()

    def _unset(_session: Any, _task_id: Any, _user: Any) -> Any:
        calls.append("unset")
        return _fake_task()

    tool = AssignTaskTool(
        tasks_service=cast(
            Any, SimpleNamespace(set_assignee=_set, unset_assignee=_unset)
        )
    )
    _apply(
        tool, {"task_id": str(uuid.uuid4()), "assignee_id": str(uuid.uuid4())}, tool_ctx
    )
    _apply(tool, {"task_id": str(uuid.uuid4())}, tool_ctx)
    assert calls == ["set", "unset"]


def test_create_sprint_apply_builds_sprint_create() -> None:
    captured: dict[str, Any] = {}

    def _create_sprint(_session: Any, _project_id: Any, data: Any, _user: Any) -> Any:
        captured["data"] = data
        return _fake_sprint()

    tool = CreateSprintTool(
        sprints_service=cast(Any, SimpleNamespace(create_sprint=_create_sprint))
    )
    res = _apply(
        tool,
        {"project_id": str(uuid.uuid4()), "name": "S1", "start_date": "2024-01-01"},
        tool_ctx,
    )
    assert res.ok is True
    assert set(res.content) == {"id", "name", "status", "message"}
    assert isinstance(captured["data"], SprintCreate)
    assert captured["data"].name == "S1"


def test_start_sprint_apply_builds_sprint_start() -> None:
    captured: dict[str, Any] = {}

    def _start(_session: Any, _sprint_id: Any, data: Any, _user: Any) -> Any:
        captured["data"] = data
        return _fake_sprint()

    tool = StartSprintTool(
        sprints_service=cast(Any, SimpleNamespace(start_sprint=_start))
    )
    _apply(
        tool,
        {
            "sprint_id": str(uuid.uuid4()),
            "start_date": "2024-01-01",
            "end_date": "2024-01-14",
        },
        tool_ctx,
    )
    assert isinstance(captured["data"], SprintStart)
    assert captured["data"].start_date.isoformat() == "2024-01-01"


def test_complete_sprint_apply_defaults_move_open_to_backlog() -> None:
    captured: dict[str, Any] = {}

    def _complete(_session: Any, _sprint_id: Any, data: Any, _user: Any) -> Any:
        captured["data"] = data
        return _fake_sprint()

    tool = CompleteSprintTool(
        sprints_service=cast(Any, SimpleNamespace(complete_sprint=_complete))
    )
    _apply(tool, {"sprint_id": str(uuid.uuid4())}, tool_ctx)
    assert isinstance(captured["data"], SprintComplete)
    assert captured["data"].move_open_to == "backlog"


def test_update_task_apply_builds_task_update() -> None:
    captured: dict[str, Any] = {}

    def _update(_session: Any, _task_id: Any, data: Any, _user: Any) -> Any:
        captured["data"] = data
        return _fake_task()

    tool = UpdateTaskTool(tasks_service=cast(Any, SimpleNamespace(update_task=_update)))
    _apply(tool, {"task_id": str(uuid.uuid4()), "priority": "HIGH"}, tool_ctx)
    assert isinstance(captured["data"], TaskUpdate)
    assert captured["data"].priority == "HIGH"


def test_create_doc_apply_builds_doc_create() -> None:
    captured: dict[str, Any] = {}

    def _create_doc(_session: Any, workspace_id: Any, data: Any, _user: Any) -> Any:
        captured["workspace_id"] = workspace_id
        captured["data"] = data
        return _fake_doc()

    tool = CreateDocTool(
        docs_service=cast(Any, SimpleNamespace(create_doc=_create_doc))
    )
    res = _apply(tool, {"title": "Release notes", "content": "hi"}, tool_ctx)
    assert res.ok is True
    assert set(res.content) == {"id", "title", "message"}
    assert isinstance(captured["data"], DocCreate)
    assert captured["data"].title == "Release notes"


def test_update_doc_apply_builds_doc_update() -> None:
    captured: dict[str, Any] = {}

    def _update_doc(
        _session: Any, _workspace_id: Any, _doc_id: Any, data: Any, _user: Any
    ) -> Any:
        captured["data"] = data
        return _fake_doc()

    tool = UpdateDocTool(
        docs_service=cast(Any, SimpleNamespace(update_doc=_update_doc))
    )
    _apply(tool, {"doc_id": str(uuid.uuid4()), "title": "New"}, tool_ctx)
    assert isinstance(captured["data"], DocUpdate)
    assert captured["data"].title == "New"


# --------------------------------------------------------------------------- #
# 5. apply() propagates business HTTPException (not swallowed)                #
# --------------------------------------------------------------------------- #
def test_apply_propagates_http_exception() -> None:
    def _denied(*_a: Any, **_k: Any) -> Any:
        raise HTTPException(status_code=403, detail="nope")

    tool = UpdateTaskTool(tasks_service=cast(Any, SimpleNamespace(update_task=_denied)))
    with pytest.raises(HTTPException):
        _apply(tool, {"task_id": str(uuid.uuid4()), "title": "x"}, tool_ctx)


# --------------------------------------------------------------------------- #
# 6. Doc tools require ctx.workspace_id                                        #
# --------------------------------------------------------------------------- #
def test_create_doc_run_requires_workspace() -> None:
    tool = CreateDocTool(docs_service=cast(Any, SimpleNamespace(create_doc=_boom)))
    res = asyncio.run(tool.run({"title": "x"}, _ctx(workspace_id=None)))
    assert res.ok is False
    assert res.error == "invalid_args"


def test_update_doc_run_requires_workspace() -> None:
    tool = UpdateDocTool(docs_service=cast(Any, SimpleNamespace(update_doc=_boom)))
    res = asyncio.run(
        tool.run({"doc_id": str(uuid.uuid4()), "title": "x"}, _ctx(workspace_id=None))
    )
    assert res.ok is False
    assert res.error == "invalid_args"


# --------------------------------------------------------------------------- #
# create_task: default column resolution + description (bug fix)              #
# --------------------------------------------------------------------------- #
def test_create_task_defaults_to_first_column_when_column_id_omitted() -> None:
    captured: dict[str, Any] = {}

    def _create(_s: Any, _b: Any, column_id: Any, data: Any, _u: Any) -> Any:
        captured["column_id"] = column_id
        captured["data"] = data
        return _fake_task()

    # No "TODO" status_key column -> fall back to the leftmost (position 0).
    first_col = SimpleNamespace(id=uuid.uuid4(), name="Doing", status_key="IN_PROGRESS")
    tool = CreateTaskTool(
        tasks_service=cast(Any, SimpleNamespace(create_task=_create)),
        columns_repo=cast(
            Any,
            SimpleNamespace(
                list_by_board=lambda s, b: [
                    first_col,
                    SimpleNamespace(id=uuid.uuid4(), name="Done", status_key="DONE"),
                ]
            ),
        ),
    )

    result = _apply(
        tool, {"board_id": str(uuid.uuid4()), "title": "Fix login"}, tool_ctx
    )

    assert result.ok is True
    assert captured["column_id"] == first_col.id  # no To Do -> leftmost column
    assert isinstance(captured["data"], TaskCreate)
    assert captured["data"].title == "Fix login"


def test_create_task_passes_description() -> None:
    captured: dict[str, Any] = {}

    def _create(_s: Any, _b: Any, _c: Any, data: Any, _u: Any) -> Any:
        captured["data"] = data
        return _fake_task()

    tool = CreateTaskTool(
        tasks_service=cast(Any, SimpleNamespace(create_task=_create)),
        columns_repo=cast(
            Any,
            SimpleNamespace(
                list_by_board=lambda s, b: [SimpleNamespace(id=uuid.uuid4())]
            ),
        ),
    )

    result = _apply(
        tool,
        {
            "board_id": str(uuid.uuid4()),
            "title": "T",
            "description": "hello desc\n\n## Criteria\n- a\n- b",
        },
        tool_ctx,
    )

    assert result.ok is True
    # The description field stores HTML (TipTap editor); the LLM authors Markdown,
    # so it is converted to HTML at persist time (renders formatted, not raw).
    html = captured["data"].description
    assert "<p>hello desc</p>" in html
    assert "<h2>Criteria</h2>" in html
    assert "<li>a</li>" in html and "<li>b</li>" in html
    assert "##" not in html and "- a" not in html


def test_create_task_prefers_todo_column_and_reports_placement() -> None:
    captured: dict[str, Any] = {}
    sprint_id = uuid.uuid4()

    def _create(_s: Any, _b: Any, column_id: Any, _data: Any, _u: Any) -> Any:
        captured["column_id"] = column_id
        return SimpleNamespace(
            id=uuid.uuid4(),
            issue_key="ACME-5",
            title="Fix login bug",
            sprint_id=sprint_id,
        )

    todo_col = SimpleNamespace(id=uuid.uuid4(), name="To Do", status_key="todo")
    columns = [
        SimpleNamespace(id=uuid.uuid4(), name="Backlog", status_key="BACKLOG"),
        todo_col,
        SimpleNamespace(id=uuid.uuid4(), name="Done", status_key="DONE"),
    ]
    # Session stub whose .get returns a named sprint so the message can cite it.
    session = SimpleNamespace(get=lambda _model, _id: SimpleNamespace(name="Sprint 3"))
    ctx = ToolContext(
        session=cast(Any, session), user=_user(), workspace_id=uuid.uuid4()
    )
    tool = CreateTaskTool(
        tasks_service=cast(Any, SimpleNamespace(create_task=_create)),
        columns_repo=cast(Any, SimpleNamespace(list_by_board=lambda s, b: columns)),
    )

    result = _apply(
        tool, {"board_id": str(uuid.uuid4()), "title": "Fix login bug"}, ctx
    )

    assert result.ok is True
    assert captured["column_id"] == todo_col.id  # chose To Do over the leftmost
    assert result.content["status"] == "To Do"
    assert result.content["sprint"] == "Sprint 3"
    assert "Sprint 3" in result.content["message"]
    assert "ACME-5" in result.content["message"]


def test_create_task_reports_backlog_when_no_sprint() -> None:
    tool = CreateTaskTool(
        tasks_service=cast(
            Any, SimpleNamespace(create_task=lambda *a, **k: _fake_task())
        ),
        columns_repo=cast(
            Any,
            SimpleNamespace(
                list_by_board=lambda s, b: [
                    SimpleNamespace(id=uuid.uuid4(), name="To Do", status_key="TODO")
                ]
            ),
        ),
    )
    result = _apply(tool, {"board_id": str(uuid.uuid4()), "title": "T"}, tool_ctx)
    assert result.ok is True
    assert result.content["sprint"] is None
    assert "backlog" in result.content["message"]


def test_create_task_no_columns_returns_error_without_calling_service() -> None:
    tool = CreateTaskTool(
        tasks_service=cast(Any, SimpleNamespace(create_task=_boom)),  # must not run
        columns_repo=cast(Any, SimpleNamespace(list_by_board=lambda s, b: [])),
    )
    result = _apply(tool, {"board_id": str(uuid.uuid4()), "title": "T"}, tool_ctx)
    assert result.ok is False
    assert result.error == "no_board_column"
