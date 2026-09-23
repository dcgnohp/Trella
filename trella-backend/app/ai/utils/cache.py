"""In-memory TTL + LRU cache for the AI pipeline (P6-B3).

A tiny per-process cache used by :class:`~app.ai.pipeline.middleware.cache.CacheMiddleware`
to serve identical unary AI calls without re-hitting the provider. Entries
expire after ``ttl_s`` seconds and the least-recently-used entry is evicted once
``maxsize`` is reached. ``time_fn`` is injectable so tests drive expiry with a
deterministic clock instead of sleeping.

ponytail: in-memory, single-process, guarded by no lock (asyncio pipeline is
single-threaded per event loop). Upgrade path when we need cross-process sharing
or persistence: back this with Redis behind the same ``get``/``set`` interface.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Any


class TTLCache:
    """LRU cache whose entries expire after a fixed time-to-live."""

    def __init__(
        self,
        maxsize: int = 512,
        ttl_s: float = 300.0,
        time_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        if maxsize < 1:
            raise ValueError("maxsize must be >= 1")
        self._maxsize = maxsize
        self._ttl_s = ttl_s
        self._time_fn = time_fn
        # key -> (expires_at, value); ordered by recency (oldest first).
        self._store: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Any | None:
        """Return the live value for ``key``, or ``None`` if missing/expired."""
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if self._time_fn() >= expires_at:
            del self._store[key]
            return None
        self._store.move_to_end(key)  # mark as most-recently-used
        return value

    def set(self, key: str, value: Any) -> None:
        """Store ``value`` under ``key``, evicting the LRU entry if full."""
        self._store[key] = (self._time_fn() + self._ttl_s, value)
        self._store.move_to_end(key)
        while len(self._store) > self._maxsize:
            self._store.popitem(last=False)  # drop least-recently-used
