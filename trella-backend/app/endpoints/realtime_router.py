"""WebSocket endpoints for the realtime layer (design §7).

Two channels, both authenticated with a ``?token=<jwt>`` query parameter (the
browser cannot attach the httpOnly cookie or an Authorization header to a WS
upgrade, so the frontend forwards the JWT in the query string):

* ``/ws/notifications``        — the caller's own notification stream.
* ``/ws/projects/{project_id}`` — task/comment/attachment events for a project
  the caller is an active member of.

These are mounted WITHOUT the ``/api/v1`` prefix so the paths match the
frontend's ``buildRealtimeUrl`` contract.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session

from app.core import security
from app.core.db import engine
from app.core.rbac import RBACService
from app.core.realtime import ws_manager

router = APIRouter()

_rbac = RBACService()


def _user_id_from_token(token: str | None) -> uuid.UUID | None:
    """Decode the JWT and return the subject user id, or None if invalid."""
    if not token:
        return None
    try:
        payload = security.decode_token(token)
        return uuid.UUID(str(payload["sub"]))
    except (InvalidTokenError, KeyError, ValueError):
        return None


@router.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket) -> None:
    user_id = _user_id_from_token(websocket.query_params.get("token"))
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect_user(user_id, websocket)
    try:
        while True:
            # We don't expect client messages; this keeps the socket open and
            # surfaces disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect_user(user_id, websocket)


@router.websocket("/ws/projects/{project_id}")
async def project_ws(websocket: WebSocket, project_id: uuid.UUID) -> None:
    user_id = _user_id_from_token(websocket.query_params.get("token"))
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Authorise: only active project members may subscribe.
    with Session(engine) as session:
        role = _rbac.effective_project_role(session, project_id, user_id)
    if role is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect_project(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect_project(project_id, websocket)
