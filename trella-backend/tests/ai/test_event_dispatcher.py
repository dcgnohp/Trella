"""Tests for the core EventDispatcher (Phase 9 background sync backbone)."""

from __future__ import annotations

import asyncio
import uuid

from app.core.events import (
    DocumentCreated,
    DocumentDeleted,
    DomainEvent,
    EventDispatcher,
)


def test_publish_without_bound_loop_is_noop() -> None:
    # No loop bound (scripts/tests): publish must not raise and must not run.
    bus = EventDispatcher()
    ran: list[DomainEvent] = []

    async def handler(event: DomainEvent) -> None:
        ran.append(event)

    bus.subscribe(DocumentCreated, handler)
    bus.publish(DocumentCreated(doc_id=uuid.uuid4(), workspace_id=uuid.uuid4()))
    assert ran == []  # dropped, best-effort


def test_publish_schedules_only_matching_handlers() -> None:
    async def main() -> list[str]:
        bus = EventDispatcher()
        bus.bind_loop(asyncio.get_running_loop())
        seen: list[str] = []

        async def on_created(_e: DomainEvent) -> None:
            seen.append("created")

        async def on_deleted(_e: DomainEvent) -> None:
            seen.append("deleted")

        bus.subscribe(DocumentCreated, on_created)
        bus.subscribe(DocumentDeleted, on_deleted)

        bus.publish(DocumentCreated(doc_id=uuid.uuid4(), workspace_id=uuid.uuid4()))
        await asyncio.sleep(0)  # let the scheduled task run
        return seen

    seen = asyncio.run(main())
    assert seen == ["created"]  # only the DocumentCreated handler fired


def test_failing_handler_is_isolated() -> None:
    async def main() -> list[str]:
        bus = EventDispatcher()
        bus.bind_loop(asyncio.get_running_loop())
        seen: list[str] = []

        async def bad(_e: DomainEvent) -> None:
            raise RuntimeError("boom")

        async def good(_e: DomainEvent) -> None:
            seen.append("good")

        bus.subscribe(DocumentCreated, bad)
        bus.subscribe(DocumentCreated, good)
        bus.publish(DocumentCreated(doc_id=uuid.uuid4(), workspace_id=uuid.uuid4()))
        await asyncio.sleep(0)
        return seen

    # The bad handler's exception is swallowed; the good handler still runs.
    assert asyncio.run(main()) == ["good"]
