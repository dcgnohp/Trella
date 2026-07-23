"""Automation rule registry primitive (Phase 10.4).

A rule is the tiny extensibility seam that maps a domain event type to a
background handler. This is the whole of the "rules engine": an in-code list of
``AutomationRule`` values wired to the dispatcher at startup. There is no rules
table, admin UI, or DSL — automations are code, reviewed like any other code.

ponytail: rules are in-code (no rules DB/UI). Ceiling: adding/removing an
automation is a code change + deploy, not a runtime toggle. Upgrade path = a
``automation_rule`` table + admin UI that the same registry reads from, behind
this dataclass so the wiring/consumers never change.

The concrete ``WORKFLOW_RULES`` list lives in :mod:`app.ai.workflow.automation`
(next to the handlers it references) to avoid a circular import — this module
stays limited to the dataclass + the ``Handler`` type alias.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.events import DomainEvent, Handler


@dataclass(frozen=True)
class AutomationRule:
    """Bind one event type to a background handler.

    ``handler`` is a ``Callable[[DomainEvent], Awaitable[None]]`` (see
    :data:`app.core.events.Handler`) so it plugs straight into
    :meth:`EventDispatcher.subscribe`.
    """

    event_type: type[DomainEvent]
    handler: Handler
