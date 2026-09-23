"""Tests for the conversation-scoped tool-result cache (P7-B5).

Uses an injected clock so TTL expiry is deterministic without sleeping.
"""

from __future__ import annotations

from app.ai.reasoning.session_memory import SessionMemory, make_key


class _Clock:
    """Manually advanced monotonic clock for deterministic TTL tests."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_put_then_get_returns_stored_value() -> None:
    mem = SessionMemory()
    mem.put("conv-1", "search", {"q": "hi", "limit": 5}, {"hits": 3})
    # Same call, args in a different order -> still a hit.
    assert mem.get("conv-1", "search", {"limit": 5, "q": "hi"}) == {"hits": 3}


def test_different_conversation_is_a_miss() -> None:
    mem = SessionMemory()
    mem.put("conv-1", "search", {"q": "hi"}, "cached")
    assert mem.get("conv-2", "search", {"q": "hi"}) is None


def test_different_args_is_a_miss() -> None:
    mem = SessionMemory()
    mem.put("conv-1", "search", {"q": "hi"}, "cached")
    assert mem.get("conv-1", "search", {"q": "bye"}) is None


def test_ttl_expiry_via_injected_clock() -> None:
    clock = _Clock()
    mem = SessionMemory(ttl_s=10.0, time_fn=clock)
    mem.put("conv-1", "search", {"q": "hi"}, "cached")

    clock.now = 9.999
    assert mem.get("conv-1", "search", {"q": "hi"}) == "cached"  # still live

    clock.now = 10.0
    assert mem.get("conv-1", "search", {"q": "hi"}) is None  # expired at ttl


def test_make_key_stable_for_reordered_args() -> None:
    a = make_key("conv-1", "tool", {"a": 1, "b": 2})
    b = make_key("conv-1", "tool", {"b": 2, "a": 1})
    assert a == b
