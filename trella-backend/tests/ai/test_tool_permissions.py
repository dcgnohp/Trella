"""Tests for the AI tools permission layer.

No DB is touched: fake ``RBACService`` / ``OrganizationMemberService`` either
pass or raise ``HTTPException`` 403/404, and a stub object stands in for the
``Session`` since the fakes ignore it.
"""

from __future__ import annotations

import uuid
from typing import Any, cast

import pytest
from fastapi import HTTPException, status
from sqlmodel import Session

from app.ai.tools.permissions import PermissionDenied, PermissionLayer
from app.core.rbac import Action, RBACService
from app.models.users_model import User
from app.services.organization_members_service import OrganizationMemberService


class _FakeOrgMembers(OrganizationMemberService):
    def __init__(self, *, allow: bool) -> None:
        self._allow = allow

    def assert_member(self, session: Any, org_id: uuid.UUID, user_id: uuid.UUID) -> Any:
        if self._allow:
            return object()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member"
        )


class _FakeRBAC(RBACService):
    def __init__(self, *, allow: bool) -> None:
        self._allow = allow

    def check(self, session: Any, action: Action, **kwargs: Any) -> None:
        if self._allow:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied"
        )


def _user() -> User:
    return cast(User, type("U", (), {"id": uuid.uuid4()})())


def _session() -> Session:
    return cast(Session, object())


class _Resource:
    """Minimal resource carrying whatever scope attributes are set."""

    def __init__(self, **attrs: Any) -> None:
        self.__dict__.update(attrs)


def test_check_workspace_member_passes() -> None:
    layer = PermissionLayer(org_members=_FakeOrgMembers(allow=True))
    # Should not raise.
    layer.check_workspace(_session(), _user(), uuid.uuid4())


def test_check_workspace_non_member_denied() -> None:
    layer = PermissionLayer(org_members=_FakeOrgMembers(allow=False))
    with pytest.raises(PermissionDenied) as exc:
        layer.check_workspace(_session(), _user(), uuid.uuid4())
    assert exc.value.code == "not_authorized"


def test_check_project_viewer_passes() -> None:
    layer = PermissionLayer(rbac=_FakeRBAC(allow=True))
    layer.check_project(_session(), _user(), uuid.uuid4())


def test_check_project_denied() -> None:
    layer = PermissionLayer(rbac=_FakeRBAC(allow=False))
    with pytest.raises(PermissionDenied) as exc:
        layer.check_project(_session(), _user(), uuid.uuid4())
    assert exc.value.code == "not_authorized"


def test_check_resource_routes_to_project() -> None:
    # A resource that already exposes project_id resolves without DB access,
    # so resolve_scope only reads attributes and the fake RBAC decides.
    project_id = uuid.uuid4()
    resource = _Resource(project_id=project_id, workspace_id=uuid.uuid4())

    denied = PermissionLayer(rbac=_FakeRBAC(allow=False))
    with pytest.raises(PermissionDenied) as exc:
        denied.check_resource(_session(), _user(), resource)
    assert exc.value.code == "not_authorized"

    allowed = PermissionLayer(rbac=_FakeRBAC(allow=True))
    allowed.check_resource(_session(), _user(), resource)  # no raise


def test_check_resource_routes_to_workspace() -> None:
    resource = _Resource(workspace_id=uuid.uuid4())
    layer = PermissionLayer(org_members=_FakeOrgMembers(allow=False))
    with pytest.raises(PermissionDenied) as exc:
        layer.check_resource(_session(), _user(), resource)
    assert exc.value.code == "not_authorized"


def test_check_resource_not_found() -> None:
    # A dangling task_id link makes resolve_scope raise HTTPException(404);
    # a stub session whose .get() returns None simulates the missing row.
    class _NullSession:
        def get(self, *_args: Any, **_kwargs: Any) -> None:
            return None

    resource = _Resource(task_id=uuid.uuid4())
    layer = PermissionLayer()
    with pytest.raises(PermissionDenied) as exc:
        layer.check_resource(cast(Session, _NullSession()), _user(), resource)
    assert exc.value.code == "not_found"
