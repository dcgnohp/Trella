"""Tests for task/sprint ``source`` citations (ENH: entity citations).

Task and sprint tool projections carry a non-sensitive ``source`` dict (same
convention as ``semantic_search_documents``) so the reasoning engine surfaces
them as clickable citations. The source is emitted ONLY when the tool context
has a ``workspace_id`` (the FE deep-link needs it); otherwise it is omitted.

No real DB: fake business services/repos are injected and return
``SimpleNamespace`` rows shaped like the real SQLModel objects. Deterministic,
AI-free, no network.
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from typing import Any, cast

from sqlmodel import Session

from app.ai.reasoning.engine import _extract_citations
from app.ai.tools.base import ToolContext
from app.ai.tools.data_access.sprint_tools import CurrentSprintTool, SprintDetailTool
from app.ai.tools.data_access.task_tools import (
    BlockedTasksTool,
    TaskDetailTool,
    TaskLookupTool,
    TaskSearchTool,
)
from app.ai.tools.permissions import PermissionLayer
from app.models.enums import CanonicalStatus
from app.models.users_model import User


# --------------------------------------------------------------------------- #
# Shared stubs                                                                #
# --------------------------------------------------------------------------- #
def _session() -> Session:
    return cast(Session, object())


def _user() -> User:
    return cast(User, SimpleNamespace(id=uuid.uuid4()))


def _ctx(workspace_id: uuid.UUID | None) -> ToolContext:
    return ToolContext(session=_session(), user=_user(), workspace_id=workspace_id)


def _run(tool: Any, args: dict[str, Any], ctx: ToolContext) -> Any:
    return asyncio.run(tool.run(args, ctx))


class _AllowPerms(PermissionLayer):
    def __init__(self) -> None:  # bypass real RBAC/membership
        pass

    def check_project(self, *_a: Any, **_k: Any) -> None:
        return None

    def check_workspace(self, *_a: Any, **_k: Any) -> None:
        return None


def _task(**kw: Any) -> Any:
    base: dict[str, Any] = {
        "id": uuid.uuid4(),
        "project_id": uuid.uuid4(),
        "board_id": uuid.uuid4(),
        "title": "Fix login",
        "description": None,
        "priority": "HIGH",
        "type": "BUG",
        "story_point": 3,
        "assignee_id": None,
        "sprint_id": None,
        "custom_status_id": None,
        "issue_key": "WEB-1",
        "due_date": None,
    }
    base.update(kw)
    return SimpleNamespace(**base)


def _sprint(**kw: Any) -> Any:
    base: dict[str, Any] = {
        "id": uuid.uuid4(),
        "name": "Sprint 1",
        "goal": "ship it",
        "status": "ACTIVE",
        "start_date": None,
        "end_date": None,
    }
    base.update(kw)
    return SimpleNamespace(**base)


# --------------------------------------------------------------------------- #
# task source: get_task_detail / lookup_task                                  #
# --------------------------------------------------------------------------- #
def test_task_detail_carries_task_source() -> None:
    ws_id = uuid.uuid4()
    task = _task()
    svc = SimpleNamespace(get_task=lambda session, task_id, user: task)
    tool = TaskDetailTool(tasks_service=cast(Any, svc))

    result = _run(tool, {"task_id": str(task.id)}, _ctx(ws_id))

    assert result.ok is True
    assert result.content["source"] == {
        "type": "task",
        "id": str(task.id),
        "title": "Fix login",
        "issue_key": "WEB-1",
        "workspace_id": str(ws_id),
        "board_id": str(task.board_id),
    }


def test_lookup_task_carries_task_source() -> None:
    ws_id = uuid.uuid4()
    pid = uuid.uuid4()
    task = _task(issue_key="WEB-7")
    sprints_svc = SimpleNamespace(
        list_sprints_with_tasks=lambda s, p, u: [{"tasks": [task]}]
    )
    tasks_svc = SimpleNamespace(list_backlog=lambda s, p, u: [])
    tool = TaskLookupTool(
        tasks_service=cast(Any, tasks_svc),
        sprints_service=cast(Any, sprints_svc),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"project_id": str(pid), "issue_key": "WEB-7"}, _ctx(ws_id))

    assert result.ok is True
    src = result.content["source"]
    assert src["type"] == "task"
    assert src["id"] == str(task.id)
    assert src["issue_key"] == "WEB-7"
    assert src["board_id"] == str(task.board_id)
    assert src["workspace_id"] == str(ws_id)


# --------------------------------------------------------------------------- #
# task source: search_tasks briefs                                            #
# --------------------------------------------------------------------------- #
def test_search_tasks_briefs_carry_task_source() -> None:
    ws_id = uuid.uuid4()
    pid = uuid.uuid4()
    task = _task(title="login bug", issue_key="WEB-2")
    sprints_svc = SimpleNamespace(
        list_sprints_with_tasks=lambda s, p, u: [{"tasks": [task]}]
    )
    tasks_svc = SimpleNamespace(list_backlog=lambda s, p, u: [])
    tool = TaskSearchTool(
        tasks_service=cast(Any, tasks_svc),
        sprints_service=cast(Any, sprints_svc),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"project_id": str(pid), "query": "login"}, _ctx(ws_id))

    assert result.ok is True
    assert len(result.content) == 1
    src = result.content[0]["source"]
    assert src["type"] == "task"
    assert src["issue_key"] == "WEB-2"
    assert src["board_id"] == str(task.board_id)
    assert src["workspace_id"] == str(ws_id)


# --------------------------------------------------------------------------- #
# task source: get_blocked_tasks items                                        #
# --------------------------------------------------------------------------- #
def test_blocked_tasks_items_carry_task_source() -> None:
    ws_id = uuid.uuid4()
    pid = uuid.uuid4()
    pending_status = uuid.uuid4()

    project = SimpleNamespace(id=pid, workspace_id=ws_id)
    statuses = [
        SimpleNamespace(
            id=pending_status, canonical_status=CanonicalStatus.PENDING.value
        ),
    ]
    task = _task(issue_key="WEB-9", custom_status_id=pending_status)

    tool = BlockedTasksTool(
        tasks_service=cast(
            Any, SimpleNamespace(list_backlog=lambda s, p, u: [task])
        ),
        sprints_service=cast(
            Any, SimpleNamespace(list_sprints_with_tasks=lambda s, p, u: [])
        ),
        projects_repo=cast(Any, SimpleNamespace(get=lambda s, p: project)),
        custom_statuses_repo=cast(
            Any, SimpleNamespace(list_by_workspace=lambda s, w: statuses)
        ),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"project_id": str(pid)}, _ctx(ws_id))

    assert result.ok is True
    assert len(result.content) == 1
    src = result.content[0]["source"]
    assert src["type"] == "task"
    assert src["issue_key"] == "WEB-9"
    assert src["board_id"] == str(task.board_id)
    assert src["workspace_id"] == str(ws_id)


# --------------------------------------------------------------------------- #
# sprint source: get_sprint_detail / get_current_sprint                       #
# --------------------------------------------------------------------------- #
def test_sprint_detail_carries_sprint_source() -> None:
    ws_id = uuid.uuid4()
    sprint = _sprint(name="Sprint 42")
    svc = SimpleNamespace(get_sprint=lambda session, sprint_id, user: sprint)
    tool = SprintDetailTool(sprints_service=cast(Any, svc))

    result = _run(tool, {"sprint_id": str(sprint.id)}, _ctx(ws_id))

    assert result.ok is True
    assert result.content["source"] == {
        "type": "sprint",
        "id": str(sprint.id),
        "title": "Sprint 42",
        "workspace_id": str(ws_id),
    }


def test_current_sprint_carries_sprint_source() -> None:
    ws_id = uuid.uuid4()
    sprint = _sprint(name="Sprint 42")
    repo = SimpleNamespace(get_active_sprint=lambda session, project_id: sprint)
    tool = CurrentSprintTool(sprints_repo=cast(Any, repo), permissions=_AllowPerms())

    result = _run(tool, {"project_id": str(uuid.uuid4())}, _ctx(ws_id))

    assert result.ok is True
    src = result.content["source"]
    assert src["type"] == "sprint"
    assert src["id"] == str(sprint.id)
    assert src["title"] == "Sprint 42"
    assert src["workspace_id"] == str(ws_id)


# --------------------------------------------------------------------------- #
# guard: no workspace_id -> NO source key                                     #
# --------------------------------------------------------------------------- #
def test_task_detail_omits_source_without_workspace() -> None:
    task = _task()
    svc = SimpleNamespace(get_task=lambda session, task_id, user: task)
    tool = TaskDetailTool(tasks_service=cast(Any, svc))

    result = _run(tool, {"task_id": str(task.id)}, _ctx(None))

    assert result.ok is True
    assert "source" not in result.content


def test_sprint_detail_omits_source_without_workspace() -> None:
    sprint = _sprint()
    svc = SimpleNamespace(get_sprint=lambda session, sprint_id, user: sprint)
    tool = SprintDetailTool(sprints_service=cast(Any, svc))

    result = _run(tool, {"sprint_id": str(sprint.id)}, _ctx(None))

    assert result.ok is True
    assert "source" not in result.content


def test_search_tasks_briefs_omit_source_without_workspace() -> None:
    pid = uuid.uuid4()
    task = _task(title="login bug")
    sprints_svc = SimpleNamespace(
        list_sprints_with_tasks=lambda s, p, u: [{"tasks": [task]}]
    )
    tasks_svc = SimpleNamespace(list_backlog=lambda s, p, u: [])
    tool = TaskSearchTool(
        tasks_service=cast(Any, tasks_svc),
        sprints_service=cast(Any, sprints_svc),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"project_id": str(pid), "query": "login"}, _ctx(None))

    assert result.ok is True
    assert all("source" not in brief for brief in result.content)


# --------------------------------------------------------------------------- #
# end-to-end: engine._extract_citations pulls the task/sprint sources         #
# --------------------------------------------------------------------------- #
def test_extract_citations_from_task_detail_content() -> None:
    ws_id = uuid.uuid4()
    task = _task()
    svc = SimpleNamespace(get_task=lambda session, task_id, user: task)
    result = _run(TaskDetailTool(tasks_service=cast(Any, svc)), {"task_id": str(task.id)}, _ctx(ws_id))

    citations = _extract_citations(result.content)

    assert citations == [
        {
            "type": "task",
            "id": str(task.id),
            "title": "Fix login",
            "issue_key": "WEB-1",
            "workspace_id": str(ws_id),
            "board_id": str(task.board_id),
        }
    ]


def test_extract_citations_from_search_tasks_list() -> None:
    ws_id = uuid.uuid4()
    pid = uuid.uuid4()
    task = _task(title="login bug", issue_key="WEB-2")
    sprints_svc = SimpleNamespace(
        list_sprints_with_tasks=lambda s, p, u: [{"tasks": [task]}]
    )
    tasks_svc = SimpleNamespace(list_backlog=lambda s, p, u: [])
    tool = TaskSearchTool(
        tasks_service=cast(Any, tasks_svc),
        sprints_service=cast(Any, sprints_svc),
        permissions=_AllowPerms(),
    )
    result = _run(tool, {"project_id": str(pid), "query": "login"}, _ctx(ws_id))

    citations = _extract_citations(result.content)

    assert citations is not None
    assert len(citations) == 1
    assert citations[0]["type"] == "task"
    assert citations[0]["id"] == str(task.id)


def test_extract_citations_from_sprint_detail_content() -> None:
    ws_id = uuid.uuid4()
    sprint = _sprint(name="Sprint 42")
    svc = SimpleNamespace(get_sprint=lambda session, sprint_id, user: sprint)
    result = _run(
        SprintDetailTool(sprints_service=cast(Any, svc)),
        {"sprint_id": str(sprint.id)},
        _ctx(ws_id),
    )

    citations = _extract_citations(result.content)

    assert citations == [
        {
            "type": "sprint",
            "id": str(sprint.id),
            "title": "Sprint 42",
            "workspace_id": str(ws_id),
        }
    ]


def test_extract_citations_none_without_workspace() -> None:
    task = _task()
    svc = SimpleNamespace(get_task=lambda session, task_id, user: task)
    result = _run(
        TaskDetailTool(tasks_service=cast(Any, svc)),
        {"task_id": str(task.id)},
        _ctx(None),
    )

    assert _extract_citations(result.content) is None
