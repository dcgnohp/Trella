"""Unit tests for the PM analytics tools (Phase 10.2).

These call ``tool.run(args, ctx)`` directly (no executor) against a real
in-memory SQLite ``session`` fixture, reusing the ``_Env`` seeding helper from
the service test. Deterministic, AI-free, no network.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterator
from typing import Any, cast

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app.ai.tools.base import ToolContext, ToolResult
from app.ai.tools.data_access.pm_tools import (
    RiskAnalysisTool,
    SprintAnalysisTool,
    WorkloadAnalysisTool,
    all_pm_tools,
)
from app.models import SQLModel  # imports every domain model -> full metadata
from app.models.enums import CanonicalStatus
from tests.services.test_project_analytics_service import _Env


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
    # Enable foreign keys for SQLite so FK-backed seeding behaves like Postgres.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture
def session() -> Iterator[Session]:
    """Real ``Session`` on a fresh in-memory SQLite DB (mirrors services conftest)."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        yield db
    SQLModel.metadata.drop_all(engine)


def _run(tool: Any, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    return cast(ToolResult, asyncio.run(tool.run(args, ctx)))


def _ctx(env: _Env) -> ToolContext:
    return ToolContext(session=env.session, user=env.user)


# --------------------------------------------------------------------------- #
# specs                                                                       #
# --------------------------------------------------------------------------- #
def test_specs_are_read_only_analytics() -> None:
    """Frozen names, analytics category/capabilities, non-mutating."""
    expected = {
        SprintAnalysisTool: ("analyze_sprint", "analytics.sprint"),
        WorkloadAnalysisTool: ("analyze_workload", "analytics.workload"),
        RiskAnalysisTool: ("analyze_risk", "analytics.risk"),
    }
    for cls, (name, capability) in expected.items():
        spec = cls().spec
        assert spec.name == name
        assert spec.capability == capability
        assert spec.category == "analytics"
        assert spec.capabilities == frozenset({"read", "analytics"})
        assert spec.mutating is False

    tools = all_pm_tools()
    assert [t.spec.name for t in tools] == [
        "analyze_sprint",
        "analyze_workload",
        "analyze_risk",
    ]


# --------------------------------------------------------------------------- #
# analyze_sprint                                                              #
# --------------------------------------------------------------------------- #
def test_analyze_sprint_happy_path(session: Session) -> None:
    env = _Env(session)
    sprint = env.add_sprint()
    env.add_task(canonical=CanonicalStatus.DONE.value, sprint_id=sprint.id)

    result = _run(SprintAnalysisTool(), {"sprint_id": str(sprint.id)}, _ctx(env))

    assert result.ok is True
    assert result.source == "analytics"
    assert "health" in result.content


def test_analyze_sprint_malformed_id(session: Session) -> None:
    env = _Env(session)
    result = _run(SprintAnalysisTool(), {"sprint_id": "not-a-uuid"}, _ctx(env))
    assert result.ok is False
    assert result.error == "invalid_args"


# --------------------------------------------------------------------------- #
# analyze_workload                                                            #
# --------------------------------------------------------------------------- #
def test_analyze_workload_project_scope(session: Session) -> None:
    env = _Env(session)
    env.add_task(canonical=CanonicalStatus.TODO.value, assignee_id=env.add_user())

    result = _run(
        WorkloadAnalysisTool(), {"project_id": str(env.project.id)}, _ctx(env)
    )

    assert result.ok is True
    assert result.source == "analytics"
    assert result.content["scope"]["type"] == "project"


def test_analyze_workload_neither_arg_is_invalid(session: Session) -> None:
    env = _Env(session)
    result = _run(WorkloadAnalysisTool(), {}, _ctx(env))
    assert result.ok is False
    assert result.error == "invalid_args"


def test_analyze_workload_malformed_id(session: Session) -> None:
    env = _Env(session)
    result = _run(WorkloadAnalysisTool(), {"project_id": "nope"}, _ctx(env))
    assert result.ok is False
    assert result.error == "invalid_args"


# --------------------------------------------------------------------------- #
# analyze_risk                                                                #
# --------------------------------------------------------------------------- #
def test_analyze_risk_project_scope(session: Session) -> None:
    env = _Env(session)
    env.add_task(canonical=CanonicalStatus.PENDING.value)

    result = _run(RiskAnalysisTool(), {"project_id": str(env.project.id)}, _ctx(env))

    assert result.ok is True
    assert result.source == "analytics"
    assert result.content["counts"]["blocked"] == 1


def test_analyze_risk_neither_arg_is_invalid(session: Session) -> None:
    env = _Env(session)
    result = _run(RiskAnalysisTool(), {}, _ctx(env))
    assert result.ok is False
    assert result.error == "invalid_args"


def test_analyze_risk_malformed_sprint_id(session: Session) -> None:
    env = _Env(session)
    result = _run(RiskAnalysisTool(), {"sprint_id": str(uuid.uuid4()) + "x"}, _ctx(env))
    assert result.ok is False
    assert result.error == "invalid_args"
