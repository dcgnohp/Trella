"""In-process WebSocket connection manager for realtime events (design §7).

Single-worker, in-memory fan-out. Two channel kinds:

* **user channel**   — keyed by ``user_id``; used for ``notification.created``.
* **project channel** — keyed by ``project_id``; used for ``task.*`` /
  ``comment.created`` / ``attachment.uploaded``.

The HTTP endpoints that emit events are *synchronous* (run in Starlette's
threadpool), while WebSocket sends are coroutines on the main event loop. We
capture the running loop at startup (``bind_loop``) and schedule sends with
``run_coroutine_threadsafe`` so sync callers can push without blocking.

Every push is best-effort: a slow or dead socket never raises into the caller.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


def _key(value: Any) -> str:
    """Normalise a uuid/str channel key to its string form."""
    return str(value)


class ConnectionManager:
    def __init__(self) -> None:
        self._user_channels: dict[str, set[WebSocket]] = {}
        self._project_channels: dict[str, set[WebSocket]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    # -- lifecycle ---------------------------------------------------------

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Capture the main event loop so sync callers can schedule sends."""
        self._loop = loop

    # -- registration ------------------------------------------------------

    async def connect_user(self, user_id: Any, websocket: WebSocket) -> None:
        await websocket.accept()
        self._user_channels.setdefault(_key(user_id), set()).add(websocket)

    async def connect_project(self, project_id: Any, websocket: WebSocket) -> None:
        await websocket.accept()
        self._project_channels.setdefault(_key(project_id), set()).add(websocket)

    def disconnect_user(self, user_id: Any, websocket: WebSocket) -> None:
        self._drop(self._user_channels, _key(user_id), websocket)

    def disconnect_project(self, project_id: Any, websocket: WebSocket) -> None:
        self._drop(self._project_channels, _key(project_id), websocket)

    @staticmethod
    def _drop(
        channels: dict[str, set[WebSocket]], key: str, websocket: WebSocket
    ) -> None:
        sockets = channels.get(key)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            channels.pop(key, None)

    # -- push (callable from sync code) ------------------------------------

    def push_to_user(self, user_id: Any, event: str, payload: dict[str, Any]) -> None:
        """Schedule a frame to every socket on a user channel. Never raises."""
        self._schedule(
            self._user_channels.get(_key(user_id)), event, payload, user_id=user_id
        )

    def push_to_project(
        self, project_id: Any, event: str, payload: dict[str, Any]
    ) -> None:
        """Schedule a frame to every socket on a project channel. Never raises."""
        self._schedule(
            self._project_channels.get(_key(project_id)),
            event,
            payload,
            project_id=project_id,
        )

    def _schedule(
        self,
        sockets: set[WebSocket] | None,
        event: str,
        payload: dict[str, Any],
        *,
        user_id: Any | None = None,
        project_id: Any | None = None,
    ) -> None:
        if not sockets or self._loop is None:
            return
        frame: dict[str, Any] = {"event": event, "payload": payload}
        if user_id is not None:
            frame["user_id"] = _key(user_id)
        if project_id is not None:
            frame["project_id"] = _key(project_id)
        # Copy the set: the send may mutate the channel as dead sockets drop.
        targets = list(sockets)
        try:
            asyncio.run_coroutine_threadsafe(
                self._broadcast(targets, frame), self._loop
            )
        except Exception:  # noqa: BLE001 — best-effort; persistence already done
            logger.warning(
                "ws push failed to schedule for event %s", event, exc_info=True
            )

    async def _broadcast(self, sockets: list[WebSocket], frame: dict[str, Any]) -> None:
        for socket in sockets:
            try:
                await socket.send_json(frame)
            except Exception:  # noqa: BLE001 — drop dead sockets silently
                self._forget(socket)

    def _forget(self, websocket: WebSocket) -> None:
        for channels in (self._user_channels, self._project_channels):
            for key in list(channels.keys()):
                self._drop(channels, key, websocket)


# Singleton imported by InAppDelivery and the service push points.
ws_manager = ConnectionManager()


def serialize_notification(notification: Any) -> dict[str, Any]:
    """Build a NotificationEventPayload-compatible dict from a Notification."""
    return {
        "notification_id": _key(getattr(notification, "id", "")),
        "title": getattr(notification, "title", None),
        "type": getattr(notification, "type", None),
    }
