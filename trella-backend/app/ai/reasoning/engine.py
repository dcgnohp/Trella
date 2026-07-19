"""Reasoning Engine — the bounded reason→act→observe loop (P7-B7).

The engine drives a conversation forward: it asks the provider to reason, lets
the model request tools via provider tool-calling, executes each tool through
the safe :class:`ToolExecutor`, records observations back into the message
history (and short-term :class:`SessionMemory`), then reasons again — bounded by
``max_tool_calls`` so a misbehaving model can never loop forever.

It is deliberately provider- and business-agnostic: it depends only on the
:class:`AIProvider` interface and the tools layer (``ToolRegistry``/
``ToolExecutor``/``ToolContext``), never a vendor SDK and never a business
service/repository/model. It yields *normalized* :data:`ReasoningEvent`s that a
later router task maps onto SSE frames.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from app.ai.agent.action_plan import (
    ActionPlanStore,
    ActionProposal,
    get_action_plan_store,
)
from app.ai.providers.base import (
    AIProvider,
    ProviderMessage,
    TextChunk,
    ToolCallRequest,
)
from app.ai.reasoning.budget import BudgetTracker, ToolBudget
from app.ai.reasoning.session_memory import SessionMemory
from app.ai.tools.base import ToolContext, ToolResult
from app.ai.tools.executor import ToolExecutor
from app.ai.tools.registry import ToolRegistry, get_tool_registry
from app.ai.utils.errors import InvalidPrompt


@dataclass(frozen=True)
class ProgressEvent:
    """A coarse "what the engine is doing now" signal for the UI."""

    kind: str  # planning|searching_workspace|searching_tasks|reading_sprint|
    #             reading_documentation|generating_response|complete
    label: str  # human label, e.g. "Searching tasks..."


@dataclass(frozen=True)
class TextEvent:
    """A streamed text delta of the model's answer."""

    text: str


@dataclass(frozen=True)
class ToolCallEvent:
    """The engine is about to run tool ``name`` (advertising ``capability``)."""

    name: str
    capability: str | None


@dataclass(frozen=True)
class ToolResultEvent:
    """Outcome of a tool run, without leaking the (possibly sensitive) content.

    ``citations`` carries NON-sensitive document source citations (id, title,
    workspace_id) when a retrieval tool produced them — never chunk ids, vector
    scores, or embedding metadata.
    """

    name: str
    ok: bool
    source: str | None
    citations: list[dict[str, Any]] | None = None


@dataclass(frozen=True)
class ActionProposalEvent:
    """A mutating tool was PROPOSED (not executed) — awaiting approval (P8)."""

    action_id: str
    tool_name: str
    preview: str
    capability: str | None


@dataclass(frozen=True)
class PlanReadyEvent:
    """All proposals for this turn are parked in an ActionPlan (P8)."""

    plan_id: str
    action_count: int


ReasoningEvent = (
    ProgressEvent
    | TextEvent
    | ToolCallEvent
    | ToolResultEvent
    | ActionProposalEvent
    | PlanReadyEvent
)

# ponytail: cap how much of a tool result is fed back to the model. Large read
# results (long lists) inflate the context window and cost while the model
# rarely needs every byte. Ceiling: crude char truncation of the serialized
# content. Upgrade path = structured, per-tool observation summarizers.
_MAX_OBSERVATION_CHARS = 4000

# Transient tool errors worth ONE retry. Deterministic outcomes
# (invalid_args / not_authorized / not_found / unknown_tool) are never retried.
_RETRYABLE_ERRORS = frozenset({"timeout", "tool_error"})


def _summarize_observation(result: ToolResult) -> str:
    """Serialize a read tool result for the model, truncating huge content.

    Keeps valid JSON: when the serialized content exceeds the cap it is replaced
    by a truncated string note so the model still sees a usable, bounded value.
    """
    content = result.content
    serialized = json.dumps(content, default=str) if content is not None else ""
    if len(serialized) > _MAX_OBSERVATION_CHARS:
        content = serialized[:_MAX_OBSERVATION_CHARS] + "…(truncated)"
    return json.dumps(
        {"ok": result.ok, "content": content, "error": result.error},
        default=str,
    )


def _extract_citations(content: Any) -> list[dict[str, Any]] | None:
    """Collect NON-sensitive document source citations from a tool result.

    Generic convention: a result whose content is a list of items each carrying
    a ``source`` dict with ``type == "document"`` contributes those source dicts
    (id/title/workspace_id) as citations. Any future retrieval tool that emits
    the same shape gets citations for free. Returns None when there are none.
    """
    if not isinstance(content, list):
        return None
    citations: list[dict[str, Any]] = []
    for item in content:
        if isinstance(item, dict):
            src = item.get("source")
            if isinstance(src, dict) and src.get("type") == "document":
                citations.append(src)
    return citations or None


