"""Tests for the data-access tools (P7-B4).

No real DB: fake business services are injected into each tool's constructor
and return ``SimpleNamespace`` objects shaped like the real SQLModel rows.
A stub stands in for the ``Session`` because the fakes ignore it.

Convention under test: our own validation failures (bad/missing args, target
not a workspace member) surface as ``ToolResult(error=...)``, while a permission
denial from a permission-enforcing service PROPAGATES out of ``run`` (the Tool
Executor wraps it). We therefore assert propagation, not catching.
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from typing import Any, cast

import pytest
from fastapi import HTTPException, status
from sqlmodel import Session

from app.ai.tools.base import ToolContext
from app.ai.tools.data_access.board_tools import BoardListTool
from app.ai.tools.data_access.knowledge_tools import (
    DocumentDetailTool,
    DocumentSearchTool,
)
from app.ai.tools.data_access.project_tools import ProjectHealthTool, ProjectSummaryTool
from app.ai.tools.data_access.sprint_tools import CurrentSprintTool, SprintMetricsTool
from app.ai.tools.data_access.task_tools import (
    BlockedTasksTool,
    TaskDetailTool,
    TaskSearchTool,
)
from app.ai.tools.data_access.user_tools import UserLookupTool
from app.ai.tools.data_access.workspace_tools import (
    ListWorkspacesTool,
    ProjectListTool,
    WorkspaceSummaryTool,
)
from app.ai.tools.permissions import PermissionDenied, PermissionLayer
from app.models.enums import CanonicalStatus
from app.models.users_model import User


# --------------------------------------------------------------------------- #
# Shared stubs                                                                #
# --------------------------------------------------------------------------- #
def _session() -> Session:
    return cast(Session, object())


def _user() -> User:
    return cast(User, SimpleNamespace(id=uuid.uuid4()))


def _ctx(workspace_id: uuid.UUID | None = None) -> ToolContext:
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


class _DenyPerms(PermissionLayer):
    def __init__(self, code: str = "not_authorized") -> None:
        self._code = code

    def check_project(self, *_a: Any, **_k: Any) -> None:
        raise PermissionDenied(self._code, "denied")

    def check_workspace(self, *_a: Any, **_k: Any) -> None:
        raise PermissionDenied(self._code, "denied")


# --------------------------------------------------------------------------- #
# workspace_tools                                                             #
# --------------------------------------------------------------------------- #
def test_workspace_summary_happy_path() -> None:
    ws_id = uuid.uuid4()
    org = SimpleNamespace(id=ws_id, name="Acme", mode="SCRUM")
    fake_orgs = SimpleNamespace(get_for_member=lambda session, org_id, user_id: org)
    tool = WorkspaceSummaryTool(orgs_service=cast(Any, fake_orgs))

    result = _run(tool, {}, _ctx(ws_id))

    assert result.ok is True
    assert result.source == "workspace"
    assert result.content == {"id": str(ws_id), "name": "Acme", "mode": "SCRUM"}


def test_workspace_summary_missing_workspace_is_invalid_args() -> None:
    tool = WorkspaceSummaryTool(orgs_service=cast(Any, SimpleNamespace()))
    result = _run(tool, {}, _ctx(None))
    assert result.ok is False
    assert result.error == "invalid_args"


# --------------------------------------------------------------------------- #
# project_tools                                                               #
# --------------------------------------------------------------------------- #
def test_project_summary_happy_path() -> None:
    pid = uuid.uuid4()
    project = SimpleNamespace(
        id=pid, name="Web", key="WEB", description="desc", task_counter=7
    )
    repo = SimpleNamespace(get=lambda session, project_id: project)
    tool = ProjectSummaryTool(projects_repo=cast(Any, repo), permissions=_AllowPerms())

    result = _run(tool, {"project_id": str(pid)}, _ctx())

    assert result.ok is True
    assert result.source == "project"
    assert result.content["key"] == "WEB"
    # task_counter (issue-key sequence) is intentionally NOT exposed — the model
    # was mistaking it for a task count.
    assert "task_counter" not in result.content


def test_project_summary_bad_uuid_is_invalid_args() -> None:
    tool = ProjectSummaryTool(
        projects_repo=cast(Any, SimpleNamespace()), permissions=_AllowPerms()
    )
    result = _run(tool, {"project_id": "not-a-uuid"}, _ctx())
    assert result.ok is False
    assert result.error == "invalid_args"


def test_project_summary_permission_denied_propagates() -> None:
    tool = ProjectSummaryTool(
        projects_repo=cast(Any, SimpleNamespace()), permissions=_DenyPerms()
    )
    with pytest.raises(PermissionDenied):
        _run(tool, {"project_id": str(uuid.uuid4())}, _ctx())


# --------------------------------------------------------------------------- #
# sprint_tools                                                                #
# --------------------------------------------------------------------------- #
def test_current_sprint_none_returns_ok_null() -> None:
    repo = SimpleNamespace(get_active_sprint=lambda session, project_id: None)
    tool = CurrentSprintTool(sprints_repo=cast(Any, repo), permissions=_AllowPerms())

    result = _run(tool, {"project_id": str(uuid.uuid4())}, _ctx())

    assert result.ok is True
    assert result.content is None
    assert result.source == "sprint"


def test_sprint_metrics_returns_service_dict() -> None:
    insights = {
        "commitment": {"total_points": 13, "completed_points": 5},
        "work_types": {"TASK": 3, "BUG": 1},
    }
    svc = SimpleNamespace(
        get_sprint_insights=lambda session, project_id, sprint_id, user: insights
    )
    tool = SprintMetricsTool(sprints_service=cast(Any, svc))

    result = _run(
        tool,
        {"project_id": str(uuid.uuid4()), "sprint_id": str(uuid.uuid4())},
        _ctx(),
    )

    assert result.ok is True
    assert result.content == insights


def test_sprint_metrics_permission_denied_from_service_propagates() -> None:
    def _boom(*_a: Any, **_k: Any) -> None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="no")

    svc = SimpleNamespace(get_sprint_insights=_boom)
    tool = SprintMetricsTool(sprints_service=cast(Any, svc))

    with pytest.raises(HTTPException):
        _run(
            tool,
            {"project_id": str(uuid.uuid4()), "sprint_id": str(uuid.uuid4())},
            _ctx(),
        )


# --------------------------------------------------------------------------- #
# task_tools                                                                  #
# --------------------------------------------------------------------------- #
def test_task_detail_happy_path_trims_and_omits_secrets() -> None:
    task = SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        title="Fix login",
        description="x" * 5000,  # will be truncated
        priority="HIGH",
        type="BUG",
        story_point=3,
        assignee_id=None,
        sprint_id=None,
        custom_status_id=None,
        issue_key="WEB-1",
        due_date=None,
    )
    svc = SimpleNamespace(get_task=lambda session, task_id, user: task)
    tool = TaskDetailTool(tasks_service=cast(Any, svc))

    result = _run(tool, {"task_id": str(task.id)}, _ctx())

    assert result.ok is True
    assert result.source == "task"
    assert result.content["issue_key"] == "WEB-1"
    assert len(result.content["description"]) == 2000  # MAX_TEXT cap
    assert "hashed_password" not in result.content


def test_task_detail_missing_arg_is_invalid_args() -> None:
    tool = TaskDetailTool(tasks_service=cast(Any, SimpleNamespace()))
    result = _run(tool, {}, _ctx())
    assert result.ok is False
    assert result.error == "invalid_args"


def test_blocked_tasks_returns_only_pending_canonical() -> None:
    pid = uuid.uuid4()
    ws_id = uuid.uuid4()
    todo_status = uuid.uuid4()
    pending_status = uuid.uuid4()

    project = SimpleNamespace(id=pid, workspace_id=ws_id)
    statuses = [
        SimpleNamespace(id=todo_status, canonical_status=CanonicalStatus.TODO.value),
        SimpleNamespace(
            id=pending_status, canonical_status=CanonicalStatus.PENDING.value
        ),
    ]
    t_blocked = SimpleNamespace(
        id=uuid.uuid4(),
        title="Blocked one",
        issue_key="WEB-9",
        sprint_id=None,
        custom_status_id=pending_status,
    )
    t_todo = SimpleNamespace(
        id=uuid.uuid4(),
        title="Not blocked",
        issue_key="WEB-10",
        sprint_id=None,
        custom_status_id=todo_status,
    )

    projects_repo = SimpleNamespace(get=lambda session, project_id: project)
    statuses_repo = SimpleNamespace(
        list_by_workspace=lambda session, workspace_id: statuses
    )
    sprints_svc = SimpleNamespace(
        list_sprints_with_tasks=lambda session, project_id, user: [
            {"tasks": [t_blocked]}
        ]
    )
    tasks_svc = SimpleNamespace(list_backlog=lambda session, project_id, user: [t_todo])

    tool = BlockedTasksTool(
        tasks_service=cast(Any, tasks_svc),
        sprints_service=cast(Any, sprints_svc),
        projects_repo=cast(Any, projects_repo),
        custom_statuses_repo=cast(Any, statuses_repo),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"project_id": str(pid)}, _ctx())

    assert result.ok is True
    assert [t["issue_key"] for t in result.content] == ["WEB-9"]


# --------------------------------------------------------------------------- #
# knowledge_tools                                                             #
# --------------------------------------------------------------------------- #
def test_document_detail_truncates_content() -> None:
    ws_id = uuid.uuid4()
    doc = SimpleNamespace(
        id=uuid.uuid4(),
        title="Runbook",
        content="y" * 5000,
        category="ops",
        author_name="Dana",
        linked_entity_label="Project",
        source_type="MANUAL",
    )
    svc = SimpleNamespace(get_doc=lambda session, workspace_id, doc_id, user: doc)
    tool = DocumentDetailTool(docs_service=cast(Any, svc))

    result = _run(tool, {"doc_id": str(doc.id)}, _ctx(ws_id))

    assert result.ok is True
    assert result.source == "knowledge"
    assert len(result.content["content"]) == 2000
    assert result.content["author_name"] == "Dana"


def test_document_detail_requires_workspace() -> None:
    tool = DocumentDetailTool(docs_service=cast(Any, SimpleNamespace()))
    result = _run(tool, {"doc_id": str(uuid.uuid4())}, _ctx(None))
    assert result.ok is False
    assert result.error == "invalid_args"


# --------------------------------------------------------------------------- #
# user_tools                                                                  #
# --------------------------------------------------------------------------- #
def test_user_lookup_happy_path_no_password_leak() -> None:
    ws_id = uuid.uuid4()
    target_id = uuid.uuid4()
    target = SimpleNamespace(
        id=target_id,
        full_name="Sam Rivera",
        email="sam@example.com",
        hashed_password="SECRET",
    )
    members_repo = SimpleNamespace(
        list_active=lambda session, workspace_id: [SimpleNamespace(user_id=target_id)]
    )
    users_svc = SimpleNamespace(get_by_id=lambda session, user_id: target)
    tool = UserLookupTool(
        users_service=cast(Any, users_svc),
        members_repo=cast(Any, members_repo),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"user_id": str(target_id)}, _ctx(ws_id))

    assert result.ok is True
    assert result.source == "user"
    assert result.content == {
        "id": str(target_id),
        "full_name": "Sam Rivera",
        "email": "sam@example.com",
    }
    assert "hashed_password" not in result.content


def test_user_lookup_non_member_returns_not_found() -> None:
    ws_id = uuid.uuid4()
    # Members list does NOT contain the requested id.
    members_repo = SimpleNamespace(
        list_active=lambda session, workspace_id: [
            SimpleNamespace(user_id=uuid.uuid4())
        ]
    )
    # get_by_id must never be reached; make it explode if it is.
    users_svc = SimpleNamespace(
        get_by_id=lambda session, user_id: pytest.fail("should not be called")
    )
    tool = UserLookupTool(
        users_service=cast(Any, users_svc),
        members_repo=cast(Any, members_repo),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"user_id": str(uuid.uuid4())}, _ctx(ws_id))

    assert result.ok is False
    assert result.error == "not_found"


# --------------------------------------------------------------------------- #
# workspace navigation + broadened task search (Phase 7 fix)                  #
# --------------------------------------------------------------------------- #
def test_project_list_returns_only_visible_projects() -> None:
    ws_id = uuid.uuid4()
    p_visible = SimpleNamespace(id=uuid.uuid4(), name="Web", key="WEB")
    p_hidden = SimpleNamespace(id=uuid.uuid4(), name="Secret", key="SEC")

    orgs = SimpleNamespace(get_for_member=lambda s, o, u: object())
    projects_repo = SimpleNamespace(
        list_by_workspace=lambda s, w: [p_visible, p_hidden]
    )
    # Only the visible project has an effective role for this user.
    rbac = SimpleNamespace(
        effective_project_role=lambda s, pid, uid: (
            "PROJECT_MEMBER" if pid == p_visible.id else None
        )
    )
    tool = ProjectListTool(
        orgs_service=cast(Any, orgs),
        projects_repo=cast(Any, projects_repo),
        rbac=cast(Any, rbac),
    )

    result = _run(tool, {}, _ctx(ws_id))

    assert result.ok is True
    assert [p["key"] for p in result.content] == ["WEB"]


def test_task_search_spans_sprint_tasks_and_backlog_deduped() -> None:
    pid = uuid.uuid4()
    # Same task id appears in a sprint AND backlog -> must be de-duplicated;
    # a sprint-only task matching the query must be found (not just backlog).
    shared = SimpleNamespace(
        id=uuid.uuid4(),
        title="login bug",
        description=None,
        issue_key="WEB-1",
        priority="HIGH",
    )
    sprint_only = SimpleNamespace(
        id=uuid.uuid4(),
        title="login page",
        description=None,
        issue_key="WEB-2",
        priority="LOW",
    )
    sprints_svc = SimpleNamespace(
        list_sprints_with_tasks=lambda s, p, u: [{"tasks": [shared, sprint_only]}]
    )
    tasks_svc = SimpleNamespace(list_backlog=lambda s, p, u: [shared])

    tool = TaskSearchTool(
        tasks_service=cast(Any, tasks_svc),
        sprints_service=cast(Any, sprints_svc),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"project_id": str(pid), "query": "login"}, _ctx())

    assert result.ok is True
    keys = sorted(t["issue_key"] for t in result.content)
    assert keys == ["WEB-1", "WEB-2"]  # sprint-only found, shared not duplicated


# --------------------------------------------------------------------------- #
# cross-workspace + accurate task counts (bug fixes)                          #
# --------------------------------------------------------------------------- #
def test_list_workspaces_returns_user_memberships() -> None:
    orgs = SimpleNamespace(
        list_for_user=lambda s, uid: [
            SimpleNamespace(id=uuid.uuid4(), name="phong"),
            SimpleNamespace(id=uuid.uuid4(), name="dfsafas"),
        ]
    )
    tool = ListWorkspacesTool(orgs_service=cast(Any, orgs))

    result = _run(tool, {}, _ctx(None))  # no current workspace needed

    assert result.ok is True
    assert [w["name"] for w in result.content] == ["phong", "dfsafas"]


def test_workspace_summary_targets_other_workspace_via_arg() -> None:
    # The user is in workspace A but asks about workspace B by id -> the arg
    # overrides the ctx workspace, and membership is still checked on B.
    current = uuid.uuid4()
    other = uuid.uuid4()
    seen: dict[str, Any] = {}

    def _get_for_member(_session: Any, org_id: uuid.UUID, _user_id: uuid.UUID) -> Any:
        seen["org_id"] = org_id
        return SimpleNamespace(id=org_id, name="phong", mode="KANBAN")

    tool = WorkspaceSummaryTool(
        orgs_service=cast(Any, SimpleNamespace(get_for_member=_get_for_member))
    )
    result = _run(tool, {"workspace_id": str(other)}, _ctx(current))

    assert result.ok is True
    assert seen["org_id"] == other  # queried the requested workspace, not current
    assert result.content["name"] == "phong"


def test_project_health_total_includes_backlog() -> None:
    pid = uuid.uuid4()
    # One sprint with 2 done / 1 in_progress / 3 todo = 6 sprint tasks,
    # plus a backlog of 6 -> total must be 12 (previously excluded backlog).
    sprints = SimpleNamespace(
        list_sprints_with_tasks=lambda s, p, u: [
            {"done_count": 2, "in_progress_count": 1, "todo_count": 3}
        ]
    )
    backlog = [SimpleNamespace(id=uuid.uuid4()) for _ in range(6)]
    tasks = SimpleNamespace(list_backlog=lambda s, p, u: backlog)
    tool = ProjectHealthTool(
        sprints_service=cast(Any, sprints),
        tasks_service=cast(Any, tasks),
        permissions=_AllowPerms(),
    )

    result = _run(tool, {"project_id": str(pid)}, _ctx())

    assert result.ok is True
    assert result.content["sprint_tasks"] == 6
    assert result.content["backlog_tasks"] == 6
    assert result.content["total_tasks"] == 12


# --------------------------------------------------------------------------- #
# broadened document search (keyword over category + task-linked docs)        #
# --------------------------------------------------------------------------- #
def _doc(**kw: Any) -> Any:
    base: dict[str, Any] = {
        "id": uuid.uuid4(),
        "title": "",
        "content": None,
        "category": None,
        "linked_entity_label": None,
        "source_type": "MANUAL",
        "task_id": None,
    }
    base.update(kw)
    return SimpleNamespace(**base)


def test_document_search_matches_category_not_just_title() -> None:
    ws_id = uuid.uuid4()
    # Title/content have no "devops" but the category does -> must still match.
    devops_doc = _doc(
        title="Deployment Guide", content="repo->service->router", category="DevOps"
    )
    other = _doc(title="Meeting notes", content="standup", category="general")
    svc = SimpleNamespace(list_docs=lambda s, w, u, **kw: [devops_doc, other])
    tool = DocumentSearchTool(docs_service=cast(Any, svc))

    result = _run(tool, {"query": "devops"}, _ctx(ws_id))

    assert result.ok is True
    assert [d["title"] for d in result.content] == ["Deployment Guide"]
    assert result.content[0]["category"] == "DevOps"


def test_document_search_by_task_id() -> None:
    ws_id = uuid.uuid4()
    task_id = uuid.uuid4()
    linked = _doc(title="Spec for task", task_id=task_id)
    unlinked = _doc(title="Unrelated", task_id=uuid.uuid4())
    svc = SimpleNamespace(list_docs=lambda s, w, u, **kw: [linked, unlinked])
    tool = DocumentSearchTool(docs_service=cast(Any, svc))

    result = _run(tool, {"task_id": str(task_id)}, _ctx(ws_id))

    assert result.ok is True
    assert [d["title"] for d in result.content] == ["Spec for task"]


def test_document_search_requires_query_or_task() -> None:
    tool = DocumentSearchTool(docs_service=cast(Any, SimpleNamespace()))
    result = _run(tool, {}, _ctx(uuid.uuid4()))
    assert result.ok is False
    assert result.error == "invalid_args"


# --------------------------------------------------------------------------- #
# board retrieval (Phase 7 DoD: "which board has highest workload")           #
# --------------------------------------------------------------------------- #
def test_board_list_includes_task_count_workload() -> None:
    ws_id = uuid.uuid4()
    b1 = SimpleNamespace(id=uuid.uuid4(), title="Web", project_id=uuid.uuid4())
    b2 = SimpleNamespace(id=uuid.uuid4(), title="Mobile", project_id=uuid.uuid4())
    boards_svc = SimpleNamespace(list_boards=lambda s, org_id, user: [b1, b2])
    counts = {b1.id: [object(), object(), object()], b2.id: [object()]}
    tasks_repo = SimpleNamespace(list_by_board=lambda s, board_id: counts[board_id])
    tool = BoardListTool(
        boards_service=cast(Any, boards_svc), tasks_repo=cast(Any, tasks_repo)
    )

    result = _run(tool, {}, _ctx(ws_id))

    assert result.ok is True
    assert result.source == "board"
    by_title = {b["title"]: b["task_count"] for b in result.content}
    assert by_title == {"Web": 3, "Mobile": 1}
