"""P6-B2 check: circuit breaker state machine with an injected clock."""

from app.ai.providers.circuit_breaker import CircuitBreaker, CircuitState


class _Clock:
    """Deterministic monotonic clock the tests advance by hand."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def test_starts_closed_and_allows() -> None:
    cb = CircuitBreaker()
    assert cb.state is CircuitState.CLOSED
    assert cb.allow() is True


def test_trips_open_after_threshold() -> None:
    cb = CircuitBreaker(failure_threshold=3)
    cb.record_failure()
    cb.record_failure()
    assert cb.state is CircuitState.CLOSED  # not yet at threshold
    cb.record_failure()
    assert cb.state is CircuitState.OPEN
    assert cb.allow() is False


def test_open_transitions_to_half_open_after_cooldown() -> None:
    clock = _Clock()
    cb = CircuitBreaker(failure_threshold=1, cooldown_s=30.0, time_fn=clock)
    cb.record_failure()
    assert cb.state is CircuitState.OPEN
    assert cb.allow() is False

    clock.advance(29.0)
    assert cb.allow() is False  # still cooling down

    clock.advance(1.0)  # cooldown elapsed
    assert cb.state is CircuitState.HALF_OPEN
    assert cb.allow() is True


def test_half_open_success_closes() -> None:
    clock = _Clock()
    cb = CircuitBreaker(failure_threshold=1, cooldown_s=10.0, time_fn=clock)
    cb.record_failure()
    clock.advance(10.0)
    assert cb.state is CircuitState.HALF_OPEN
    cb.record_success()
    assert cb.state is CircuitState.CLOSED
    assert cb.allow() is True


def test_half_open_failure_reopens_and_restarts_cooldown() -> None:
    clock = _Clock()
    cb = CircuitBreaker(failure_threshold=1, cooldown_s=10.0, time_fn=clock)
    cb.record_failure()
    clock.advance(10.0)
    assert cb.state is CircuitState.HALF_OPEN
    cb.record_failure()  # probe failed
    assert cb.state is CircuitState.OPEN
    assert cb.allow() is False
    # Cooldown restarts from the re-open moment.
    clock.advance(10.0)
    assert cb.state is CircuitState.HALF_OPEN


def test_success_resets_failure_count() -> None:
    cb = CircuitBreaker(failure_threshold=3)
    cb.record_failure()
    cb.record_failure()
    cb.record_success()  # resets counter
    cb.record_failure()
    cb.record_failure()
    assert cb.state is CircuitState.CLOSED  # only 2 since reset
