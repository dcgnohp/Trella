"""Task context builder (payload mode).

Builds prompt variables from data the client sends in the request body — no DB
access, no imports from business modules (``.ai/PHASE_1_PLAN.md`` P1-B3, dual-
mode decision §2). A future phase can add a DB-backed builder without changing
any service signature.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.ai.context.base import ContextBuilder


class TaskContext(ContextBuilder):
    """Context for task-oriented AI features, built from a client payload."""

    def __init__(
        self,
        *,
        title: str,
        description: str | None = None,
        labels: Sequence[str] = (),
        priority: str | None = None,
        sprint: str | None = None,
    ) -> None:
        self.title = title
        self.description = description
        self.labels = labels
        self.priority = priority
        self.sprint = sprint

    def build(self) -> dict[str, str]:
        """Return the 5 prompt variables, always present, always strings."""
        variables: dict[str, str] = {
            "title": self.title,
            "description": self.description or "",
            "labels": ", ".join(self.labels),
            "priority": self.priority or "",
            "sprint": self.sprint or "",
        }
        # redact() returns the same shape here (no credential-like keys), but
        # we pass through it so every builder honours the same seam (§13).
        return {k: str(v) for k, v in self.redact(variables).items()}

    def metadata(self) -> dict[str, Any]:
        # Non-sensitive labels only — never task content, never secrets.
        return {
            "has_description": bool(self.description),
            "label_count": len(self.labels),
        }
