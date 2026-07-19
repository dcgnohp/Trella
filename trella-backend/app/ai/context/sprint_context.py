"""Sprint context builder (payload mode).

Builds prompt variables for sprint analytics from metrics the client sends in
the request body (``sprint_analysis.md``). It ONLY builds context and estimates
tokens: it never truncates prose — truncation is the sole responsibility of
``AIBaseService`` (``.ai/PHASE_3_PLAN.md`` P3-B4). ``build()`` is the trust
boundary: it validates that there is enough consistent data to analyze.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.ai.context.base import ContextBuilder
from app.ai.utils.errors import InvalidPrompt

if TYPE_CHECKING:
    from app.ai.schemas.sprint_ai_schema import SprintAnalysisRequest

# ponytail: show at most this many task titles; the rest collapse to a count.
# Prompts stay bounded and readable — the LLM does not need every title.
_MAX_TASKS = 20


def _bullets(items: list[str], limit: int) -> str:
    """Bullet list trimmed to ``limit`` with an overflow footer; ``None`` if empty."""
    if not items:
        return "None"
    shown = [f"- {t}" for t in items[:limit]]
    if len(items) > limit:
        shown.append(f"…and {len(items) - limit} more")
    return "\n".join(shown)


class SprintContext(ContextBuilder):
    """Context for sprint analysis features."""

    def __init__(
        self,
        *,
        goal: str | None = None,
        status: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        planned_points: float = 0.0,
        completed_points: float = 0.0,
        todo_count: int = 0,
        in_progress_count: int = 0,
        done_count: int = 0,
        velocity: float | None = None,
        blocked_tasks: list[str] | None = None,
        carried_over_tasks: list[str] | None = None,
        previous_summary: str | None = None,
    ) -> None:
        self.goal = goal
        self.status = status
        self.start_date = start_date
        self.end_date = end_date
        self.planned_points = planned_points
        self.completed_points = completed_points
        self.todo_count = todo_count
        self.in_progress_count = in_progress_count
        self.done_count = done_count
        self.velocity = velocity
        self.blocked_tasks = blocked_tasks or []
        self.carried_over_tasks = carried_over_tasks or []
        self.previous_summary = previous_summary

    @classmethod
    def from_payload(cls, req: SprintAnalysisRequest) -> SprintContext:
        """Factory: build from a SprintAnalysisRequest payload."""
        return cls(
            goal=req.goal,
            status=req.status,
            start_date=req.start_date,
            end_date=req.end_date,
            planned_points=req.planned_points,
            completed_points=req.completed_points,
            todo_count=req.todo_count,
            in_progress_count=req.in_progress_count,
            done_count=req.done_count,
            velocity=req.velocity,
            blocked_tasks=req.blocked_tasks,
            carried_over_tasks=req.carried_over_tasks,
            previous_summary=req.previous_summary,
        )

    def _total_tasks(self) -> int:
        return self.todo_count + self.in_progress_count + self.done_count

    def _completion_rate(self) -> int:
        """Completion rate as a whole percent — points-based, else task-based."""
        if self.planned_points > 0:
            return round(self.completed_points / self.planned_points * 100)
        total = self._total_tasks()
        if total > 0:
            return round(self.done_count / total * 100)
        return 0

    def build(self) -> dict[str, str]:
        """Return prompt variables as strings. Trust boundary: validate here."""
        total_tasks = self._total_tasks()
        has_any = (
            self.goal
            or self.planned_points > 0
            or self.completed_points > 0
            or total_tasks > 0
            or self.blocked_tasks
            or self.carried_over_tasks
        )
        if not has_any:
            raise InvalidPrompt("Not enough sprint data to analyze.")
        # Negatives are blocked at the schema (Field(ge=0)); only cross-field
        # consistency needs checking here.
        if self.planned_points > 0 and self.completed_points > self.planned_points:
            raise InvalidPrompt(
                "Inconsistent metrics: completed points exceed planned points."
            )

        sprint_lines = []
        if self.goal:
            sprint_lines.append(f"Goal: {self.goal}")
        if self.status:
            sprint_lines.append(f"Status: {self.status}")
        if self.start_date or self.end_date:
            start = self.start_date or "?"
            end = self.end_date or "?"
            sprint_lines.append(f"Dates: {start} → {end}")
        sprint = "\n".join(sprint_lines) if sprint_lines else "(no sprint metadata)"

        remaining = self.todo_count + self.in_progress_count
        velocity = f"{self.velocity:g}" if self.velocity is not None else "N/A"
        metrics = "\n".join(
            [
                f"Planned SP: {self.planned_points:g}",
                f"Completed SP: {self.completed_points:g}",
                f"Completion rate: {self._completion_rate()}%",
                f"Velocity: {velocity}",
                f"Todo: {self.todo_count}",
                f"In progress: {self.in_progress_count}",
                f"Done: {self.done_count}",
                f"Remaining (todo + in progress): {remaining}",
                f"Carry-over count: {len(self.carried_over_tasks)}",
            ]
        )

        variables: dict[str, str] = {
            "sprint": sprint,
            "metrics": metrics,
            "blocked_tasks": _bullets(self.blocked_tasks, _MAX_TASKS),
            "carried_over_tasks": _bullets(self.carried_over_tasks, _MAX_TASKS),
            "previous_summary": self.previous_summary or "None",
        }
        return {k: str(v) for k, v in self.redact(variables).items()}

    def metadata(self) -> dict[str, Any]:
        """Non-sensitive metadata."""
        return {
            "planned_points": self.planned_points,
            "completed_points": self.completed_points,
            "blocked_count": len(self.blocked_tasks),
            "carried_over_count": len(self.carried_over_tasks),
        }

    def estimated_tokens(self) -> int:
        # ponytail: rough ~4 chars/token heuristic, estimated from raw field
        # lengths so estimation never raises on invalid input. Upgrade path:
        # swap for a real tokenizer if cost precision matters.
        raw = " ".join(
            [
                self.goal or "",
                self.status or "",
                self.start_date or "",
                self.end_date or "",
                *self.blocked_tasks,
                *self.carried_over_tasks,
            ]
        )
        # +40 chars covers the fixed numeric metrics block labels/values.
        return (len(raw) + 40) // 4
