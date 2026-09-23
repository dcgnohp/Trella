"""AI Workflow Automation (Phase 10.4).

A background AI subsystem — analogous to ``app.ai.retrieval`` — that closes the
loop from a domain event to a HUMAN-APPROVED action:

    Event (Sprint completed)
      → AI drafts a proposal (sprint-summary document)   [analytics + generation]
      → parked as a Phase 8 ActionPlan + admin notified   [propose, NOT executed]
      → human approves                                     [existing approval endpoint]
      → execute                                            [Phase 8 ExecutionEngine, audited]

Invariant: NOTHING is ever executed automatically. Every guarded write flows
through the Phase 8 propose→approve→execute path, with RBAC re-checked at
execution. All behavior is gated behind ``AI_WORKFLOW_ENABLED`` (default OFF).

Isolation note: like ``app.ai.retrieval.sync``, this subsystem is a sanctioned
background boundary that MAY use the minimal business surface needed to close the
loop (loading the acting ``User``, emitting a Notification to the approver). The
guarded mutation itself (creating the document) is NEVER done here — only
proposed via the Phase 8 write-tool path.
"""
