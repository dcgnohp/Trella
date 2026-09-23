"""MCP integration (Phase 10.1): consume external MCP servers as READ-ONLY tools.

A provider-of-tools plugged into the existing Tool framework (Registry / Executor
/ Budget / SSE). Imports the MCP SDK + the tool framework only — NO business
modules. Default OFF (`AI_MCP_ENABLED`); servers come only from an allow-list
config file. Mutating MCP tools are NOT registered here (deferred to a
Write-Agent milestone: ActionProposal → Approval → Execution).

W0 (frozen): ``config`` (allow-list models + loader), ``errors`` (codes),
``contracts`` (McpTransport / McpClientProtocol / DiscoveredTool /
RegistrationSummary). Implemented in parallel: ``transport`` + ``client``
(Agent A), ``adapter`` + ``registration`` (Agent B).
"""
