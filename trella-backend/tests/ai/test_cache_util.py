"""Tests for the in-memory TTL + LRU cache (P6-B3).

Uses an injected clock so expiry is deterministic without sleeping.
"""

from __future__ import annotations

import pytest

from app.ai.utils.cache import TTLCache


class _Clock:
    """Manually advanced monotonic clock for deterministic TTL tests."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_get_returns_stored_value() -> None:
    cache: TTLCache = TTLCache()
    cache.set("k", 123)
    assert cache.get("k") == 123


def test_get_missing_key_returns_none() -> None:
    cache: TTLCache = TTLCache()
    assert cache.get("absent") is None


def test_ttl_expiry_via_injected_clock() -> None:
    clock = _Clock()
    cache: TTLCache = TTLCache(ttl_s=10.0, time_fn=clock)
    cache.set("k", "v")

    clock.now = 9.999
    assert cache.get("k") == "v"  # still live

    clock.now = 10.0
    assert cache.get("k") is None  # expired at exactly ttl


def test_lru_eviction_at_maxsize() -> None:
    cache: TTLCache = TTLCache(maxsize=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.get("a")  # touch "a" so "b" becomes least-recently-used
    cache.set("c", 3)  # evicts "b"

    assert cache.get("a") == 1
    assert cache.get("b") is None
    assert cache.get("c") == 3


def test_set_overwrites_and_refreshes_ttl() -> None:
    clock = _Clock()
    cache: TTLCache = TTLCache(ttl_s=10.0, time_fn=clock)
    cache.set("k", "old")
    clock.now = 5.0
    cache.set("k", "new")  # resets expiry to now + ttl
    clock.now = 14.0
    assert cache.get("k") == "new"


def test_maxsize_must_be_positive() -> None:
    with pytest.raises(ValueError, match="maxsize must be >= 1"):
        TTLCache(maxsize=0)
