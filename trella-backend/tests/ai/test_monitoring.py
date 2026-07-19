"""P6-B7 checks: Monitoring tier (alert conditions over a metrics snapshot).

Builds snapshots that trip each rule and asserts the evaluator returns the
expected alerts (rule / severity / scope / value). Also asserts a healthy
snapshot is silent, that ``HighErrorRateRule`` respects ``min_requests``, and
that ``CostSpikeRule`` fires on a daily rollup over threshold.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.ai.telemetry.metrics import MetricsCollector
from app.ai.telemetry.monitoring import (
    Alert,
    AlertSeverity,
    CostSpikeRule,
    HighErrorRateRule,
    HighLatencyRule,
    MonitorEvaluator,
    ProviderOutageRule,
    default_rules,
)


def _entry(**over: object) -> dict[str, object]:
    base: dict[str, object] = {
        "feature": "chat",
        "provider": "openai",
        "model": "gpt-4.1",
        "requests": 1,
        "successes": 1,
        "failures": 0,
        "cache_hits": 0,
        "cache_misses": 0,
        "avg_latency_ms": 100.0,
        "total_cost": 0.0,
        "avg_cost": 0.0,
        "cost_per_successful_request": 0.0,
    }
    base.update(over)
    return base


def test_high_latency_rule_fires_over_threshold() -> None:
    snap = {"by_key": {"chat:openai:gpt-4.1": _entry(avg_latency_ms=5000.0)}}
    alerts = HighLatencyRule(threshold_ms=1000).evaluate(snap)
    assert len(alerts) == 1
    a = alerts[0]
    assert a.rule == "high_latency"
    assert a.severity is AlertSeverity.WARNING
    assert a.scope == "chat:openai:gpt-4.1"
    assert a.value == 5000.0


def test_high_latency_ignores_none_latency() -> None:
    snap = {"by_key": {"chat:openai:gpt-4.1": _entry(avg_latency_ms=None)}}
    assert HighLatencyRule(threshold_ms=1000).evaluate(snap) == []


def test_high_error_rate_fires_and_reports_rate() -> None:
    snap = {
        "by_key": {"chat:openai:gpt-4.1": _entry(requests=10, successes=4, failures=6)}
    }
    alerts = HighErrorRateRule(threshold=0.5, min_requests=1).evaluate(snap)
    assert len(alerts) == 1
    assert alerts[0].rule == "high_error_rate"
    assert alerts[0].severity is AlertSeverity.CRITICAL
    assert alerts[0].value == 0.6


def test_high_error_rate_respects_min_requests() -> None:
    # 1/1 = 100% error but below min_requests, so no alert.
    snap = {
        "by_key": {"chat:openai:gpt-4.1": _entry(requests=1, successes=0, failures=1)}
    }
    rule = HighErrorRateRule(threshold=0.5, min_requests=5)
    assert rule.evaluate(snap) == []


def test_cost_spike_fires_on_daily_rollup() -> None:
    snap = {"daily": {"2024-05-17": {"requests": 3, "total_cost": 75.0}}}
    alerts = CostSpikeRule(daily_threshold=50.0).evaluate(snap)
    assert len(alerts) == 1
    assert alerts[0].rule == "cost_spike"
    assert alerts[0].scope == "daily:2024-05-17"
    assert alerts[0].value == 75.0


def test_provider_outage_fires_on_total_failure() -> None:
    snap = {
        "by_key": {"chat:openai:gpt-4.1": _entry(requests=5, successes=0, failures=5)}
    }
    alerts = ProviderOutageRule(error_rate=1.0, min_requests=3).evaluate(snap)
    assert len(alerts) == 1
    assert alerts[0].rule == "provider_outage"
    assert alerts[0].value == 1.0


def test_provider_outage_respects_min_requests() -> None:
    snap = {
        "by_key": {"chat:openai:gpt-4.1": _entry(requests=2, successes=0, failures=2)}
    }
    assert ProviderOutageRule(min_requests=3).evaluate(snap) == []


def test_healthy_snapshot_is_silent() -> None:
    snap = {
        "by_key": {
            "chat:openai:gpt-4.1": _entry(
                requests=100, successes=100, failures=0, avg_latency_ms=200.0
            )
        },
        "daily": {"2024-05-17": {"requests": 100, "total_cost": 1.0}},
        "monthly": {"2024-05": {"requests": 100, "total_cost": 1.0}},
    }
    assert MonitorEvaluator(default_rules()).evaluate(snap) == []


def test_evaluator_concatenates_all_rule_alerts() -> None:
    # One entry that trips latency + error-rate + outage at once.
    snap = {
        "by_key": {
            "chat:openai:gpt-4.1": _entry(
                requests=5, successes=0, failures=5, avg_latency_ms=99_999.0
            )
        },
        "daily": {"2024-05-17": {"requests": 5, "total_cost": 999.0}},
    }
    alerts = MonitorEvaluator(default_rules()).evaluate(snap)
    rules = {a.rule for a in alerts}
    assert rules == {
        "high_latency",
        "high_error_rate",
        "cost_spike",
        "provider_outage",
    }
    # Messages stay non-sensitive: scope keys + numbers only.
    for a in alerts:
        assert "prompt" not in a.message.lower()
        assert "response" not in a.message.lower()


def test_end_to_end_with_real_collector() -> None:
    c = MetricsCollector(now_fn=lambda: datetime(2024, 5, 17, tzinfo=timezone.utc))
    for _ in range(5):
        c.record(
            feature="chat",
            provider="openai",
            model="gpt-4.1",
            success=False,
            latency_ms=20_000,
            cost=None,
            cache_decision="none",
        )
    alerts = MonitorEvaluator(default_rules()).evaluate(c.snapshot())
    assert any(isinstance(a, Alert) and a.rule == "provider_outage" for a in alerts)
    assert any(a.rule == "high_latency" for a in alerts)