# spec.category -> (ProgressEvent.kind, label). Unknown/None falls back to a
# generic "searching" so the UI always has a sensible label.
_CATEGORY_PROGRESS: dict[str, tuple[str, str]] = {
    "workspace": ("searching_workspace", "Searching workspace..."),
    "project": ("searching_workspace", "Searching workspace..."),
    "user": ("searching_workspace", "Searching workspace..."),
    "board": ("searching_workspace", "Searching boards..."),
    "task": ("searching_tasks", "Searching tasks..."),
    "sprint": ("reading_sprint", "Reading sprint..."),
    "knowledge": ("reading_documentation", "Reading documentation..."),
}


def _progress_for_category(category: str | None) -> ProgressEvent:
    """Map a tool's category to the progress signal shown while it runs."""
    kind, label = _CATEGORY_PROGRESS.get(
        category or "", ("searching_workspace", "Searching...")
    )
    return ProgressEvent(kind, label)


class ReasoningEngine:
    """Runs the bounded reason→act→observe loop over an :class:`AIProvider`."""

    def __init__(
        self,
        provider: AIProvider,
        registry: ToolRegistry | None = None,
        executor: ToolExecutor | None = None,
        memory: SessionMemory | None = None,
        *,
        max_tool_calls: int = 5,
        budget: ToolBudget | None = None,
        plan_store: ActionPlanStore | None = None,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> None:
        self.provider = provider
        self.registry = registry or get_tool_registry()
        self.executor = executor or ToolExecutor(self.registry)
        self.memory = memory or SessionMemory()
        self.max_tool_calls = max_tool_calls
        # ponytail: a provided budget wins; otherwise map the Phase 7 count-only
        # knob onto a ToolBudget with latency/cost DISABLED (<=0) so pure-count
        # behavior is identical to Phase 7. max_iterations = max_tool_calls + 1
        # keeps the old "N executions + one final reasoning turn" turn bound.
        self._budget = budget or ToolBudget(
            max_tool_calls=max_tool_calls,
            max_iterations=max_tool_calls + 1,
            max_latency_s=0.0,
            max_cost=0.0,
        )
        self.plan_store = plan_store or get_action_plan_store()
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout

    def run(
        self,
        *,
        system_message: str,
        messages: list[ProviderMessage],
        tool_ctx: ToolContext,
        conversation_id: str,
    ) -> AsyncIterator[ReasoningEvent]:
        """Stream normalized reasoning events for a conversation.

        Validates eagerly (before returning the generator, like
        ``AIChatService.chat``): an empty ``messages`` raises ``InvalidPrompt``
        on the ``run(...)`` call itself, not on first iteration.
        """
        if not messages:
            raise InvalidPrompt("Conversation has no messages.")

        return self._run(
            system_message=system_message,
            messages=messages,
            tool_ctx=tool_ctx,
            conversation_id=conversation_id,
        )

    async def _execute_read_with_retry(
        self, call: ToolCallRequest, tool_ctx: ToolContext
    ) -> ToolResult:
        """Run a READ tool, retrying ONCE on a transient error.

        ponytail: read tools are idempotent, so a single retry on ``timeout`` /
        generic ``tool_error`` smooths over a transient DB/provider blip.
        Deterministic errors (invalid_args/not_authorized/not_found/unknown_tool)
        are returned as-is — retrying them just wastes a call.
        """
        result = await self.executor.execute(call.name, call.arguments, tool_ctx)
        if not result.ok and result.error in _RETRYABLE_ERRORS:
            result = await self.executor.execute(call.name, call.arguments, tool_ctx)
        return result

    async def _run(
        self,
        *,
        system_message: str,
        messages: list[ProviderMessage],
        tool_ctx: ToolContext,
        conversation_id: str,
    ) -> AsyncIterator[ReasoningEvent]:
        tools_schema = [
            {
                "type": "function",
                "function": {
                    "name": s.name,
                    "description": s.description,
                    "parameters": s.parameters,
                },
            }
            for s in self.registry.list_specs()
        ]
        # Planning/tool-selection/CoT-suppression/reflection guidance lives in
        # the caller's ``system_message`` (rendered from prompts/agent_reasoning.md
        # on disk), keeping the engine prompt-agnostic. The engine still emits the
        # ``planning`` progress signal below.
        convo: list[ProviderMessage] = [
            ProviderMessage("system", system_message),
            *messages,
        ]

        yield ProgressEvent("planning", "Planning...")

        tracker = BudgetTracker(self._budget)
        proposals: list[ActionProposal] = []
        # Turn cap: the budget's iteration axis bounds the reason-again cycles.
        # With the Phase 7 mapping this is max_tool_calls executions + one final
        # reasoning turn. A hard range() backstop guarantees termination even if
        # a caller passes a budget with the iteration axis disabled.
        hard_cap = (
            self._budget.max_iterations
            if self._budget.max_iterations > 0
            else self.max_tool_calls + 1
        )
        for _turn in range(hard_cap):
            tracker.record_iteration()
            if tracker.exceeded():
                break

            pending: list[ToolCallRequest] = []
            # ponytail: the engine calls the AIProvider abstraction directly, not
            # the Phase 6 middleware pipeline; per-call telemetry/cost via the
            # pipeline is the upgrade path (the Testing profile runs an empty
            # pipeline anyway).
            async for ev in self.provider.stream_tools(
                messages=convo,
                tools=tools_schema,
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                timeout=self.timeout,
            ):
                if isinstance(ev, TextChunk):
                    # ponytail: text is streamed live even on tool-call turns;
                    # well-behaved function-calling turns emit little/no preamble.
                    # Upgrade path = buffer text and flush only on the final turn.
                    yield TextEvent(ev.text)
                else:
                    pending.append(ev)

            if not pending:
                # The model produced its final answer — stop reasoning.
                break

            # Record the assistant's tool-call turn so the next request has the
            # tool_call ids the tool-result messages refer back to.
            convo.append(
                ProviderMessage(role="assistant", content="", tool_calls=pending)
            )

            budget_hit = False
            for i, call in enumerate(pending):
                # ponytail: count the attempt, then a strict `>` check blocks the
                # over-budget call — this mirrors Phase 7's `calls_made >= N` guard
                # exactly (at most N executions) while reusing BudgetTracker so the
                # latency/cost axes come for free once enabled.
                tracker.record_tool_call()
                if tracker.exceeded():
                    # Budget spent: tell the model (for this call and any not run)
                    # instead of executing, then break to final synthesis.
                    for not_run in pending[i:]:
                        convo.append(
                            ProviderMessage(
                                role="tool",
                                content=json.dumps({"error": "budget_exceeded"}),
                                tool_call_id=not_run.id,
                            )
                        )
                    budget_hit = True
                    break

                tool = self.registry.get(call.name)
                category = tool.spec.category if tool else None
                capability = tool.spec.capability if tool else None

                yield _progress_for_category(category)
                yield ToolCallEvent(call.name, capability)

                if tool is not None and tool.spec.mutating:
                    # WRITE tool: PROPOSE, never execute. executor.execute runs the
                    # tool's run() = the safe PROPOSE phase, returning content
                    # {"preview", "args"}; apply() is only ever called later by the
                    # Execution Engine after human approval.
                    result = await self.executor.execute(
                        call.name, call.arguments, tool_ctx
                    )
                    if not result.ok:
                        # Invalid args (etc.): surface the error and let the model
                        # correct — do NOT create a proposal.
                        yield ToolResultEvent(call.name, False, result.source)
                        convo.append(
                            ProviderMessage(
                                role="tool",
                                content=json.dumps(
                                    {"ok": False, "error": result.error},
                                    default=str,
                                ),
                                tool_call_id=call.id,
                            )
                        )
                        continue

                    content = result.content if isinstance(result.content, dict) else {}
                    norm_args = content.get("args") or call.arguments
                    preview = content.get("preview") or f"{call.name} action"
                    action_id = uuid4().hex
                    scope: dict[str, str] = {
                        "workspace_id": (
                            str(tool_ctx.workspace_id) if tool_ctx.workspace_id else ""
                        )
                    }
                    for key in ("project_id", "task_id", "sprint_id"):
                        val = norm_args.get(key)
                        if val is not None:
                            scope[key] = str(val)

                    proposals.append(
                        ActionProposal(
                            action_id=action_id,
                            tool_name=call.name,
                            args=norm_args,
                            preview=preview,
                            capabilities=tool.spec.capabilities,
                            scope=scope,
                            permission_status="allowed",
                        )
                    )
                    yield ActionProposalEvent(action_id, call.name, preview, capability)
                    # Feed back a pending marker so the model knows it's proposed
                    # (awaiting approval) and does NOT try to loop-execute it.
                    convo.append(
                        ProviderMessage(
                            role="tool",
                            content=json.dumps(
                                {"status": "proposed", "action_id": action_id}
                            ),
                            tool_call_id=call.id,
                        )
                    )
                    continue

                # READ tool (or unknown tool): Phase 7 path + refinements
                # (transient retry + observation summarization).
                cached = self.memory.get(conversation_id, call.name, call.arguments)
                if cached is not None:
                    result = cached
                else:
                    result = await self._execute_read_with_retry(call, tool_ctx)
                    self.memory.put(conversation_id, call.name, call.arguments, result)

                yield ToolResultEvent(
                    call.name,
                    result.ok,
                    result.source,
                    _extract_citations(result.content),
                )

                convo.append(
                    ProviderMessage(
                        role="tool",
                        content=_summarize_observation(result),
                        tool_call_id=call.id,
                    )
                )

            if budget_hit:
                break

            yield ProgressEvent("generating_response", "Generating response...")

        # Park any proposed writes in a plan for later approve+execute.
        if proposals:
            plan = self.plan_store.create(proposals)
            yield PlanReadyEvent(plan.plan_id, len(proposals))

        yield ProgressEvent("complete", "Complete")
