"""Unit tests for ``ProjectAnalyticsService`` (Phase 10.2).

These exercise the deterministic, AI-free analytics against a real in-memory
SQLite session (shared ``session`` fixture). No AI, no network, no mocks: the
service composes the real permission-checked ``SprintsService`` / ``TasksService``
and resolves canonical statuses from actual ``CustomStatus`` rows.

Seeding mirrors the pattern in ``test_epics_service.py`` (org OWNER + project
member so ``VIEW_PROJECT_RESOURCE`` passes), plus custom statuses and sprints so
the canonical DONE/PENDING mapping and burndown-vs-time math are real.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session

from app.models.board_columns_model import BoardColumn
from app.models.boards_model import Board
from app.models.custom_statuses_model import CustomStatus
from app.models.enums import (
    CanonicalStatus,
    MemberStatus,
    ProjectRole,
    SprintStatus,
)
from app.models.organization_members_model import OrganizationMember
from app.models.organizations_model import Organization
from app.models.project_members_model import ProjectMember
from app.models.projects_model import Project
from app.models.sprints_model import Sprint
from app.models.tasks_model import Task
from app.models.users_model import User
from app.services.project_analytics_service import (
    OVERLOADED_TASK_COUNT,
    ProjectAnalyticsService,
)


class _Env:
    """A seeded workspace/project/board with canonical statuses and a column."""

    def __init__(self, session: Session) -> None:
        self.session = session

        self.user = User(
            email=f"{uuid.uuid4().hex}@example.com",
            full_name="PM User",
            hashed_password="x",
        )
        session.add(self.user)
        session.commit()
        session.refresh(self.user)

        self.org = Organization(name="Acme")
        session.add(self.org)
        session.commit()
        session.refresh(self.org)
        session.add(
            OrganizationMember(
                workspace_id=self.org.id,
                user_id=self.user.id,
                role="OWNER",
                status="ACTIVE",
            )
        )
        session.commit()

        self.project = Project(
            workspace_id=self.org.id,
            name="Web",
            key=f"P{uuid.uuid4().hex[:6].upper()}",
            created_by=self.user.id,
        )
        session.add(self.project)
        session.commit()
        session.refresh(self.project)
        session.add(
            ProjectMember(
                project_id=self.project.id,
                user_id=self.user.id,
                project_role=ProjectRole.PROJECT_MEMBER.value,
                status=MemberStatus.ACTIVE.value,
            )
        )
        session.commit()

        self.board = Board(project_id=self.project.id, title="Board")
        session.add(self.board)
        session.commit()
        session.refresh(self.board)
        # A neutral column that will NOT auto-map to any custom status name, so
        # tasks keep the custom_status_id we set explicitly.
        self.column = BoardColumn(
            board_id=self.board.id, name="Col", position=0, status_key="NONE"
        )
        session.add(self.column)
        session.commit()
        session.refresh(self.column)

        # One custom status per canonical value we care about.
        self.status_ids: dict[str, uuid.UUID] = {}
        for canonical in (
            CanonicalStatus.TODO,
            CanonicalStatus.IN_PROGRESS,
            CanonicalStatus.PENDING,
            CanonicalStatus.DONE,
        ):
            cs = CustomStatus(
                workspace_id=self.org.id,
                name=canonical.value.title(),
                canonical_status=canonical.value,
            )
            session.add(cs)
            session.commit()
            session.refresh(cs)
            self.status_ids[canonical.value] = cs.id

    def add_user(self) -> uuid.UUID:
        """Create and return a real user id (assignee FK references users.id)."""
        member = User(
            email=f"{uuid.uuid4().hex}@example.com",
            full_name="Member",
            hashed_password="x",
        )
        self.session.add(member)
        self.session.commit()
        self.session.refresh(member)
        return member.id

    def add_sprint(
        self,
        *,
        status: str = SprintStatus.PLANNED.value,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> Sprint:
        sprint = Sprint(
            project_id=self.project.id,
            name="Sprint 1",
            status=status,
            start_date=start_date,
            end_date=end_date,
        )
        self.session.add(sprint)
        self.session.commit()
        self.session.refresh(sprint)
        return sprint

    def add_task(
        self,
        *,
        canonical: str | None = None,
        assignee_id: uuid.UUID | None = None,
        sprint_id: uuid.UUID | None = None,
        story_point: int | None = None,
        due_date: datetime | None = None,
    ) -> Task:
        custom_status_id = self.status_ids[canonical] if canonical is not None else None
        task = Task(
            project_id=self.project.id,
            board_id=self.board.id,
            column_id=self.column.id,
            title="A task",
            issue_key=f"T-{uuid.uuid4().hex[:4]}",
            position=0,
            custom_status_id=custom_status_id,
            assignee_id=assignee_id,
            sprint_id=sprint_id,
            story_point=story_point,
            due_date=due_date,
        )
        self.session.add(task)
        self.session.commit()
        self.session.refresh(task)
        return task


# --------------------------------------------------------------------------- #
# analyze_sprint                                                              #
# --------------------------------------------------------------------------- #
def test_analyze_sprint_on_track_when_ahead_of_schedule(session: Session) -> None:
    """An ACTIVE sprint half elapsed but fully done is on_track, pct = 100.0."""
    env = _Env(session)
    today = date.today()
    sprint = env.add_sprint(
        status=SprintStatus.ACTIVE.value,
        start_date=today - timedelta(days=5),
        end_date=today + timedelta(days=5),
    )
    # 2 done tasks, no points -> task-based fraction = 1.0
    env.add_task(canonical=CanonicalStatus.DONE.value, sprint_id=sprint.id)
    env.add_task(canonical=CanonicalStatus.DONE.value, sprint_id=sprint.id)

    result = ProjectAnalyticsService().analyze_sprint(session, sprint.id, env.user)

    assert result["health"] == "on_track"
    assert result["tasks"] == {
        "total": 2,
        "done": 2,
        "in_progress": 0,
        "todo": 0,
    }
    assert result["commitment"]["completion_pct"] == 100.0
    assert result["schedule"]["days_remaining"] == 5


def test_analyze_sprint_off_track_when_far_behind(session: Session) -> None:
    """ACTIVE sprint ~half elapsed with 0% done -> off_track (below at_risk ratio)."""
    env = _Env(session)
    today = date.today()
    sprint = env.add_sprint(
        status=SprintStatus.ACTIVE.value,
        start_date=today - timedelta(days=5),
        end_date=today + timedelta(days=5),
    )
    for _ in range(4):
        env.add_task(canonical=CanonicalStatus.TODO.value, sprint_id=sprint.id)

    result = ProjectAnalyticsService().analyze_sprint(session, sprint.id, env.user)

    # expected ~0.5, fraction_done 0.0 < 0.5 * 0.5 -> off_track
    assert result["health"] == "off_track"
    assert result["commitment"]["completion_pct"] == 0.0


def test_analyze_sprint_at_risk_between_ratios(session: Session) -> None:
    """fraction_done between ratio*expected and expected -> at_risk."""
    env = _Env(session)
    today = date.today()
    sprint = env.add_sprint(
        status=SprintStatus.ACTIVE.value,
        start_date=today - timedelta(days=5),
        end_date=today + timedelta(days=5),
    )
    # 1 of 3 done -> ~0.33; expected ~0.5; 0.25 <= 0.33 < 0.5 -> at_risk
    env.add_task(canonical=CanonicalStatus.DONE.value, sprint_id=sprint.id)
    env.add_task(canonical=CanonicalStatus.TODO.value, sprint_id=sprint.id)
    env.add_task(canonical=CanonicalStatus.IN_PROGRESS.value, sprint_id=sprint.id)

    result = ProjectAnalyticsService().analyze_sprint(session, sprint.id, env.user)

    assert result["health"] == "at_risk"
    assert result["tasks"]["in_progress"] == 1
    assert result["commitment"]["completion_pct"] == round(1 / 3 * 100, 1)


def test_analyze_sprint_points_based_completion(session: Session) -> None:
    """When points exist, completion uses points not task counts."""
    env = _Env(session)
    sprint = env.add_sprint()  # PLANNED -> expected is None
    env.add_task(
        canonical=CanonicalStatus.DONE.value, sprint_id=sprint.id, story_point=3
    )
    env.add_task(
        canonical=CanonicalStatus.TODO.value, sprint_id=sprint.id, story_point=1
    )

    result = ProjectAnalyticsService().analyze_sprint(session, sprint.id, env.user)

    assert result["commitment"]["total_points"] == 4
    assert result["commitment"]["completed_points"] == 3
    assert result["commitment"]["completion_pct"] == 75.0
    # expected None + fraction < 1.0 -> at_risk
    assert result["health"] == "at_risk"


def test_analyze_sprint_empty_is_on_track(session: Session) -> None:
    """A sprint with no tasks and no points is trivially on_track."""
    env = _Env(session)
    sprint = env.add_sprint()

    result = ProjectAnalyticsService().analyze_sprint(session, sprint.id, env.user)

    assert result["health"] == "on_track"
    assert result["tasks"]["total"] == 0
    assert result["commitment"]["completion_pct"] == 100.0
    assert result["schedule"]["days_remaining"] is None


# --------------------------------------------------------------------------- #
# analyze_workload                                                           #
# --------------------------------------------------------------------------- #
def test_analyze_workload_overloaded_unassigned_and_idle(session: Session) -> None:
    """Overloaded flag, unassigned_open bucket, and idle detection."""
    env = _Env(session)
    heavy = env.add_user()
    idle_user = env.add_user()

    # heavy: more open tasks than the threshold -> overloaded
    for _ in range(OVERLOADED_TASK_COUNT + 1):
        env.add_task(
            canonical=CanonicalStatus.TODO.value,
            assignee_id=heavy,
            story_point=2,
        )
    # idle_user: has a task but it's DONE -> zero open -> idle
    env.add_task(canonical=CanonicalStatus.DONE.value, assignee_id=idle_user)
    # two unassigned open tasks
    env.add_task(canonical=CanonicalStatus.TODO.value)
    env.add_task(canonical=CanonicalStatus.IN_PROGRESS.value)

    result = ProjectAnalyticsService().analyze_workload(
        session, env.user, project_id=env.project.id
    )

    assert result["scope"] == {"type": "project", "id": str(env.project.id)}
    assert result["unassigned_open"] == 2
    assert result["idle"] == [str(idle_user)]

    assert len(result["assignees"]) == 1
    heavy_row = result["assignees"][0]
    assert heavy_row["assignee_id"] == str(heavy)
    assert heavy_row["open_tasks"] == OVERLOADED_TASK_COUNT + 1
    assert heavy_row["open_points"] == (OVERLOADED_TASK_COUNT + 1) * 2
    assert heavy_row["overloaded"] is True
    # the unassigned bucket must NOT leak into the assignees list
    assert all(row["assignee_id"] is not None for row in result["assignees"])


def test_analyze_workload_not_overloaded_and_sorted(session: Session) -> None:
    """Below-threshold load is not overloaded; assignees sorted by open desc."""
    env = _Env(session)
    a = env.add_user()
    b = env.add_user()
    env.add_task(canonical=CanonicalStatus.TODO.value, assignee_id=a)
    for _ in range(3):
        env.add_task(canonical=CanonicalStatus.TODO.value, assignee_id=b)

    result = ProjectAnalyticsService().analyze_workload(
        session, env.user, project_id=env.project.id
    )

    ids = [row["assignee_id"] for row in result["assignees"]]
    assert ids == [str(b), str(a)]  # b (3) before a (1)
    assert all(row["overloaded"] is False for row in result["assignees"])


def test_analyze_workload_invalid_args(session: Session) -> None:
    """Neither or both scope args -> invalid_args (no raise)."""
    env = _Env(session)
    assert ProjectAnalyticsService().analyze_workload(session, env.user) == {
        "error": "invalid_args"
    }
    assert ProjectAnalyticsService().analyze_workload(
        session, env.user, project_id=env.project.id, sprint_id=uuid.uuid4()
    ) == {"error": "invalid_args"}


def test_analyze_workload_sprint_scope(session: Session) -> None:
    """Sprint scope only considers that sprint's tasks."""
    env = _Env(session)
    sprint = env.add_sprint()
    assignee = env.add_user()
    env.add_task(
        canonical=CanonicalStatus.TODO.value,
        assignee_id=assignee,
        sprint_id=sprint.id,
    )
    # a backlog task for the same assignee must be ignored in sprint scope
    env.add_task(canonical=CanonicalStatus.TODO.value, assignee_id=assignee)

    result = ProjectAnalyticsService().analyze_workload(
        session, env.user, sprint_id=sprint.id
    )

    assert result["scope"] == {"type": "sprint", "id": str(sprint.id)}
    assert len(result["assignees"]) == 1
    assert result["assignees"][0]["open_tasks"] == 1


