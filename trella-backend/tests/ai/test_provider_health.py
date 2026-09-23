"""P6-B2 check: rolling health window transitions from recorded outcomes."""

from app.ai.providers.health import ProviderHealth, ProviderHealthTracker


def test_empty_window_is_optimistically_healthy() -> None:
    assert ProviderHealthTracker().status() is ProviderHealth.HEALTHY


def test_all_success_is_healthy() -> None:
    t = ProviderHealthTracker(window=10)
    for _ in range(10):
        t.record_success(latency_ms=100)
    assert t.status() is ProviderHealth.HEALTHY


def test_high_failure_rate_is_unavailable() -> None:
    t = ProviderHealthTracker(window=10, failure_threshold=0.5)
    for _ in range(4):
        t.record_success(latency_ms=100)
    for _ in range(6):
        t.record_failure(timeout=False)
    assert t.status() is ProviderHealth.UNAVAILABLE


def test_slow_but_succeeding_is_degraded() -> None:
    t = ProviderHealthTracker(window=5, degraded_latency_ms=8000)
    for _ in range(5):
        t.record_success(latency_ms=9000)
    assert t.status() is ProviderHealth.DEGRADED


def test_frequent_timeouts_are_degraded_below_failure_threshold() -> None:
    # 3/10 timeouts: over the 0.2 timeout rate but under the 0.5 failure rate.
    t = ProviderHealthTracker(
        window=10, failure_threshold=0.5, degraded_timeout_rate=0.2
    )
    for _ in range(7):
        t.record_success(latency_ms=100)
    for _ in range(3):
        t.record_failure(timeout=True)
    assert t.status() is ProviderHealth.DEGRADED


def test_full_transition_healthy_degraded_unavailable() -> None:
    t = ProviderHealthTracker(window=4, failure_threshold=0.5, degraded_latency_ms=8000)
    t.record_success(latency_ms=100)
    assert t.status() is ProviderHealth.HEALTHY

    # Slow successes push average latency over the degraded threshold.
    t.record_success(latency_ms=20000)
    t.record_success(latency_ms=20000)
    assert t.status() is ProviderHealth.DEGRADED

    # Failures reaching the window's failure threshold -> unavailable.
    t.record_failure(timeout=False)
    t.record_failure(timeout=False)
    assert t.status() is ProviderHealth.UNAVAILABLE


def test_window_is_bounded_and_recovers() -> None:
    t = ProviderHealthTracker(window=3, failure_threshold=0.5)
    for _ in range(3):
        t.record_failure(timeout=False)
    assert t.status() is ProviderHealth.UNAVAILABLE
    # Newer successes evict old failures from the bounded window.
    for _ in range(3):
        t.record_success(latency_ms=50)
    assert t.status() is ProviderHealth.HEALTHY


def test_snapshot_is_non_sensitive_metrics() -> None:
    t = ProviderHealthTracker(window=10)
    t.record_success(latency_ms=200)
    t.record_failure(timeout=True)
    snap = t.snapshot()
    assert snap["samples"] == 2
    assert snap["recent_failures"] == 1
    assert snap["timeout_rate"] == 0.5
    assert snap["avg_latency_ms"] == 200.0
    assert snap["status"] in {h.value for h in ProviderHealth}
