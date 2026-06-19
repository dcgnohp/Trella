import logging
import re
import uuid
from typing import Any, Protocol, runtime_checkable

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.rbac import Action, RBACService
from app.models.custom_statuses_model import CustomStatus
from app.models.enums import ActivityAction, CanonicalStatus
from app.models.users_model import User
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.services.activity_logs_service import ActivityLogsService

logger = logging.getLogger(__name__)

# Accepts "#FFAA00" / "#ffaa00" — stored verbatim.
_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

_MAX_NAME_LENGTH = 50

_CANONICAL_VALUES_TEXT = ", ".join(member.value for member in CanonicalStatus)


@runtime_checkable
class CustomStatusCreateData(Protocol):
    """Structural shape of a create payload (real model: ``CustomStatusCreate``)."""

    name: str
    color: str | None
    canonical_status: CanonicalStatus | str | None


class CustomStatusUpdateData(Protocol):
    """Structural shape of an update payload (real model: ``CustomStatusUpdate``)."""

    def model_dump(self, *, exclude_unset: bool = ...) -> dict[str, Any]: ...


class CustomStatusesService:
    """Business logic for the ``custom_statuses`` domain."""

    def __init__(
        self,
        repo: CustomStatusesRepository | None = None,
        rbac_service: RBACService | None = None,
        activity_logs_service: ActivityLogsService | None = None,
    ) -> None:
        self.repo = repo or CustomStatusesRepository()
        self.rbac_service = rbac_service or RBACService()
        self.activity_logs_service = activity_logs_service or ActivityLogsService()

    # ------------------------------------------------------------------ #
    # Validation helpers (pure)                                          #
    # ------------------------------------------------------------------ #
    @staticmethod
    def _validate_name(name: str) -> None:
        """Raise HTTP 422 if name is empty or exceeds 50 characters."""
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="name must not be empty",
            )
        if len(name) > _MAX_NAME_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"name must be at most {_MAX_NAME_LENGTH} characters",
            )

    @staticmethod
    def _validate_color(color: str | None) -> None:
        """Raise HTTP 422 if color is non-None and not a valid 7-character hex string."""
        if color is not None and not _HEX_COLOR_RE.match(color):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="color must be a 7-character hex string",
            )

    @staticmethod
    def _normalize_canonical(
        canonical_status: CanonicalStatus | str | None,
    ) -> str | None:
        """Return the canonical value string, or None if unmapped. Raise HTTP 422 for invalid values."""
        if canonical_status is None:
            return None
        try:
            return CanonicalStatus(canonical_status).value
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(f"canonical_status must be one of {_CANONICAL_VALUES_TEXT}"),
            ) from None

    def _ensure_name_unique(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        name: str,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> None:
        """Raise HTTP 409 if another custom status in the workspace already uses this name."""
        existing = self.repo.get_by_name(session, workspace_id, name)
        if existing is not None and existing.id != exclude_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A custom status named '{name}' already exists",
            )

    def _load(self, session: Session, custom_status_id: uuid.UUID) -> CustomStatus:
        """Fetch a custom status by id or raise HTTP 404 when absent."""
        custom_status = self.repo.get(session, custom_status_id)
        if custom_status is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom status not found",
            )
        return custom_status

    # ------------------------------------------------------------------ #
    # CRUD                                                               #
    # ------------------------------------------------------------------ #
    def create(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        data: CustomStatusCreateData,
        user: User,
    ) -> CustomStatus:
        """Create a custom status for a workspace. Raise HTTP 403 if user lacks ADMIN role."""
        self.rbac_service.check(
            session,
            Action.MANAGE_CUSTOM_STATUS,
            user=user,
            workspace_id=workspace_id,
        )
        self._validate_name(data.name)
        self._validate_color(data.color)
        canonical_value = self._normalize_canonical(data.canonical_status)
        self._ensure_name_unique(session, workspace_id, data.name)
        try:
            custom_status = self.repo.create(
                session,
                CustomStatus(
                    workspace_id=workspace_id,
                    name=data.name,
                    color=data.color,
                    canonical_status=canonical_value,
                ),
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(custom_status)
        return custom_status

    def list(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        user: User,
    ) -> list[CustomStatus]:
        """List a workspace's custom statuses. Raise HTTP 403 if user is not an active member."""
        effective_role = self.rbac_service.effective_workspace_role(
            session, workspace_id, user.id
        )
        if effective_role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: not an active member of this workspace",
            )
        return self.repo.list_by_workspace(session, workspace_id)

    def get(
        self,
        session: Session,
        custom_status_id: uuid.UUID,
    ) -> CustomStatus:
        """Fetch a single custom status by id, HTTP 404 when absent."""
        return self._load(session, custom_status_id)

    def update(
        self,
        session: Session,
        custom_status_id: uuid.UUID,
        data: CustomStatusUpdateData,
        user: User,
    ) -> CustomStatus:
        """Apply a partial update to a custom status. Raise HTTP 403 if user lacks ADMIN role."""
        custom_status = self._load(session, custom_status_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_CUSTOM_STATUS,
            user=user,
            workspace_id=custom_status.workspace_id,
        )
        updates = data.model_dump(exclude_unset=True)

        if "name" in updates:
            name = updates["name"]
            self._validate_name(name)
            self._ensure_name_unique(
                session,
                custom_status.workspace_id,
                name,
                exclude_id=custom_status.id,
            )
            custom_status.name = name
        if "color" in updates:
            color = updates["color"]
            self._validate_color(color)
            custom_status.color = color
        if "canonical_status" in updates:
            custom_status.canonical_status = self._normalize_canonical(
                updates["canonical_status"]
            )

        try:
            custom_status = self.repo.update(session, custom_status)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(custom_status)
        return custom_status

    def delete(
        self,
        session: Session,
        custom_status_id: uuid.UUID,
        user: User,
    ) -> None:
        """Delete a custom status. Raise HTTP 409 if still referenced, HTTP 403 if user lacks ADMIN role."""
        custom_status = self._load(session, custom_status_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_CUSTOM_STATUS,
            user=user,
            workspace_id=custom_status.workspace_id,
        )
        reference_count = self.repo.count_references(session, custom_status_id)
        if reference_count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Cannot delete custom status: still in use",
                    "count": reference_count,
                },
            )
        try:
            self.repo.delete(session, custom_status)
            session.commit()
        except Exception:
            session.rollback()
            raise

    # ------------------------------------------------------------------ #
    # Pure mapping resolution                                            #
    # ------------------------------------------------------------------ #
    @staticmethod
    def resolve_canonical(
        custom_status: CustomStatus | None,
    ) -> CanonicalStatus | None:
        """Resolve a custom status to its canonical status. Returns None if input is None or unmapped.

        Defensive: invalid stored strings are converted to None rather than raising.
        """
        if custom_status is None:
            return None
        raw = custom_status.canonical_status
        if raw is None:
            return None
        if isinstance(raw, CanonicalStatus):
            return raw
        try:
            return CanonicalStatus(raw)
        except ValueError:
            return None

    # ------------------------------------------------------------------ #
    # Mapping management                                                 #
    # ------------------------------------------------------------------ #
    def set_mapping(
        self,
        session: Session,
        custom_status_id: uuid.UUID,
        canonical_status: CanonicalStatus | None,
        user: User,
    ) -> CustomStatus:
        """Set or clear a custom status' canonical mapping. No-op (no log) when value is unchanged."""
        custom_status = self._load(session, custom_status_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_CUSTOM_STATUS,
            user=user,
            workspace_id=custom_status.workspace_id,
        )
        new_value = self._normalize_canonical(canonical_status)
        current_value = custom_status.canonical_status

        # No-op: requested value equals the current value (incl. None == None).
        if new_value == current_value:
            return custom_status

        custom_status.canonical_status = new_value
        try:
            custom_status = self.repo.update(session, custom_status)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(custom_status)

        # Best-effort logging AFTER the mapping is durably committed.
        self._record_mapping_change_best_effort(
            session,
            custom_status=custom_status,
            actor=user,
            old_value=current_value,
            new_value=new_value,
        )
        return custom_status

    def _record_mapping_change_best_effort(
        self,
        session: Session,
        *,
        custom_status: CustomStatus,
        actor: User,
        old_value: str | None,
        new_value: str | None,
    ) -> None:
        """Log STATUS_MAPPING_CHANGED to the application log. Never raises — mapping change always stands.

        activity_logs requires a NOT NULL project_id, but status-mapping changes are
        workspace-scoped with no owning project, so we log at the application level instead.
        """
        try:
            old_snapshot = {
                "custom_status_id": str(custom_status.id),
                "canonical_status": old_value,
            }
            new_snapshot = {
                "custom_status_id": str(custom_status.id),
                "canonical_status": new_value,
            }
            logger.info(
                "STATUS_MAPPING_CHANGED (workspace-scoped, no project-bound "
                "ActivityLog): action=%s actor=%s old=%s new=%s",
                ActivityAction.STATUS_MAPPING_CHANGED.value,
                actor.id,
                old_snapshot,
                new_snapshot,
            )
        except Exception:  # noqa: BLE001 — best-effort: never fail the caller.
            logger.warning(
                "Best-effort status-mapping log failed for custom_status %s; "
                "the committed mapping change is unaffected.",
                custom_status.id,
                exc_info=True,
            )

    def mapping_summary(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        user: User,
    ) -> dict[str, Any]:
        """Return mapped/unmapped counts by canonical value. Raise HTTP 403 if user is not an active member."""
        effective_role = self.rbac_service.effective_workspace_role(
            session, workspace_id, user.id
        )
        if effective_role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: not an active member of this workspace",
            )
        statuses = self.repo.list_by_workspace(session, workspace_id)
        by_canonical = {member.value: 0 for member in CanonicalStatus}
        mapped = 0
        for custom_status in statuses:
            resolved = self.resolve_canonical(custom_status)
            if resolved is not None:
                by_canonical[resolved.value] += 1
                mapped += 1
        total = len(statuses)
        return {
            "total": total,
            "mapped": mapped,
            "unmapped": total - mapped,
            "by_canonical": by_canonical,
        }
