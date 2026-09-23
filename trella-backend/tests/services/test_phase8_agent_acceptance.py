"""DB-backed acceptance test for the Phase 8 AI Agent (Propose→Approve→Execute).

This exercises the REAL stack end-to-end at the backend layer — no fakes/mocks
for the write path:

* real business services (``TasksService`` / ``SprintsService``) behind the
  real ``WriteTool`` ``apply()`` implementations,
* the real ``ExecutionEngine`` gating on approval + re-checking RBAC,
* the real ``AiActionAuditRepository`` writing audit rows,
* the real ``session`` fixture (in-memory SQLite with the full
  ``SQLModel.metadata`` schema) from ``tests/services/conftest.py``.

The one place a scripted fake is used is the *provider* (the LLM) in the
human-in-the-loop test — mirroring ``tests/ai/test_reasoning_engine.py`` — so we
can prove the Reasoning Engine only PROPOSES and never writes.

Async ``execute``/``run`` are driven with stdlib ``asyncio.run`` (no async
pytest plugin). ponytail: proposals are built directly with the same normalized
args a tool's ``run()`` would produce; the codepath under test is the *execute*
side, so re-deriving them through the reasoning loop each time would add nothing.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from sqlmodel import Session, select

from app.ai.agent.action_plan import ActionPlan, ActionPlanStore, ActionProposal
from app.ai.agent.execution_engine import ExecutionEngine
from app.ai.providers.base import (
    AIProvider,
    GenerationResult,
    ProviderMessage,
    StreamEvent,
    TextChunk,
    ToolCallRequest,
)
from app.ai.reasoning.engine import (
    ActionProposalEvent,
    PlanReadyEvent,
    ReasoningEngine,
)
from app.ai.tools.base import ToolContext
from app.ai.tools.data_access.write_tools import CreateTaskTool, all_write_tools
from app.ai.tools.executor import ToolExecutor
from app.ai.tools.registry import ToolRegistry
from app.models.ai_action_audit_model import AiActionAudit
from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.custom_statuses_model import CustomStatus
from app.models.enums import (
    MemberStatus,
    ProjectRole,
    SprintStatus,
    WorkspaceMode,
    WorkspaceRole,
)
from app.models.project_members_model import ProjectMember
from app.models.projects_model import Project
from app.models.sprints_model import Sprint
from app.models.tasks_model import Task
from app.models.users_model import User
from app.models.workspace_members_model import WorkspaceMember
from app.models.workspaces_model import Workspace


# --------------------------------------------------------------------------- #
# Seed helper: build + commit a real domain graph in the fixture session.     #
# --------------------------------------------------------------------------- #
@dataclass
class Seed:
    admin: User
    member: User
    viewer: User
    workspace: Workspace
    project: Project
    board: Board
    todo_col: BoardColumn
    inprog_col: BoardColumn
    todo_status: CustomStatus
    inprog_status: CustomStatus
    sprint: Sprint
    task: Task


def _seed(session: Session) -> Seed:
    """Insert and commit a full workspace→project→board→task graph."""
    admin = User(
        email="admin@example.com",
        full_name="Admin",
        hashed_password="x",
        is_active=True,
        status="ACTIVE",
    )
    member = User(
        email="member@example.com",
        full_name="Member",
        hashed_password="x",
        is_active=True,
        status="ACTIVE",
    )
    viewer = User(
        email="viewer@example.com",
        full_name="Viewer",
        hashed_password="x",
        is_active=True,
        status="ACTIVE",
    )
    session.add_all([admin, member, viewer])
    session.commit()

    workspace = Workspace(name="Acme", mode=WorkspaceMode.KANBAN.value)
    session.add(workspace)
    session.commit()

    session.add_all(
        [
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=admin.id,
                role=WorkspaceRole.OWNER.value,
                status=MemberStatus.ACTIVE.value,
            ),
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=member.id,
                role=WorkspaceRole.MEMBER.value,
                status=MemberStatus.ACTIVE.value,
            ),
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=viewer.id,
                role=WorkspaceRole.VIEWER.value,
                status=MemberStatus.ACTIVE.value,
            ),
        ]
    )
    session.commit()

    project = Project(
        workspace_id=workspace.id,
        name="Acme Project",
        key="ACME",
        description="desc",
        created_by=admin.id,
        task_counter=0,
    )
    session.add(project)
    session.commit()

    session.add_all(
        [
            ProjectMember(
                project_id=project.id,
                user_id=admin.id,
                project_role=ProjectRole.PROJECT_ADMIN.value,
                status=MemberStatus.ACTIVE.value,
            ),
            ProjectMember(
                project_id=project.id,
                user_id=member.id,
                project_role=ProjectRole.PROJECT_MEMBER.value,
                status=MemberStatus.ACTIVE.value,
            ),
            ProjectMember(
                project_id=project.id,
                user_id=viewer.id,
                project_role=ProjectRole.PROJECT_VIEWER.value,
                status=MemberStatus.ACTIVE.value,
            ),
        ]
    )
    session.commit()

    board = Board(project_id=project.id, title="Main Board")
    session.add(board)
    session.commit()

    todo_col = BoardColumn(
        board_id=board.id, name="To Do", status_key="TODO", position=0
    )
    inprog_col = BoardColumn(
        board_id=board.id, name="In Progress", status_key="IN_PROGRESS", position=1
    )
    todo_status = CustomStatus(
        workspace_id=workspace.id, name="To Do", canonical_status="TODO"
    )
    inprog_status = CustomStatus(
        workspace_id=workspace.id, name="In Progress", canonical_status="IN_PROGRESS"
    )
    session.add_all([todo_col, inprog_col, todo_status, inprog_status])
    session.commit()

    sprint = Sprint(
        project_id=project.id, name="Sprint 1", status=SprintStatus.ACTIVE.value
    )
    session.add(sprint)
    session.commit()

    # Seed task lives in "To Do" (before_insert auto-resolves its custom status).
    task = Task(
        project_id=project.id,
        board_id=board.id,
        column_id=todo_col.id,
        title="Seed task",
        priority="MEDIUM",
        position=0,
        type="TASK",
    )
    session.add(task)
    session.commit()
    session.refresh(task)

    return Seed(
        admin=admin,
        member=member,
        viewer=viewer,
        workspace=workspace,
        project=project,
        board=board,
        todo_col=todo_col,
        inprog_col=inprog_col,
        todo_status=todo_status,
        inprog_status=inprog_status,
        sprint=sprint,
        task=task,
    )


# --------------------------------------------------------------------------- #
# Small builders for the real ExecutionEngine flow.                           #
# --------------------------------------------------------------------------- #
def _engine() -> ExecutionEngine:
    """A fresh ExecutionEngine over a fresh registry of the REAL write tools."""
    registry = ToolRegistry()
    for tool in all_write_tools():
        registry.register(tool)
    return ExecutionEngine(registry=registry)


def _proposal(
    tool_name: str, args: dict[str, Any], preview: str = ""
) -> ActionProposal:
    """Build a proposal exactly as the reasoning loop would park it."""
    return ActionProposal(
        action_id=uuid.uuid4().hex,
        tool_name=tool_name,
        args=args,
        preview=preview or f"{tool_name} action",
        capabilities=frozenset({"write"}),
        scope={},
    )


def _plan(*proposals: ActionProposal) -> ActionPlan:
    return ActionPlan(plan_id=uuid.uuid4().hex, proposals=list(proposals))


def _ctx(session: Session, user: User, workspace_id: uuid.UUID) -> ToolContext:
    return ToolContext(session=session, user=user, workspace_id=workspace_id)


def _run(engine: ExecutionEngine, plan: ActionPlan, ctx: ToolContext):
    return asyncio.run(engine.execute(plan, ctx, approve_all=True))


def _audit_rows(session: Session, tool_name: str) -> list[AiActionAudit]:
    return list(
        session.exec(
            select(AiActionAudit).where(AiActionAudit.tool_name == tool_name)
        ).all()
    )


# --------------------------------------------------------------------------- #
# 1. create_task executes → a real row lands in the DB + an audit row.        #
# --------------------------------------------------------------------------- #
def test_create_task_executes_and_writes_db_and_audit(session: Session) -> None:
    s = _seed(session)
    engine = _engine()
    ctx = _ctx(session, s.admin, s.workspace.id)

    plan = _plan(
        _proposal(
            "create_task",
            {
                "board_id": str(s.board.id),
                "column_id": str(s.todo_col.id),
                "title": "Fix login bug",
            },
        )
    )
    results = _run(engine, plan, ctx)

    assert [r.status for r in results] == ["executed"]

    created = session.exec(select(Task).where(Task.title == "Fix login bug")).first()
    assert created is not None
    assert created.project_id == s.project.id

    audits = _audit_rows(session, "create_task")
    assert len(audits) == 1
    assert audits[0].user_id == s.admin.id
    assert audits[0].workspace_id == s.workspace.id
    assert audits[0].status == "executed"


# --------------------------------------------------------------------------- #
# 2. Human-in-the-loop: nothing writes before approval/execution.             #
# --------------------------------------------------------------------------- #
def test_no_write_before_execute_then_write_on_execute(session: Session) -> None:
    s = _seed(session)
    engine = _engine()
    ctx = _ctx(session, s.admin, s.workspace.id)

    title = "HITL task"
    plan = _plan(
        _proposal(
            "create_task",
            {
                "board_id": str(s.board.id),
                "column_id": str(s.todo_col.id),
                "title": title,
            },
        )
    )

    # The plan exists but has NOT been executed: no row must exist yet.
    assert session.exec(select(Task).where(Task.title == title)).first() is None

    results = _run(engine, plan, ctx)
    assert [r.status for r in results] == ["executed"]
    assert session.exec(select(Task).where(Task.title == title)).first() is not None


class _FakeProvider(AIProvider):
    """Scripted provider: yields one turn script per ``stream_tools`` call."""

    name = "fake"

    def __init__(self, turns: list[list[StreamEvent]]) -> None:
        self._turns = turns
        self.calls = 0

    async def generate(self, **kwargs: Any) -> GenerationResult:  # pragma: no cover
        return GenerationResult(content="", model="fake", provider="fake")

    async def health_check(self) -> bool:  # pragma: no cover
        return True

    async def stream_tools(
        self, *, messages: Any, tools: Any, **kwargs: Any
    ) -> AsyncIterator[StreamEvent]:
        turn = self._turns[self.calls] if self.calls < len(self._turns) else []
        self.calls += 1
        for ev in turn:
            yield ev


def test_reasoning_only_proposes_never_writes(session: Session) -> None:
    """Drive the REAL ReasoningEngine + REAL write tool: it PROPOSES, never applies."""
    s = _seed(session)

    registry = ToolRegistry()
    registry.register(CreateTaskTool())
    engine = ReasoningEngine(
        _FakeProvider(
            turns=[
                [
                    ToolCallRequest(
                        id="c1",
                        name="create_task",
                        arguments={
                            "board_id": str(s.board.id),
                            "column_id": str(s.todo_col.id),
                            "title": "Reasoning proposed task",
                        },
                    )
                ],
                [TextChunk("I proposed a task for you.")],
            ]
        ),
        registry=registry,
        executor=ToolExecutor(registry),
        plan_store=ActionPlanStore(),
    )

    async def _drive() -> list[Any]:
        return [
            ev
            async for ev in engine.run(
                system_message="be helpful",
                messages=[ProviderMessage("user", "make a task")],
                tool_ctx=_ctx(session, s.admin, s.workspace.id),
                conversation_id="conv-1",
            )
        ]

    events = _drive_sync(_drive)

    assert any(isinstance(e, ActionProposalEvent) for e in events)
    assert any(isinstance(e, PlanReadyEvent) for e in events)
    # The write tool's apply() never ran during reasoning: no DB row created.
    assert (
        session.exec(
            select(Task).where(Task.title == "Reasoning proposed task")
        ).first()
        is None
    )


def _drive_sync(coro_fn):
    return asyncio.run(coro_fn())


# --------------------------------------------------------------------------- #
# 3. assign_task executes → assignee persisted + audit.                       #
# --------------------------------------------------------------------------- #
def test_assign_task_executes(session: Session) -> None:
    s = _seed(session)
    engine = _engine()
    ctx = _ctx(session, s.admin, s.workspace.id)

    plan = _plan(
        _proposal(
            "assign_task",
            {"task_id": str(s.task.id), "assignee_id": str(s.member.id)},
        )
    )
    results = _run(engine, plan, ctx)

    assert [r.status for r in results] == ["executed"]
    session.expire_all()
    assert session.get(Task, s.task.id).assignee_id == s.member.id
    assert _audit_rows(session, "assign_task")[0].status == "executed"


# --------------------------------------------------------------------------- #
# 4. move_task executes → task lands in "In Progress" (column + status).      #
# --------------------------------------------------------------------------- #
def test_move_task_executes(session: Session) -> None:
    s = _seed(session)
    engine = _engine()
    ctx = _ctx(session, s.admin, s.workspace.id)

    plan = _plan(
        _proposal(
            "move_task",
            {"task_id": str(s.task.id), "custom_status_id": str(s.inprog_status.id)},
        )
    )
    results = _run(engine, plan, ctx)

    assert [r.status for r in results] == ["executed"]
    session.expire_all()
    moved = session.get(Task, s.task.id)
    assert moved.custom_status_id == s.inprog_status.id
    assert moved.column_id == s.inprog_col.id
    assert _audit_rows(session, "move_task")[0].status == "executed"


# --------------------------------------------------------------------------- #
# 5. close_sprint executes → sprint COMPLETED + audit.                        #
# --------------------------------------------------------------------------- #
def test_close_sprint_executes(session: Session) -> None:
    s = _seed(session)
    engine = _engine()
    ctx = _ctx(session, s.admin, s.workspace.id)

    plan = _plan(_proposal("close_sprint", {"sprint_id": str(s.sprint.id)}))
    results = _run(engine, plan, ctx)

    assert [r.status for r in results] == ["executed"]
    session.expire_all()
    assert session.get(Sprint, s.sprint.id).status == SprintStatus.COMPLETED.value
    assert _audit_rows(session, "close_sprint")[0].status == "executed"


# --------------------------------------------------------------------------- #
# 6. Permission denied (viewer): update rejected, DB unchanged, audit=denied. #
# --------------------------------------------------------------------------- #
def test_update_task_denied_for_viewer(session: Session) -> None:
    s = _seed(session)
    engine = _engine()
    ctx = _ctx(session, s.viewer, s.workspace.id)

    original_title = session.get(Task, s.task.id).title
    plan = _plan(
        _proposal("update_task", {"task_id": str(s.task.id), "title": "hacked"})
    )
    results = _run(engine, plan, ctx)

    assert [r.status for r in results] == ["denied"]
    session.expire_all()
    assert session.get(Task, s.task.id).title == original_title
    assert _audit_rows(session, "update_task")[0].status == "denied"


# --------------------------------------------------------------------------- #
# 7. Permission denied (member on sprint): needs PROJECT_ADMIN.               #
# --------------------------------------------------------------------------- #
def test_close_sprint_denied_for_member(session: Session) -> None:
    s = _seed(session)
    engine = _engine()
    ctx = _ctx(session, s.member, s.workspace.id)

    plan = _plan(_proposal("close_sprint", {"sprint_id": str(s.sprint.id)}))
    results = _run(engine, plan, ctx)

    assert [r.status for r in results] == ["denied"]
    session.expire_all()
    assert session.get(Sprint, s.sprint.id).status == SprintStatus.ACTIVE.value
    assert _audit_rows(session, "close_sprint")[0].status == "denied"


# --------------------------------------------------------------------------- #
# 8. Failure isolation: a failing action never aborts the others.            #
# --------------------------------------------------------------------------- #
def test_failure_isolation_does_not_abort_siblings(session: Session) -> None:
    s = _seed(session)
    engine = _engine()
    ctx = _ctx(session, s.admin, s.workspace.id)

    missing_task_id = uuid.uuid4().hex
    plan = _plan(
        _proposal("update_task", {"task_id": missing_task_id, "title": "no-op"}),
        _proposal(
            "assign_task",
            {"task_id": str(s.task.id), "assignee_id": str(s.member.id)},
        ),
    )
    results = _run(engine, plan, ctx)

    assert results[0].status == "failed"
    assert results[1].status == "executed"

    session.expire_all()
    # The failure of #1 did NOT prevent the real assignment in #2.
    assert session.get(Task, s.task.id).assignee_id == s.member.id

    statuses = sorted(a.status for a in _audit_rows(session, "update_task"))
    statuses += [a.status for a in _audit_rows(session, "assign_task")]
    assert "failed" in statuses
    assert "executed" in statuses
