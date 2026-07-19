"""AI tools layer: read-only, deterministic capabilities + their registry.

This package is the sanctioned boundary between the business-agnostic AI
platform core and business data. Tools read data and return non-sensitive
summaries; the registry provides discovery and capability lookup.
"""

from __future__ import annotations

from app.ai.tools.base import Tool, ToolContext, ToolResult, ToolSpec
from app.ai.tools.registry import ToolRegistry, get_tool_registry

__all__ = [
    "Tool",
    "ToolContext",
    "ToolRegistry",
    "ToolResult",
    "ToolSpec",
    "get_tool_registry",
]
