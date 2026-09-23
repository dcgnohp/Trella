"""User data-access tools (workspace-scoped, membership-gated)."""

from __future__ import annotations

from typing import Any

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.data_access import _invalid_args, _InvalidArgs, _require_uuid
from app.ai.tools.permissions import PermissionLayer
from app.repositories.workspace_members_repository import WorkspaceMembersRepository
from app.services.users_service import UsersService


class UserLookupTool(Tool):
    """Look up a user's public profile, gated by shared workspace membership."""

    spec = ToolSpec(
        name="lookup_user",
        description=(
            "Look up a user's public profile (id, name, email) by id. Only "
            "returns users who are active members of the current workspace."
        ),
        parameters={
            "type": "object",
            "properties": {"user_id": {"type": "string", "description": "User UUID"}},
            "required": ["user_id"],
        },
        category="user",
        capability="user.lookup",
    )

    def __init__(
        self,
        users_service: UsersService | None = None,
        members_repo: WorkspaceMembersRepository | None = None,
        permissions: PermissionLayer | None = None,
    ) -> None:
        self._users = users_service or UsersService()
        self._members = members_repo or WorkspaceMembersRepository()
        self._perms = permissions or PermissionLayer()

    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        if ctx.workspace_id is None:
            return _invalid_args()
        try:
            user_id = _require_uuid(args, "user_id")
        except _InvalidArgs:
            return _invalid_args()

        # SECURITY: UsersService.get_by_id has NO permission check, so we gate
        # here. First confirm the caller belongs to the workspace, then confirm
        # the TARGET is an active member. A non-member target returns not_found
        # (never leak whether the account exists elsewhere).
        self._perms.check_workspace(ctx.session, ctx.user, ctx.workspace_id)
        member_ids = {
            m.user_id for m in self._members.list_active(ctx.session, ctx.workspace_id)
        }
        if user_id not in member_ids:
            return ToolResult(ok=False, error="not_found")

        target = self._users.get_by_id(ctx.session, user_id)
        if target is None:
            return ToolResult(ok=False, error="not_found")
        # Never expose hashed_password or other sensitive fields.
        return ToolResult(
            ok=True,
            content={
                "id": str(target.id),
                "full_name": target.full_name,
                "email": target.email,
            },
            source="user",
        )
