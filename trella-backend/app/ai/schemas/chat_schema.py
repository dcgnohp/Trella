"""Chat schemas (Phase 4, AI Chat) — metadata + structured context.

Extend the project's :class:`CamelModel` so the API speaks camelCase on the
wire while accepting snake_case internally (matching ``docs_ai_schema.py``).
These are pure data contracts: no business logic, no provider/model coupling.

Design notes (PHASE_4_PLAN P4-B2, decisions #6/#7):
- ``ChatMessage`` carries ``id`` + ``timestamp`` from the MVP so later
  persistence/sync does not require a schema change. ``role`` includes
  ``"tool"`` up front for forward-compat with tool calling / MCP / agents,
  even though the MVP does not emit tool messages.
- ``ConversationContext`` keeps conversation context as explicit, optional
  sections (never a generic ``extra_context`` blob). It stays structured until
  the final render step (``PromptManager.render_system_prompt``); it is not
  flattened here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.base import CamelModel


class ChatMessage(CamelModel):
    """A single conversation message with stable metadata."""

    id: str
    timestamp: datetime
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class ConversationContext(CamelModel):
    """Optional, structured context sections supplied by the client."""

    workspace: str | None = None
    project: str | None = None
    sprint: str | None = None
    task: str | None = None
    knowledge: str | None = None


class ChatRequest(CamelModel):
    """Feature input: conversation history plus optional structured context.

    Phase 7 adds optional *current-view* IDs so the reasoning engine can scope
    tool calls to what the user is looking at (workspace/project/sprint/task)
    and a ``conversation_id`` so conversation-scoped tool-result memory can be
    reused across the requests of one conversation. All optional and ignored
    when tools are disabled — the payload-only chat path is unchanged.
    """

    messages: list[ChatMessage] = Field(default_factory=list)
    context: ConversationContext | None = None
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    sprint_id: UUID | None = None
    task_id: UUID | None = None
    conversation_id: str | None = None
