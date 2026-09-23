"""Park an event-triggered ActionPlan and notify the approver (Phase 10.4).

Option A (chosen): reuse the existing in-memory :class:`ActionPlanStore` (TTL,
per-process) to hold the proposal, and emit an in-app :class:`Notification`
carrying the ``plan_id`` so an admin can open + approve it via the existing
``POST /ai/actions/execute`` endpoint. No new table, no migration.

ponytail: in-memory plan store (mirrors Phase 8). Ceiling: lost on restart / not
cross-worker — acceptable because nothing executes until an explicit human
approval, so a lost pending proposal is a no-op, not data loss. Upgrade path =
a durable ``ai_pending_action_plan`` table behind this same function (Option B).
"""

from __future__ import annotations

from uuid import UUID

from sqlmodel import Session

from app.ai.agent.action_plan import (
    ActionPlanStore,
    ActionProposal,
    get_action_plan_store,
)
from app.models.enums import NotificationType
from app.services.notifications_service import NotificationService


def park_and_notify(
    session: Session,
    *,
    workspace_id: UUID,
    recipient_ids: list[UUID],
    proposals: list[ActionProposal],
    title: str,
    content: str | None = None,
    store: ActionPlanStore | None = None,
    notifications: NotificationService | None = None,
) -> str:
    """Create an ActionPlan from ``proposals`` and notify each recipient.

    Returns the new ``plan_id``. The notification metadata carries ``plan_id``
    (and ``workspace_id``) so the client can load the plan and approve it via the
    existing execute endpoint. Performs NO guarded business write itself.
    """
    store = store or get_action_plan_store()
    notifications = notifications or NotificationService()

    plan = store.create(proposals)
    # ponytail: no dedicated "system"/"mention" NotificationType exists; COMMENT_MENTION
    # is the closest neutral "someone needs your attention" member. Upgrade path = add a
    # first-class AI_ACTION_PENDING member if/when the enum gains system notifications.
    metadata = {"plan_id": plan.plan_id, "workspace_id": str(workspace_id)}
    for recipient_id in recipient_ids:
        notifications.emit(
            session,
            recipient_id=recipient_id,
            type=NotificationType.COMMENT_MENTION,
            title=title,
            content=content,
            metadata=metadata,
        )

    return plan.plan_id
