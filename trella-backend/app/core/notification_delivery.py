import logging
from typing import Any, Protocol, runtime_checkable

# Forward-ref placeholder for app.models.notifications_model.Notification.
Notification = Any

logger = logging.getLogger(__name__)


@runtime_checkable
class NotificationDelivery(Protocol):
    """Strategy for delivering an already-persisted Notification."""

    def deliver(self, notification: Notification) -> None:
        """Deliver notification over this channel. Never raises."""
        ...


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


class CompositeDelivery:
    """Fan-out delivery across multiple channels. One failing channel never blocks the others."""

    def __init__(self, channels: list[NotificationDelivery] | None = None) -> None:
        self.channels: list[NotificationDelivery] = (
            channels if channels is not None else [InAppDelivery()]
        )

    def deliver(self, notification: Notification) -> None:
        """Deliver notification via every channel, each best-effort."""
        for channel in self.channels:
            try:
                channel.deliver(notification)
            except Exception:  # noqa: BLE001 — one channel must not block others
                logger.warning(
                    "CompositeDelivery: channel %s failed to deliver "
                    "notification %s; continuing with remaining channels.",
                    type(channel).__name__,
                    getattr(notification, "id", "<unknown>"),
                    exc_info=True,
                )


def default_delivery() -> CompositeDelivery:
    """Return the default delivery stack (in-app only)."""
    return CompositeDelivery([InAppDelivery()])
