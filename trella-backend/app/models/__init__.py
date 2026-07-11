from sqlmodel import SQLModel

from app.models.docs_model import Doc
from app.models.knowledge_collections_model import KnowledgeCollection
from app.models.knowledge_user_prefs_model import KnowledgeUserPref
from app.models.activity_logs_model import ActivityLog
from app.models.attachments_model import Attachment
from app.models.audit_logs_model import AuditAction, AuditLog, EntityType
from app.models.board_lists_model import List
from app.models.board_members_model import BoardMember
from app.models.boards_model import Board
from app.models.comment_mentions_model import CommentMention
from app.models.comments_model import Comment
from app.models.custom_statuses_model import CustomStatus
from app.models.notifications_model import Notification
from app.models.org_limits_model import OrgLimit
from app.models.org_subscriptions_model import OrgSubscription
from app.models.plan_boards_model import PlanBoard
from app.models.plans_model import Plan
from app.models.project_members_model import ProjectMember
from app.models.projects_model import Project
from app.models.sprints_model import Sprint
from app.models.task_cards_model import Card
from app.models.tasks_model import Task
from app.models.users_model import User
from app.models.velocity_config_model import VelocityConfig
from app.models.workflows_model import Workflow, WorkflowTransition
from app.models.workspace_members_model import WorkspaceMember
from app.models.workspaces_model import Workspace

Organization = Workspace
OrganizationMember = WorkspaceMember

__all__ = [
    "Doc",
    "KnowledgeCollection",
    "KnowledgeUserPref",
    "SQLModel",
    "User",
    "Workspace",
    "WorkspaceMember",
    "Organization",
    "OrganizationMember",
    "OrgSubscription",
    "OrgLimit",
    "Project",
    "ProjectMember",
    "Board",
    "BoardMember",
    "List",
    "Card",
    "Task",
    "AuditLog",
    "AuditAction",
    "EntityType",
    "Notification",
    "Comment",
    "CommentMention",
    "Attachment",
    "CustomStatus",
    "ActivityLog",
    "Sprint",
    "VelocityConfig",
    "Plan",
    "PlanBoard",
    "Workflow",
    "WorkflowTransition",
]
