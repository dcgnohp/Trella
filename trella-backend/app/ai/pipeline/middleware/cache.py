"""Cache middleware (P6-B3): serve identical unary AI calls from memory.

Unary-only. ``supports_streaming = False`` so the runner skips it for streams
(never cache a partial/streamed response). On a hit it returns the stored
:class:`AIResult` without calling the provider; on a miss it delegates, stores
the result, and returns it.

Cacheability contract
---------------------
The middleware can't cleanly import the feature registry per call, so the caller
passes the policy through ``ctx.payload``:

* ``ctx.payload["cacheable"]`` (default ``True``) — when falsy, skip caching
  entirely (``ctx.trace.cache_decision = "skip"``).
* ``ctx.payload["cache_tier"]`` (default ``"medium"``) — selects a TTL bucket
  from ``tier_ttls``; today the shared cache uses one TTL, so the tier only
  affects which cache instance a caller wires in. ``tier_ttls`` is accepted for
  forward-compat and documentation of the intended buckets.

Cache key
---------
Built from ``ctx.feature``, ``ctx.model``, ``ctx.params["prompt_version"]`` and a
stable hash of ``ctx.payload`` with non-serializable / policy-only entries
excluded (e.g. ``response_model`` types, ``cacheable``/``cache_tier``). Equal
inputs produce equal keys. Only the resulting digest touches ``ctx.trace`` — no
prompt or completion content is ever recorded.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.ai.pipeline.base import AICallContext, AIMiddleware, AIResult, Handler
from app.ai.utils.cache import TTLCache

# Payload keys that describe cache policy or hold non-serializable objects; they
# must not participate in the cache key.
_EXCLUDED_PAYLOAD_KEYS = frozenset({"cacheable", "cache_tier", "response_model"})


class CacheMiddleware(AIMiddleware):
    """Cache unary AI results keyed by feature + model + prompt version + payload."""

    supports_streaming = False  # unary only; never cache streaming

    def __init__(
        self, cache: TTLCache, tier_ttls: dict[str, float] | None = None
    ) -> None:
        self._cache = cache
        # ponytail: single shared cache instance today, so tier_ttls is advisory
        # metadata only. Upgrade path: one TTLCache per tier keyed off this map.
        self._tier_ttls = tier_ttls or {"long": 3600.0, "medium": 300.0, "none": 0.0}

    async def handle(self, ctx: AICallContext, nxt: Handler) -> AIResult:
        if not ctx.payload.get("cacheable", True):
            ctx.trace.cache_decision = "skip"
            return await nxt(ctx)

        key = self._build_key(ctx)
        cached: AIResult | None = self._cache.get(key)
        if cached is not None:
            ctx.trace.cache_decision = "hit"
            return cached

        ctx.trace.cache_decision = "miss"
        result = await nxt(ctx)
        self._cache.set(key, result)
        return result

    def _build_key(self, ctx: AICallContext) -> str:
        prompt_version = ctx.params.get("prompt_version", "")
        payload_repr = _stable_repr(
            {k: v for k, v in ctx.payload.items() if k not in _EXCLUDED_PAYLOAD_KEYS}
        )
        material = "\u0000".join(
            (ctx.feature, ctx.model or "", str(prompt_version), payload_repr)
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _stable_repr(value: Any) -> str:
    """Deterministic string for a payload; falls back to ``str`` for odd types."""
    return json.dumps(value, sort_keys=True, default=str)
