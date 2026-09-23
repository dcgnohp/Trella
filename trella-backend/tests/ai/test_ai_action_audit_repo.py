"""Phase 8 AI action audit: construction/smoke checks.

No live DB -- verifies the model constructs, stores only ids/names/summaries,
and the repository exposes the minimal create/list surface.
"""

from __future__ import annotations

import uuid

from app.models.ai_action_audit_model import AiActionAudit
from app.repositories.ai_action_audit_repository import AiActionAuditRepository


def test_audit_constructs_with_ids_names_and_summary() -> None:
    audit = AiActionAudit(
        user_id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        tool_name="create_task",
        args_json='{"title": "..."}',
        preview="Create task in Backlog",
        status="executed",
        result_summary="Created 1 task",
    )
    assert audit.tool_name == "create_task"
    assert audit.status == "executed"
    # Mixins supply id/created_at/updated_at.
    assert isinstance(audit.id, uuid.UUID)
    assert audit.created_at is not None


def test_audit_nullable_fields_default_to_none() -> None:
    # user_id/workspace_id are SET NULL FKs -- audit survives deletion.
    audit = AiActionAudit(tool_name="denied_tool", status="denied")
    assert audit.user_id is None
    assert audit.workspace_id is None
    assert audit.args_json is None
    assert audit.preview is None
    assert audit.result_summary is None


def test_repository_exposes_minimal_surface() -> None:
    repo = AiActionAuditRepository()
    assert callable(repo.create)
    assert callable(repo.list_by_workspace)
