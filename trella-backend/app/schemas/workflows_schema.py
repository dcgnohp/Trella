import json
import uuid
from typing import Any
from pydantic import field_validator
from app.core.base import CamelModel


class WorkflowTransitionCreate(CamelModel):
    name: str
    from_status_id: uuid.UUID | None = None
    to_status_id: uuid.UUID
    conditions: list[dict[str, Any]] = []
    validators: list[dict[str, Any]] = []
    actions: list[dict[str, Any]] = []


class WorkflowTransitionUpdate(CamelModel):
    name: str | None = None
    from_status_id: uuid.UUID | None = None
    to_status_id: uuid.UUID | None = None
    conditions: list[dict[str, Any]] | None = None
    validators: list[dict[str, Any]] | None = None
    actions: list[dict[str, Any]] | None = None


class WorkflowTransitionPublic(CamelModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    name: str
    from_status_id: uuid.UUID | None
    to_status_id: uuid.UUID
    conditions: list[dict[str, Any]]
    validators: list[dict[str, Any]]
    actions: list[dict[str, Any]]

    @field_validator("conditions", "validators", "actions", mode="before")
    @classmethod
    def parse_json_string(cls, v: Any) -> list[dict[str, Any]]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []


class WorkflowCreate(CamelModel):
    name: str
    description: str | None = None


class WorkflowUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class WorkflowPublic(CamelModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    transitions: list[WorkflowTransitionPublic] = []
