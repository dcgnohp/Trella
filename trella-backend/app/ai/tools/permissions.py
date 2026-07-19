"""Permission layer for AI tools.

Tools are the sanctioned boundary that may import business modules
(see ``.ai/AI_INTEGRATION_RULES.md``). This layer REUSES the existing
authorization primitives — it does not reimplement them:

* :class:`app.core.rbac.RBACService` — project-scoped RBAC checks.
* :class:`app.services.organization_members_service.OrganizationMemberService`
  — workspace (organization) membership checks.
* :func:`app.core.deps.resolve_scope` — walks task→board→project→workspace.

Its only added value is converting the HTTP-shaped failures those helpers
raise (``HTTPException`` 403/404) into a tool-friendly :class:`PermissionDenied`
carrying a stable machine ``code`` (``"not_authorized"`` | ``"not_found"``).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.deps import resolve_scope
from app.core.rbac import Action, RBACService
from app.models.users_model import User
from app.services.organization_members_service import OrganizationMemberService

__all__ = ["PermissionDenied", "PermissionLayer"]


class PermissionDenied(Exception):
    """Raised when a user lacks access.

    Carries a stable machine ``code`` so callers can branch without parsing
    prose: ``"not_authorized"`` (forbidden) or ``"not_found"`` (missing link).
    """

    def __init__(
        self, code: str = "not_authorized", message: str = "Access denied"
    ) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _denied_from_http(err: HTTPException) -> PermissionDenied:
    """Translate an ``HTTPException`` into a :class:`PermissionDenied`.

    403 → ``not_authorized``, 404 → ``not_found``. Any other status is not an
    authorization outcome, so it is re-raised unchanged.
    """
    if err.status_code == status.HTTP_403_FORBIDDEN:
        return PermissionDenied("not_authorized", str(err.detail))
    if err.status_code == status.HTTP_404_NOT_FOUND:
        return PermissionDenied("not_found", str(err.detail))
    raise err


class PermissionLayer:
    """Thin wrapper over existing RBAC + membership. Injectable for tests."""

    def __init__(
        self,
        rbac: RBACService | None = None,
        org_members: OrganizationMemberService | None = None,
    ) -> None:
        self.rbac = rbac or RBACService()
        self.org_members = org_members or OrganizationMemberService()

    def check_workspace(self, session: Session, user: User, workspace_id: UUID) -> None:
        """Raise :class:`PermissionDenied` unless ``user`` is a workspace member."""
        try:
            self.org_members.assert_member(session, workspace_id, user.id)
        except HTTPException as err:
            raise _denied_from_http(err) from err

    def check_project(self, session: Session, user: User, project_id: UUID) -> None:
        """Raise :class:`PermissionDenied` unless ``user`` can view the project."""
        try:
            self.rbac.check(
                session,
                Action.VIEW_PROJECT_RESOURCE,
                user=user,
                project_id=project_id,
            )
        except HTTPException as err:
            raise _denied_from_http(err) from err

    def check_resource(self, session: Session, user: User, resource: Any) -> None:
        """Resolve ``resource`` to its scope and check access at that scope.

        Prefers the project scope (finer-grained) and falls back to the
        workspace scope. A missing link during resolution surfaces as
        ``PermissionDenied("not_found")``.
        """
        try:
            scope = resolve_scope(session, resource)
        except HTTPException as err:
            raise _denied_from_http(err) from err

        if scope.project_id is not None:
            self.check_project(session, user, scope.project_id)
        elif scope.workspace_id is not None:
            self.check_workspace(session, user, scope.workspace_id)
        else:
            raise PermissionDenied("not_found", "Resource is not in any scope")
