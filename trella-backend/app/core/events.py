"""Lightweight in-process domain events + a background async dispatcher.

Business services publish GENERIC lifecycle events (they know nothing about who
consumes them — no AI, no embeddings). Consumers (e.g. the AI Retrieval Layer)
subscribe async handlers at startup. Publishing is NON-BLOCKING: handlers run as
background tasks on a captured event loop, so a slow/failing subscriber never
delays or breaks the publishing request.

Dedicated to fire-and-forget background jobs — deliberately independent of the
websocket/realtime infrastructure.

ponytail: in-process, at-most-once, best-effort (a crash between publish and
handler loses the event — the backfill script is the recovery path). Ceiling:
not durable, single process. Upgrade path = a persistent outbox/queue behind the
same ``publish`` API.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from uuid import UUID

logger = logging.getLogger("app.events")


@dataclass(frozen=True)
class DomainEvent:
    """Base class for all domain events."""


@dataclass(frozen=True)
class DocumentCreated(DomainEvent):
    doc_id: UUID
    workspace_id: UUID


@dataclass(frozen=True)
class DocumentUpdated(DomainEvent):
    doc_id: UUID
    workspace_id: UUID


@dataclass(frozen=True)
class DocumentDeleted(DomainEvent):
    doc_id: UUID
    workspace_id: UUID


@dataclass(frozen=True)
class SprintCompleted(DomainEvent):
    """A sprint was closed. ``completed_by`` is the actor who closed it — a
    PROJECT_ADMIN (completing a sprint requires that role), so it can serve as
    the permission context + approval recipient for any workflow automation."""

    sprint_id: UUID
    project_id: UUID
    workspace_id: UUID
    completed_by: UUID


Handler = Callable[[DomainEvent], Awaitable[None]]


class EventDispatcher:
    """Subscribe async handlers to event types; publish schedules them in bg.

    ``bind_loop`` captures the app's event loop at startup so ``publish`` can be
    called from sync business code (which runs in a threadpool) and still
    schedule coroutines onto the loop without blocking the caller.
    """

    def __init__(self) -> None:
        self._subscribers: dict[type[DomainEvent], list[Handler]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self, event_type: type[DomainEvent], handler: Handler) -> None:
        self._subscribers.setdefault(event_type, []).append(handler)

    def reset(self) -> None:
        """Drop all subscribers (used by tests)."""
        self._subscribers.clear()

    def publish(self, event: DomainEvent) -> None:
        """Schedule every subscriber for ``event`` as a background task.

        Non-blocking and best-effort: with no bound loop (scripts/tests) or no
        subscribers it is a cheap no-op, so business code can always publish.
        """
        handlers = self._subscribers.get(type(event), [])
        for handler in handlers:
            self._schedule(handler, event)

    def _schedule(self, handler: Handler, event: DomainEvent) -> None:
        loop = self._loop
        if loop is None:
            return  # not bound (e.g. tests / one-off scripts) -> drop silently
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            loop.create_task(self._run_safe(handler, event))
        else:
            # Called from a sync (threadpool) context: hop onto the app loop.
            asyncio.run_coroutine_threadsafe(self._run_safe(handler, event), loop)

    @staticmethod
    async def _run_safe(handler: Handler, event: DomainEvent) -> None:
        """Run a handler, swallowing errors so one bad subscriber is isolated."""
        try:
            await handler(event)
        except Exception:
            logger.exception("event handler failed for %s", type(event).__name__)


_dispatcher = EventDispatcher()


def get_event_dispatcher() -> EventDispatcher:
    """Return the process-wide event dispatcher."""
    return _dispatcher
