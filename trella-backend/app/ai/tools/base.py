"""Tool framework primitives (P7-B1).

A **tool** is one read-only, deterministic capability the AI can invoke to look
up business data. The tools layer is the *sanctioned* boundary that may
reference business types (``Session``, ``User``): the AI platform core stays
business-agnostic, and tools are where the two worlds meet. Everything above a
tool (Reasoning Engine, Executor) works only with ``ToolSpec``/``ToolResult``
and never imports concrete tools.

Phase 7 invariant: a tool MUST NOT call AI, invoke other tools, run workflows,
or modify data. It reads, summarizes, and returns -- nothing else.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlmodel import Session

from app.models.users_model import User


@dataclass
class ToolContext:
    """Execution context threaded from the router (CurrentUser + DB session)."""

    session: Session
    user: User
    workspace_id: UUID | None = None


@dataclass(frozen=True)
class ToolSpec:
    """Static description of a tool -- identity, schema, and taxonomy.

    ``parameters`` is a JSON Schema dict so specs can be handed straight to a
    provider's function-calling API. ``name`` must be unique, snake_case, and
    function-call safe; ``capability`` is a short id (e.g. ``"task.lookup"``)
    used to resolve a tool independent of its display name.

    Phase 8 taxonomy:
    * ``capabilities`` -- coarse capability tags the planner can select on:
      ``read`` / ``write`` / ``analytics`` / ``knowledge`` / ``workflow`` /
      ``admin``. Distinct from ``capability`` (the specific resolve id). Defaults
      to ``{"read"}`` so every existing read tool is unchanged.
    * ``mutating`` -- ``True`` for tools that CHANGE data. A mutating tool is
      NEVER executed in the reasoning loop; it produces an Action Proposal that
      must be approved and run by the Execution Engine (Human-in-the-loop).
    """

    name: str
    description: str
    parameters: dict[str, Any]
    category: str
    capability: str
    capabilities: frozenset[str] = frozenset({"read"})
    mutating: bool = False


@dataclass
class ToolResult:
    """Outcome of a tool run: a non-sensitive, JSON-serializable summary.

    ``error`` carries a short machine code (``"not_authorized"``, ``"not_found"``,
    ``"invalid_args"``) rather than a message, and ``source`` names the data
    kind used so callers can surface "data sources used".
    """

    ok: bool
    content: Any = None
    error: str | None = None
    source: str | None = None


class Tool(ABC):
    """One read-only, deterministic capability.

    MUST NOT call AI, call other tools, execute workflows, or modify data
    (Phase 7 is read-only). Subclasses set the ``spec`` class attribute and
    implement ``run``.
    """

    spec: ToolSpec

    @abstractmethod
    async def run(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        """Execute the capability against ``args`` within ``ctx``."""
        ...


class WriteTool(Tool):
    """A mutating capability (Phase 8), split into propose + apply.

    ``run`` runs the PROPOSE phase only: it validates ``args`` and builds a
    human-readable ``preview``, returning a ``ToolResult`` whose ``content`` is
    ``{"preview": str, "args": <normalized args>}`` — it performs NO side effect.
    The Reasoning Engine turns this into an Action Proposal; a write is NEVER
    executed inside the reasoning loop.

    ``apply`` performs the actual business write and is called ONLY by the
    Execution Engine after the user approves the proposal (Human-in-the-loop),
    with permissions re-checked at execution time. ``spec.mutating`` must be
    ``True`` and ``spec.capabilities`` should include ``"write"``.
    """

    @abstractmethod
    async def apply(self, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
        """Perform the mutation for an APPROVED action. Execution Engine only."""
        ...
