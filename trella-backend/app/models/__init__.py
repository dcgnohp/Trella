"""Model layer aggregator (layer-first ``models``).

Two responsibilities:

1. Re-export ``SQLModel`` so ``from app.models import SQLModel`` keeps working —
   Alembic's ``app/alembic/env.py`` relies on this to build
   ``SQLModel.metadata`` for autogenerate.
2. Import every domain model module so their tables register on
   ``SQLModel.metadata`` (required for Alembic autogenerate and for SQLModel to
   resolve relationships).

As new domains are implemented (organizations, organization_members, boards,
board_lists, task_cards, audit_logs, org_limits, org_subscriptions, ...) import
their ``*_model`` module here. Only modules that currently exist are imported.
"""

from sqlmodel import SQLModel

from app.models.org_limits_model import OrgLimit
from app.models.org_subscriptions_model import OrgSubscription
from app.models.organization_members_model import OrganizationMember
from app.models.organizations_model import Organization
from app.models.users_model import User

__all__ = [
    "SQLModel",
    "User",
    "Organization",
    "OrganizationMember",
    "OrgSubscription",
    "OrgLimit",
]
