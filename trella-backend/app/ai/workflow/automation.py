"""Event-driven AI workflow automation (Phase 10.4).

On ``SprintCompleted`` this drafts a sprint-summary document and PROPOSES it via
the Phase 8 path: it parks an ``ActionPlan`` (one ``create_document`` proposal)
and notifies the sprint's completer (a PROJECT_ADMIN) to review + approve. It is
**proposal-only** — NOTHING is executed here: no ``apply()``, no document write.
The guarded write happens later, only after a human approves, through the
Phase 8 propose→approve→execute path with RBAC re-checked at execution time.

Wiring gates this behind ``AI_WORKFLOW_ENABLED`` (default OFF); this module is
unaware of that flag by design — the orchestrator subscribes the rules only when
the flag is on.

ponytail: reuses the in-memory Phase 8 ``ActionPlanStore`` (via ``park_and_notify``)
and the existing single-shot generation path (``AIBaseService``); no new provider
call is invented and no new persistence is added.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlmodel import Session

from app.ai.agent.action_plan import ActionPlanStore, ActionProposal
from app.ai.prompts.prompt_manager import PromptManager
from app.ai.providers import get_provider
from app.ai.providers.base import AIProvider
from app.ai.services.ai_base_service import AIBaseService
from app.ai.tools.base import Tool, ToolContext
from app.ai.tools.data_access.doc_write_tools import CreateDocTool
from app.ai.tools.data_access.pm_tools import SprintAnalysisTool
from app.ai.workflow.pending import park_and_notify
from app.ai.workflow.rules import AutomationRule
from app.core.config import settings
from app.core.db import engine
from app.core.events import (
    DomainEvent,
    EventDispatcher,
    SprintCompleted,
    get_event_dispatcher,
)
from app.models.users_model import User
from app.services.notifications_service import NotificationService

_PROMPT_NAME = "workflow_sprint_summary"


def _draft_variables(analytics: dict[str, Any]) -> dict[str, str]:
    """Flatten the sprint analytics into string prompt variables.

    Every ``{{var}}`` in ``workflow_sprint_summary.md`` must be supplied as a
    string (``PromptManager.render`` requires ``dict[str, str]``).
    """
    sprint = analytics.get("sprint", {})
    tasks = analytics.get("tasks", {})
    commitment = analytics.get("commitment", {})
    schedule = analytics.get("schedule", {})
    days_remaining = schedule.get("days_remaining")
    return {
        "sprint_name": str(sprint.get("name", "")),
        "health": str(analytics.get("health", "")),
        "done_tasks": str(tasks.get("done", 0)),
        "total_tasks": str(tasks.get("total", 0)),
        "completed_points": str(commitment.get("completed_points", 0)),
        "total_points": str(commitment.get("total_points", 0)),
        "days_remaining": "unknown" if days_remaining is None else str(days_remaining),
    }


async def _draft(
    analytics: dict[str, Any],
    *,
    provider: AIProvider,
    prompts: PromptManager,
) -> str:
    """Render the summary prompt and generate the Markdown draft.

    Reuses the existing single-shot generation path (``AIBaseService.run``, the
    same composition ``AISummaryService``/``AIDescriptionService`` use) so no new
    provider call is invented. ``provider`` is injected so tests pass a fake.
    """
    base = AIBaseService(provider, prompt_manager=prompts)
    response = await base.run(
        prompt_name=_PROMPT_NAME,
        variables=_draft_variables(analytics),
        feature="workflow_sprint_summary",
    )
    return response.content


async def propose_sprint_summary(
    session: Session,
    event: SprintCompleted,
    *,
    provider: AIProvider | None = None,
    prompts: PromptManager | None = None,
    analytics_tool: Tool | None = None,
    doc_tool: Tool | None = None,
    store: ActionPlanStore | None = None,
    notifications: NotificationService | None = None,
) -> str | None:
    """Draft a sprint summary and PROPOSE it (park + notify). No write here.

    Fully injectable so tests avoid a live LLM/network. Returns the parked
    ``plan_id``, or ``None`` when the actor is gone or a read step fails.
    """
    user = session.get(User, event.completed_by)
    if user is None:
        return None
    ctx = ToolContext(session=session, user=user, workspace_id=event.workspace_id)

    # 1) Gather deterministic analytics (read-only).
    res = await (analytics_tool or SprintAnalysisTool()).run(
        {"sprint_id": str(event.sprint_id)}, ctx
    )
    if not res.ok:
        return None
    analytics = res.content

    # 2) Draft the Markdown summary (generation; injectable provider).
    summary = await _draft(
        analytics,
        provider=provider or get_provider(settings),
        prompts=prompts or PromptManager(),
    )

    # 3) PROPOSE the document via the Phase 8 write-tool (no side effect).
    title = f"Sprint Summary — {analytics['sprint']['name']}"
    pres = await (doc_tool or CreateDocTool()).run(
        {"title": title, "content": summary, "sprint_id": str(event.sprint_id)}, ctx
    )
    if not pres.ok:
        return None
    proposal = ActionProposal(
        action_id=uuid4().hex,
        tool_name="create_document",
        args=pres.content["args"],
        preview=pres.content["preview"],
        capabilities=frozenset({"write"}),
        scope={
            "workspace_id": str(event.workspace_id),
            "sprint_id": str(event.sprint_id),
        },
    )

    # 4) Park the plan + notify the approver (still nothing executed).
    plan_id = park_and_notify(
        session,
        workspace_id=event.workspace_id,
        recipient_ids=[user.id],
        proposals=[proposal],
        title="Sprint summary ready to review",
        content=f"An AI-drafted summary for '{analytics['sprint']['name']}' is "
        "ready for your review and approval.",
        store=store,
        notifications=notifications,
    )
    return plan_id


async def _handle_sprint_completed(event: DomainEvent) -> None:
    """Background handler: open an OWN session and propose the summary.

    Mirrors ``app.ai.retrieval.sync``: the publishing request's session is
    already closed, so open a fresh short-lived one. Commit so the notification
    write (the only side effect) is persisted.
    """
    assert isinstance(event, SprintCompleted)
    with Session(engine) as session:
        plan_id = await propose_sprint_summary(session, event)
        if plan_id is not None:
            session.commit()


# In-code registry (see ``app.ai.workflow.rules``). One rule today; adding an
# automation is appending an ``AutomationRule`` here + writing its handler.
WORKFLOW_RULES: list[AutomationRule] = [
    AutomationRule(SprintCompleted, _handle_sprint_completed),
]


def register_workflow_automation(dispatcher: EventDispatcher | None = None) -> None:
    """Subscribe every workflow rule to the dispatcher.

    Called at startup ONLY when ``AI_WORKFLOW_ENABLED`` is set (the orchestrator
    owns that gate). Mirrors ``register_document_indexing``.
    """
    bus = dispatcher or get_event_dispatcher()
    for rule in WORKFLOW_RULES:
        bus.subscribe(rule.event_type, rule.handler)
