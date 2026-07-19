"""P6-B6 checks: aggregate MetricsCollector.

Records a handful of calls and asserts the snapshot has correct counts,
cache hit/miss tallies, averages, ``cost_per_successful_request`` (guarded
against divide-by-zero), and daily/monthly cost rollups.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.ai.telemetry.metrics import MetricsCollector


def _collector() -> MetricsCollector:
    # Fixed clock so the daily/monthly rollup keys are deterministic.
    return MetricsCollector(now_fn=lambda: datetime(2024, 5, 17, tzinfo=timezone.utc))


def test_snapshot_counts_and_averages() -> None:
    c = _collector()
    c.record(
        feature="chat",
        provider="openai",
        model="gpt-4.1",
        success=True,
        latency_ms=100,
        cost=0.01,
        cache_decision="miss",
    )
    c.record(
        feature="chat",
        provider="openai",
        model="gpt-4.1",
        success=True,
        latency_ms=300,
        cost=0.03,
        cache_decision="hit",
    )
    c.record(
        feature="chat",
        provider="openai",
        model="gpt-4.1",
        success=False,
        latency_ms=200,
        cost=None,
        cache_decision="skip",
    )

    key = c.snapshot()["by_key"]["chat:openai:gpt-4.1"]
    assert key["requests"] == 3
    assert key["successes"] == 2
    assert key["failures"] == 1
    assert key["cache_hits"] == 1
    assert key["cache_misses"] == 1
    assert key["avg_latency_ms"] == 200.0  # (100+300+200)/3
    assert key["total_cost"] == 0.04
    assert key["avg_cost"] == round(0.04 / 3, 6)
    # total_cost / successes, not / requests
    assert key["cost_per_successful_request"] == 0.02


def test_cost_per_successful_request_guards_zero() -> None:
    c = _collector()
    c.record(
        feature="chat",
        provider="openai",
        model="gpt-4.1",
        success=False,
        latency_ms=50,
        cost=None,
        cache_decision="none",
    )
    key = c.snapshot()["by_key"]["chat:openai:gpt-4.1"]
    assert key["cost_per_successful_request"] is None


def test_daily_and_monthly_rollups() -> None:
    c = _collector()
    c.record(
        feature="chat",
        provider="openai",
        model="gpt-4.1",
        success=True,
        latency_ms=100,
        cost=0.01,
        cache_decision="miss",
    )
    c.record(
        feature="summary",
        provider="openai",
        model="gpt-4.1",
        success=True,
        latency_ms=100,
        cost=0.02,
        cache_decision="miss",
    )
    snap = c.snapshot()
    assert snap["daily"]["2024-05-17"] == {"requests": 2, "total_cost": 0.03}
    assert snap["monthly"]["2024-05"] == {"requests": 2, "total_cost": 0.03}


def test_reset_clears_everything() -> None:
    c = _collector()
    c.record(
        feature="chat",
        provider="openai",
        model="gpt-4.1",
        success=True,
        latency_ms=100,
        cost=0.01,
        cache_decision="miss",
    )
    c.reset()
    snap = c.snapshot()
    assert snap["by_key"] == {}
    assert snap["daily"] == {}
    assert snap["monthly"] == {}
