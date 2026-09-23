"""Story Point context builder (payload mode).

Builds prompt variables from data the client sends in the request body.
Future repository mode seam is preserved.
"""

from __future__ import annotations

from typing import Any

from app.ai.context.base import ContextBuilder
from app.ai.schemas.task_ai_schema import StoryPointRequest


class StoryPointContext(ContextBuilder):
    """Context for Story Point estimation features."""

    def __init__(
        self,
        *,
        title: str,
        description: str | None = None,
        labels: list[str] | None = None,
        priority: str | None = None,
        sprint_goal: str | None = None,
        velocity: int | None = None,
        history: list[dict[str, Any]] | None = None,
    ) -> None:
        self.title = title
        self.description = description
        self.labels = labels or []
        self.priority = priority
        self.sprint_goal = sprint_goal
        self.velocity = velocity
        self.history = history or []

    @classmethod
    def from_payload(cls, req: StoryPointRequest) -> StoryPointContext:
        """Factory: Build from a StoryPointRequest payload."""
        return cls(
            title=req.title,
            description=req.description,
            labels=req.labels,
            priority=req.priority,
            sprint_goal=req.sprint_goal,
            velocity=req.velocity,
            history=[
                {"title": h.title, "story_point": h.story_point} for h in req.history
            ],
        )

    def build(self) -> dict[str, str]:
        """Return the prompt variables as strings."""
        history_str = (
            "\n".join(f"- {h['title']}: {h['story_point']}" for h in self.history)
            if self.history
            else ""
        )

        variables: dict[str, str] = {
            "title": self.title,
            "description": self.description or "",
            "labels": ", ".join(self.labels),
            "priority": self.priority or "",
            "sprint_goal": self.sprint_goal or "",
            "velocity": str(self.velocity) if self.velocity is not None else "",
            "history": history_str,
        }
        return {k: str(v) for k, v in self.redact(variables).items()}

    def metadata(self) -> dict[str, Any]:
        """Non-sensitive metadata."""
        return {
            "has_description": bool(self.description),
            "label_count": len(self.labels),
            "history_count": len(self.history),
            "has_velocity": self.velocity is not None,
        }
