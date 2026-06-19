from enum import Enum


class WorkspaceRole(str, Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


class ProjectRole(str, Enum):
    PROJECT_ADMIN = "PROJECT_ADMIN"
    PROJECT_MEMBER = "PROJECT_MEMBER"
    PROJECT_VIEWER = "PROJECT_VIEWER"


class MemberStatus(str, Enum):
    """Only ACTIVE memberships confer effective role access."""

    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    DECLINED = "DECLINED"
    REMOVED = "REMOVED"


class UserAccountStatus(str, Enum):
    """REMOVED is a soft-delete that preserves historical attribution."""

    ACTIVE = "ACTIVE"
    REMOVED = "REMOVED"


class CanonicalStatus(str, Enum):
    """Fixed system-defined statuses; not creatable or editable via any endpoint."""

    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    PENDING = "PENDING"
    DONE = "DONE"


class BoardRole(str, Enum):
    BOARD_ADMIN = "BOARD_ADMIN"
    BOARD_MEMBER = "BOARD_MEMBER"
    BOARD_VIEWER = "BOARD_VIEWER"


class NotificationType(str, Enum):
    WORKSPACE_INVITATION = "WORKSPACE_INVITATION"
    PROJECT_INVITATION = "PROJECT_INVITATION"
    BOARD_INVITATION = "BOARD_INVITATION"
    TASK_ASSIGNED = "TASK_ASSIGNED"
    TASK_UNASSIGNED = "TASK_UNASSIGNED"
    ASSIGNED_TASK_UPDATED = "ASSIGNED_TASK_UPDATED"
    COMMENT_MENTION = "COMMENT_MENTION"


class ActivityAction(str, Enum):
    # Task lifecycle and attribute changes
    TASK_CREATED = "TASK_CREATED"
    TASK_UPDATED = "TASK_UPDATED"
    TASK_DELETED = "TASK_DELETED"
    TASK_MOVED = "TASK_MOVED"
    TASK_STATUS_CHANGED = "TASK_STATUS_CHANGED"
    TASK_ASSIGNED = "TASK_ASSIGNED"
    TASK_UNASSIGNED = "TASK_UNASSIGNED"
    TASK_PRIORITY_CHANGED = "TASK_PRIORITY_CHANGED"
    TASK_DUE_DATE_CHANGED = "TASK_DUE_DATE_CHANGED"
    # Comment changes
    COMMENT_CREATED = "COMMENT_CREATED"
    COMMENT_UPDATED = "COMMENT_UPDATED"
    COMMENT_DELETED = "COMMENT_DELETED"
    # Attachment changes
    ATTACHMENT_UPLOADED = "ATTACHMENT_UPLOADED"
    ATTACHMENT_DELETED = "ATTACHMENT_DELETED"
    # BoardColumn changes
    COLUMN_CREATED = "COLUMN_CREATED"
    COLUMN_UPDATED = "COLUMN_UPDATED"
    COLUMN_DELETED = "COLUMN_DELETED"
    COLUMN_REORDERED = "COLUMN_REORDERED"
    # Membership changes
    MEMBER_ADDED = "MEMBER_ADDED"
    MEMBER_ROLE_CHANGED = "MEMBER_ROLE_CHANGED"
    MEMBER_REMOVED = "MEMBER_REMOVED"
    # Status mapping changes
    STATUS_MAPPING_CHANGED = "STATUS_MAPPING_CHANGED"
