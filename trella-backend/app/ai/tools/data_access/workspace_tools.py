"""Workspace-scoped data-access tools.

Each workspace tool accepts an OPTIONAL ``workspace_id`` argument and otherwise
falls back to the current workspace in ``ctx``. This lets the model answer about
*any* workspace the user is a member of (DoD: "answer across any accessible
workspace") -- membership is still enforced by ``get_for_member`` / RBAC, so a
non-member ``workspace_id`` is denied, never leaked.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import (
    MAX_ITEMS,
    _invalid_args,
    _InvalidArgs,
    _require_uuid,
)
from app.core.rbac import RBACService
from app.repositories.projects_repository import ProjectsRepository
from app.repositories.workspace_members_repository import WorkspaceMembersRepository
from app.services.organizations_service import OrganizationsService

_NO_ARGS: dict[str, Any] = {"type": "object", "properties": {}}
_WS_ARGS: dict[str, Any] = {
    "type": "object",
    "properties": {
        "workspace_id": {
            "type": "string",
            "description": "Workspace UUID. Optional — defaults to the current workspace.",
        }
    },
}


def _resolve_workspace_id(args: dict[str, Any], ctx: ToolContext) -> UUID:
    """Workspace id from ``args`` if given, else the current-context workspace.

    Raises :class:`_InvalidArgs` when neither is available.
    """
    raw = args.get("workspace_id") if isinstance(args, dict) else None
    if raw:
        return _require_uuid(args, "workspace_id")
    if ctx.workspace_id is not None:
        return ctx.workspace_id
    raise _InvalidArgs("workspace_id")


class ListWorkspacesTool(Tool):
    """List every workspace the user belongs to (for cross-workspace questions)."""

    spec = ToolSpec(
        name="list_workspaces",
        description=(
            "List all workspaces (spaces) the user is a member of, with each "
            "workspace's id and name. Use this FIRST when the user asks about a "
            "workspace/space by name (e.g. 'space phong') to resolve its id, "
            "then pass that workspace_id to the other workspace/project tools."
        ),
        parameters=_NO_ARGS,
        category="workspace",
        capability="workspace.list",
    )

    def __init__(self, orgs_service: OrganizationsService | None = None) -> None:
        self._orgs = orgs_service or OrganizationsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        workspaces = [
            {"id": str(org.id), "name": org.name}
            for org in self._orgs.list_for_user(ctx.session, ctx.user.id)
        ][:MAX_ITEMS]
        return ToolResult(ok=True, content=workspaces, source="workspace")


class WorkspaceSummaryTool(Tool):
    """Return a workspace's identity (id, name, mode)."""

    spec = ToolSpec(
        name="get_workspace_summary",
        description=(
            "Return a summary of a workspace: id, display name, and mode "
            "(KANBAN or SCRUM). Defaults to the current workspace; pass "
            "workspace_id to target another workspace the user can access."
        ),
        parameters=_WS_ARGS,
        category="workspace",
        capability="workspace.summary",
    )

    def __init__(self, orgs_service: OrganizationsService | None = None) -> None:
        self._orgs = orgs_service or OrganizationsService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            workspace_id = _resolve_workspace_id(args, ctx)
        except _InvalidArgs:
            return _invalid_args()
        org = self._orgs.get_for_member(ctx.session, workspace_id, ctx.user.id)
        return ToolResult(
            ok=True,
            content={"id": str(org.id), "name": org.name, "mode": org.mode},
            source="workspace",
        )


class WorkspaceStatsTool(Tool):
    """Return lightweight counts for a workspace."""

    spec = ToolSpec(
        name="get_workspace_stats",
        description=(
            "Return counts for a workspace: number of projects the caller can "
            "see and number of active members. Defaults to the current "
            "workspace; pass workspace_id to target another accessible workspace."
        ),
        parameters=_WS_ARGS,
        category="workspace",
        capability="workspace.stats",
    )

    def __init__(
        self,
        orgs_service: OrganizationsService | None = None,
        projects_repo: ProjectsRepository | None = None,
        members_repo: WorkspaceMembersRepository | None = None,
        rbac: RBACService | None = None,
    ) -> None:
        self._orgs = orgs_service or OrganizationsService()
        self._projects = projects_repo or ProjectsRepository()
        self._members = members_repo or WorkspaceMembersRepository()
        self._rbac = rbac or RBACService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            workspace_id = _resolve_workspace_id(args, ctx)
        except _InvalidArgs:
            return _invalid_args()
        # Gate on membership (raises HTTPException handled by the executor).
        self._orgs.get_for_member(ctx.session, workspace_id, ctx.user.id)

        projects = self._projects.list_by_workspace(ctx.session, workspace_id)
        # ponytail: "visible" == caller is an active project member. Ceiling:
        # workspace admins/owners without explicit project membership are
        # under-counted. Upgrade path = workspace-role-aware visibility.
        visible = [
            p
            for p in projects
            if self._rbac.effective_project_role(ctx.session, p.id, ctx.user.id)
            is not None
        ]
        member_count = len(self._members.list_active(ctx.session, workspace_id))
        return ToolResult(
            ok=True,
            content={"project_count": len(visible), "member_count": member_count},
            source="workspace",
        )


class ProjectListTool(Tool):
    """List the projects the caller can see in a workspace.

    The key navigation primitive: from a workspace the model can discover each
    project's id + name + key, then call the project/sprint/task tools with a
    real ``project_id`` -- without the frontend having to plumb it.
    """

    spec = ToolSpec(
        name="list_projects",
        description=(
            "List the projects in a workspace the user can access, with each "
            "project's id, name and key. Use this to find a project_id before "
            "calling project/sprint/task tools. Defaults to the current "
            "workspace; pass workspace_id to list another accessible workspace's "
            "projects."
        ),
        parameters=_WS_ARGS,
        category="workspace",
        capability="workspace.projects",
    )

    def __init__(
        self,
        orgs_service: OrganizationsService | None = None,
        projects_repo: ProjectsRepository | None = None,
        rbac: RBACService | None = None,
    ) -> None:
        self._orgs = orgs_service or OrganizationsService()
        self._projects = projects_repo or ProjectsRepository()
        self._rbac = rbac or RBACService()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            workspace_id = _resolve_workspace_id(args, ctx)
        except _InvalidArgs:
            return _invalid_args()
        # Gate on membership (raises HTTPException handled by the executor).
        self._orgs.get_for_member(ctx.session, workspace_id, ctx.user.id)

        # ponytail: same active-membership visibility filter as WorkspaceStats.
        # Ceiling: workspace admins without explicit project membership see an
        # empty list. Upgrade path = workspace-role-aware visibility.
        projects = [
            {"id": str(p.id), "name": p.name, "key": p.key}
            for p in self._projects.list_by_workspace(ctx.session, workspace_id)
            if self._rbac.effective_project_role(ctx.session, p.id, ctx.user.id)
            is not None
        ][:MAX_ITEMS]
        return ToolResult(ok=True, content=projects, source="project")
