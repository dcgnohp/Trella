"""Conversation-scoped tool-result cache for the reasoning loop (P7-B5).

Short-term memory so the reasoning loop doesn't call the same tool twice within
one conversation. Keyed by ``(conversation_id, tool_name, sorted-args hash)`` and
backed by :class:`~app.ai.utils.cache.TTLCache`, so entries auto-expire and the
least-recently-used entry is evicted once full.

This is NOT conversation persistence, NOT long-term memory, and has NO database.

ponytail: in-memory, per-process, no lock (single reasoning loop per event loop).
Upgrade path when we need cross-process sharing or persistence: swap the backing
TTLCache for Redis behind the same ``get``/``put`` interface.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from typing import Any

from app.ai.utils.cache import TTLCache


def make_key(conversation_id: str, tool_name: str, args: dict[str, Any]) -> str:
    """Stable key from conversation + tool + sorted-args hash.

    ``sort_keys=True`` makes the hash independent of dict insertion order, so the
    same logical call maps to the same key regardless of how args were built.
    """
    args_hash = hashlib.sha256(
        json.dumps(args, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    return f"{conversation_id}\x00{tool_name}\x00{args_hash}"


class SessionMemory:
    """In-memory, conversation-scoped tool-result cache with TTL auto-eviction."""

    def __init__(
        self,
        ttl_s: float = 300.0,
        maxsize: int = 1024,
        time_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl_s=ttl_s, time_fn=time_fn)

    def get(
        self, conversation_id: str, tool_name: str, args: dict[str, Any]
    ) -> Any | None:
        """Return the cached result for this call, or ``None`` if missing/expired."""
        return self._cache.get(make_key(conversation_id, tool_name, args))

    def put(
        self,
        conversation_id: str,
        tool_name: str,
        args: dict[str, Any],
        result: Any,
    ) -> None:
        """Cache ``result`` for this conversation + tool + args."""
        self._cache.set(make_key(conversation_id, tool_name, args), result)
