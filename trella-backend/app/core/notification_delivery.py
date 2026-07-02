import logging
from typing import Any

# Forward-ref placeholder for app.models.notifications_model.Notification.
Notification = Any

logger = logging.getLogger(__name__)


class InAppDelivery:
    """In-app delivery channel. Pushes a realtime event when a WebSocket manager is available."""

    EVENT_NAME = "notification.created"

    def deliver(self, notification: Notification) -> None:
        """Push a notification.created event to the recipient, best-effort."""
        try:
            manager = self._get_ws_manager()
            if manager is None:
                logger.debug(
                    "InAppDelivery: no WebSocket manager available; "
                    "skipping realtime push for notification %s",
                    getattr(notification, "id", "<unknown>"),
                )
                return

            from app.core.realtime import serialize_notification

            recipient_id = getattr(notification, "user_id", None)
            manager.push_to_user(
                recipient_id,
                self.EVENT_NAME,
                serialize_notification(notification),
            )
        except Exception:  # noqa: BLE001 — best-effort: never raise
            logger.warning(
                "InAppDelivery: failed to push realtime event for "
                "notification %s; record already persisted, ignoring.",
                getattr(notification, "id", "<unknown>"),
                exc_info=True,
            )

    @staticmethod
    def _get_ws_manager() -> Any | None:
        """Return the WebSocket manager, or None if not yet available."""
        try:
            from app.core.realtime import ws_manager  # type: ignore[import-untyped]
        except Exception:  # noqa: BLE001 — module not present yet is expected
            return None
        return ws_manager