# --------------------------------------------------------------------------- #
# analyze_risk                                                               #
# --------------------------------------------------------------------------- #
def test_analyze_risk_overdue_and_blocked(session: Session) -> None:
    """Overdue (past due, not done) and blocked (canonical PENDING) detection."""
    env = _Env(session)
    past = datetime.now(timezone.utc) - timedelta(days=2)
    future = datetime.now(timezone.utc) + timedelta(days=2)

    overdue_task = env.add_task(canonical=CanonicalStatus.TODO.value, due_date=past)
    # past-due but DONE -> NOT overdue
    env.add_task(canonical=CanonicalStatus.DONE.value, due_date=past)
    # future due -> not overdue
    env.add_task(canonical=CanonicalStatus.TODO.value, due_date=future)
    # blocked (PENDING)
    blocked_task = env.add_task(canonical=CanonicalStatus.PENDING.value)

    result = ProjectAnalyticsService().analyze_risk(
        session, env.user, project_id=env.project.id
    )

    overdue_ids = {row["id"] for row in result["overdue"]}
    blocked_ids = {row["id"] for row in result["blocked"]}
    assert overdue_ids == {str(overdue_task.id)}
    assert blocked_ids == {str(blocked_task.id)}
    assert result["counts"] == {"overdue": 1, "blocked": 1}
    # project scope -> no schedule pressure
    assert result["schedule_pressure"] is None


def test_analyze_risk_sprint_schedule_pressure_behind(session: Session) -> None:
    """ACTIVE sprint behind burndown -> schedule_pressure 'behind'."""
    env = _Env(session)
    today = date.today()
    sprint = env.add_sprint(
        status=SprintStatus.ACTIVE.value,
        start_date=today - timedelta(days=8),
        end_date=today + timedelta(days=2),
    )
    for _ in range(4):
        env.add_task(canonical=CanonicalStatus.TODO.value, sprint_id=sprint.id)

    result = ProjectAnalyticsService().analyze_risk(
        session, env.user, sprint_id=sprint.id
    )

    assert result["scope"]["type"] == "sprint"
    assert result["schedule_pressure"] == "behind"


def test_analyze_risk_invalid_args(session: Session) -> None:
    """Neither or both scope args -> invalid_args (no raise)."""
    env = _Env(session)
    assert ProjectAnalyticsService().analyze_risk(session, env.user) == {
        "error": "invalid_args"
    }
    assert ProjectAnalyticsService().analyze_risk(
        session, env.user, project_id=env.project.id, sprint_id=uuid.uuid4()
    ) == {"error": "invalid_args"}
