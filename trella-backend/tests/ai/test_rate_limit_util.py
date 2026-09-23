"""P6-B4 check: token-bucket limiter with a deterministic injected clock.

No network, no DB. A mutable ``clock`` closure feeds ``time_fn`` so refill is
tested without sleeping.
"""

from app.ai.utils.rate_limit import TokenBucketRateLimiter


def test_allows_capacity_calls_then_blocks() -> None:
    limiter = TokenBucketRateLimiter(capacity=3, refill_per_s=1.0, time_fn=lambda: 0.0)
    assert [limiter.allow("u") for _ in range(3)] == [True, True, True]
    # Bucket is empty and the frozen clock never refills.
    assert limiter.allow("u") is False


def test_refills_over_time_via_injected_clock() -> None:
    now = 0.0
    limiter = TokenBucketRateLimiter(capacity=2, refill_per_s=0.5, time_fn=lambda: now)
    assert limiter.allow("u") is True
    assert limiter.allow("u") is True
    assert limiter.allow("u") is False  # empty

    now = 2.0  # 2s * 0.5 tok/s = 1 token refilled
    assert limiter.allow("u") is True
    assert limiter.allow("u") is False


def test_refill_is_capped_at_capacity() -> None:
    now = 0.0
    limiter = TokenBucketRateLimiter(capacity=2, refill_per_s=1.0, time_fn=lambda: now)
    assert limiter.allow("u") is True  # 1 left
    now = 1000.0  # would refill far beyond capacity
    assert limiter.allow("u") is True
    assert limiter.allow("u") is True
    assert limiter.allow("u") is False  # only capacity tokens, not more


def test_keys_are_independent() -> None:
    limiter = TokenBucketRateLimiter(capacity=1, refill_per_s=1.0, time_fn=lambda: 0.0)
    assert limiter.allow("a") is True
    assert limiter.allow("a") is False
    # A different key has its own full bucket.
    assert limiter.allow("b") is True
    assert limiter.allow("b") is False
