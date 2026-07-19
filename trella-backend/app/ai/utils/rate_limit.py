"""In-process token-bucket rate limiting for AI endpoints.

Rate limiting is the pipeline's outermost concern, enforced at the router
boundary where the authenticated user identity is available (see
``.ai/AI_ARCHITECTURE.md`` and ``.ai/PHASE_6_PLAN.md`` P6-B4). This keeps the
feature services business-agnostic — they never see ``CurrentUser``.

ponytail: in-memory, per-process bucket. Ceiling: state is not shared across
worker processes/hosts, so effective limits scale with the worker count.
Upgrade path is a shared store (e.g. Redis ``INCR`` + TTL) behind the same
``allow(key)`` interface.
"""

from __future__ import annotations

import time
from collections.abc import Callable


class TokenBucketRateLimiter:
    """Per-key token bucket. In-memory, per-process (ponytail: upgrade = Redis).

    Each key gets an independent bucket that starts full at ``capacity`` and
    refills continuously at ``refill_per_s`` tokens/second (capped at
    ``capacity``). ``allow`` consumes one token when available. ``time_fn`` is
    injectable so tests can drive a deterministic clock.
    """

    def __init__(
        self,
        capacity: int = 30,
        refill_per_s: float = 0.5,
        time_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        if refill_per_s <= 0:
            raise ValueError("refill_per_s must be > 0")
        self._capacity = capacity
        self._refill_per_s = refill_per_s
        self._time_fn = time_fn
        # key -> (tokens, last_refill_timestamp)
        self._buckets: dict[str, tuple[float, float]] = {}

    def allow(self, key: str) -> bool:
        """Consume one token for ``key``; return ``True`` if it was available."""
        now = self._time_fn()
        tokens, last = self._buckets.get(key, (float(self._capacity), now))
        # Refill for the elapsed interval, capped at capacity.
        tokens = min(float(self._capacity), tokens + (now - last) * self._refill_per_s)
        if tokens >= 1.0:
            self._buckets[key] = (tokens - 1.0, now)
            return True
        self._buckets[key] = (tokens, now)
        return False


# Module-level default shared across requests in-process. The router uses this
# instance so per-user limits persist between requests within a worker.
_default_limiter = TokenBucketRateLimiter()


def default_limiter() -> TokenBucketRateLimiter:
    """Return the shared process-wide limiter instance."""
    return _default_limiter
