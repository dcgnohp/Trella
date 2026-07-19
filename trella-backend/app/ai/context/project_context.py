"""Project context builder (payload mode).

Builds prompt variables for the project executive assistant from aggregated
metrics the client sends in the request body (``project_assistant.md``). It
ONLY builds context and estimates tokens: it never truncates prose — truncation
is the sole responsibility of ``AIBaseService`` (``.ai/PHASE_3_PLAN.md``
P3-B4). ``build()`` is the trust boundary: it validates that there is enough
consistent data to analyze.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.ai.context.base import ContextBuilder
from app.ai.utils.errors import InvalidPrompt

if TYPE_CHECKING:
    from app.ai.schemas.project_ai_schema import (
        ProjectAssistantRequest,
        ProjectSprintSummary,
    )

# ponytail: show at most this many recent sprints; the rest collapse to a
# count. Keeps the prompt bounded — the LLM only needs the recent trend.
_MAX_SPRINTS = 10
_MAX_RISKS = 10


def _sprint_line(sprint: ProjectSprintSummary) -> str:
    """Format one sprint as ``name (status, completion%)`` — omit unknown parts."""
    status = sprint.status or "?"
    rate = (
        f"{round(sprint.completion_rate * 100)}%"
        if sprint.completion_rate is not None
        else "?"
    )
    return f"{sprint.name} ({status}, {rate})"


class ProjectContext(ContextBuilder):
    """Context for project assistant features."""

    def __init__(
        self,
        *,
        name: str | None = None,
        mode: str | None = None,
        recent_sprints: list[ProjectSprintSummary] | None = None,
        active_sprint: ProjectSprintSummary | None = None,
        total_tasks: int = 0,
        done_tasks: int = 0,
        blocked_tasks: int = 0,
        known_risks: list[str] | None = None,
        previous_summary: str | None = None,
    ) -> None:
        self.name = name
        self.mode = mode
        self.recent_sprints = recent_sprints or []
        self.active_sprint = active_sprint
        self.total_tasks = total_tasks
        self.done_tasks = done_tasks
        self.blocked_tasks = blocked_tasks
        self.known_risks = known_risks or []
        self.previous_summary = previous_summary

    @classmethod
    def from_payload(cls, req: ProjectAssistantRequest) -> ProjectContext:
        """Factory: build from a ProjectAssistantRequest payload."""
        return cls(
            name=req.name,
            mode=req.mode,
            recent_sprints=req.recent_sprints,
            active_sprint=req.active_sprint,
            total_tasks=req.total_tasks,
            done_tasks=req.done_tasks,
            blocked_tasks=req.blocked_tasks,
            known_risks=req.known_risks,
            previous_summary=req.previous_summary,
        )

    def build(self) -> dict[str, str]:
        """Return prompt variables as strings. Trust boundary: validate here."""
        if (
            not self.recent_sprints
            and self.active_sprint is None
            and self.total_tasks == 0
        ):
            raise InvalidPrompt("Not enough project data to analyze.")
        # Negatives are blocked at the schema (Field(ge=0)); only cross-field
        # consistency needs checking here.
        if self.total_tasks > 0 and self.done_tasks > self.total_tasks:
            raise InvalidPrompt("Inconsistent metrics: done tasks exceed total tasks.")

        project_lines = []
        if self.name:
            project_lines.append(f"Name: {self.name}")
        if self.mode:
            project_lines.append(f"Mode: {self.mode}")
        project = "\n".join(project_lines) if project_lines else "(no project metadata)"

        if self.recent_sprints:
            shown = [f"- {_sprint_line(s)}" for s in self.recent_sprints[:_MAX_SPRINTS]]
            if len(self.recent_sprints) > _MAX_SPRINTS:
                shown.append(f"…and {len(self.recent_sprints) - _MAX_SPRINTS} more")
            sprints = "\n".join(shown)
        else:
            sprints = "None"

        active_sprint = (
            _sprint_line(self.active_sprint)
            if self.active_sprint is not None
            else "None"
        )

        done_pct = (
            round(self.done_tasks / self.total_tasks * 100)
            if self.total_tasks > 0
            else 0
        )
        metrics = "\n".join(
            [
                f"Total tasks: {self.total_tasks}",
                f"Done: {self.done_tasks} ({done_pct}%)",
                f"Blocked: {self.blocked_tasks}",
            ]
        )

        if self.known_risks:
            risk_lines = [f"- {r}" for r in self.known_risks[:_MAX_RISKS]]
            if len(self.known_risks) > _MAX_RISKS:
                risk_lines.append(f"…and {len(self.known_risks) - _MAX_RISKS} more")
            risks_hint = "\n".join(risk_lines)
        else:
            risks_hint = "None"

        variables: dict[str, str] = {
            "project": project,
            "sprints": sprints,
            "active_sprint": active_sprint,
            "metrics": metrics,
            "risks_hint": risks_hint,
            "previous_summary": self.previous_summary or "None",
        }
        return {k: str(v) for k, v in self.redact(variables).items()}

    def metadata(self) -> dict[str, Any]:
        """Non-sensitive metadata."""
        return {
            "sprint_count": len(self.recent_sprints),
            "total_tasks": self.total_tasks,
            "done_tasks": self.done_tasks,
        }

    def estimated_tokens(self) -> int:
        # ponytail: rough ~4 chars/token heuristic, estimated from raw field
        # lengths so estimation never raises on invalid input. Upgrade path:
        # swap for a real tokenizer if cost precision matters.
        raw = " ".join(
            [
                self.name or "",
                self.mode or "",
                *(s.name for s in self.recent_sprints),
                self.active_sprint.name if self.active_sprint is not None else "",
                *self.known_risks,
            ]
        )
        # +40 chars covers the fixed numeric metrics block labels/values.
        return (len(raw) + 40) // 4
