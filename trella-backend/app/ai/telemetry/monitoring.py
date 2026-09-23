"""Monitoring tier: alert conditions evaluated over the metrics snapshot.

The three telemetry tiers are Logging (raw), Telemetry (aggregate counters --
see ``metrics.py``) and Monitoring (this module: alerts). A rule reads a
``MetricsCollector.snapshot()`` and emits zero or more :class:`Alert` objects
when a threshold is crossed.

This module only *produces* ``Alert`` objects -- it never delivers them.
ponytail: alert delivery (email / Slack / pager) is a deliberate omission.
Ceiling: an alert that nobody routes anywhere is invisible. Upgrade path is a
notifier that consumes the ``list[Alert]`` from :meth:`MonitorEvaluator.evaluate`
and fans out to channels; the ``evaluate`` surface stays, delivery bolts on.

Alert messages are non-sensitive by construction: they only ever contain scope
keys (``<feature>:<provider>:<model>`` or ``daily:<date>``) and numbers, never
prompt or completion content (``.ai/AI_ARCHITECTURE.md`` §12-13).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class AlertSeverity(str, Enum):
    """Severity ladder for an alert."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass(frozen=True)
class Alert:
    """One tripped condition. ``message`` is non-sensitive (scope + numbers)."""

    rule: str
    severity: AlertSeverity
    scope: str
    message: str
    value: float


class AlertRule:
    """Abstract base: evaluate a metrics snapshot into zero or more alerts."""

    name: str
    severity: AlertSeverity

    def evaluate(self, snapshot: dict[str, Any]) -> list[Alert]:
        raise NotImplementedError


class HighLatencyRule(AlertRule):
    """Fire per by_key entry whose ``avg_latency_ms`` exceeds ``threshold_ms``."""

    name = "high_latency"
    severity = AlertSeverity.WARNING

    def __init__(self, threshold_ms: float) -> None:
        self.threshold_ms = threshold_ms

    def evaluate(self, snapshot: dict[str, Any]) -> list[Alert]:
        alerts: list[Alert] = []
        for scope, entry in snapshot.get("by_key", {}).items():
            avg = entry.get("avg_latency_ms")
            if avg is not None and avg > self.threshold_ms:
                alerts.append(
                    Alert(
                        rule=self.name,
                        severity=self.severity,
                        scope=scope,
                        message=(
                            f"avg latency {avg}ms > {self.threshold_ms}ms for {scope}"
                        ),
                        value=avg,
                    )
                )
        return alerts


class HighErrorRateRule(AlertRule):
    """Fire per by_key entry where ``failures/requests`` exceeds ``threshold``.

    ``min_requests`` suppresses noise from tiny samples (one failure out of one
    request is not a trend).
    """

    name = "high_error_rate"
    severity = AlertSeverity.CRITICAL

    def __init__(self, threshold: float, min_requests: int = 1) -> None:
        self.threshold = threshold
        self.min_requests = min_requests

    def evaluate(self, snapshot: dict[str, Any]) -> list[Alert]:
        alerts: list[Alert] = []
        for scope, entry in snapshot.get("by_key", {}).items():
            requests = entry.get("requests", 0)
            if requests < self.min_requests:
                continue
            rate = entry.get("failures", 0) / requests
            if rate > self.threshold:
                alerts.append(
                    Alert(
                        rule=self.name,
                        severity=self.severity,
                        scope=scope,
                        message=(
                            f"error rate {round(rate, 4)} > {self.threshold} "
                            f"over {requests} requests for {scope}"
                        ),
                        value=round(rate, 4),
                    )
                )
        return alerts


class CostSpikeRule(AlertRule):
    """Fire per ``daily`` rollup whose ``total_cost`` exceeds the threshold."""

    name = "cost_spike"
    severity = AlertSeverity.WARNING

    def __init__(self, daily_threshold: float) -> None:
        self.daily_threshold = daily_threshold

    def evaluate(self, snapshot: dict[str, Any]) -> list[Alert]:
        alerts: list[Alert] = []
        for date, entry in snapshot.get("daily", {}).items():
            cost = entry.get("total_cost", 0.0)
            if cost > self.daily_threshold:
                alerts.append(
                    Alert(
                        rule=self.name,
                        severity=self.severity,
                        scope=f"daily:{date}",
                        message=(
                            f"daily cost {cost} > {self.daily_threshold} on {date}"
                        ),
                        value=cost,
                    )
                )
        return alerts


class ProviderOutageRule(AlertRule):
    """Fire per by_key entry whose failure rate reaches total outage.

    "Outage" here is derived purely from metrics -- an error rate at or above
    ``error_rate`` (default 1.0 = every request failed) over at least
    ``min_requests`` calls. This is a proxy: authoritative provider health lives
    elsewhere (a health-check probe), not in this aggregate counter.
    """

    name = "provider_outage"
    severity = AlertSeverity.CRITICAL

    def __init__(self, error_rate: float = 1.0, min_requests: int = 3) -> None:
        self.error_rate = error_rate
        self.min_requests = min_requests

    def evaluate(self, snapshot: dict[str, Any]) -> list[Alert]:
        alerts: list[Alert] = []
        for scope, entry in snapshot.get("by_key", {}).items():
            requests = entry.get("requests", 0)
            if requests < self.min_requests:
                continue
            rate = entry.get("failures", 0) / requests
            if rate >= self.error_rate:
                alerts.append(
                    Alert(
                        rule=self.name,
                        severity=self.severity,
                        scope=scope,
                        message=(
                            f"failure rate {round(rate, 4)} >= "
                            f"{self.error_rate} over {requests} requests "
                            f"for {scope} (suspected outage)"
                        ),
                        value=round(rate, 4),
                    )
                )
        return alerts


class MonitorEvaluator:
    """Run a set of rules over a snapshot and concatenate their alerts."""

    def __init__(self, rules: list[AlertRule]) -> None:
        self.rules = rules

    def evaluate(self, snapshot: dict[str, Any]) -> list[Alert]:
        alerts: list[Alert] = []
        for rule in self.rules:
            alerts.extend(rule.evaluate(snapshot))
        return alerts


def default_rules() -> list[AlertRule]:
    """A sensible default rule set with reasonable thresholds."""
    return [
        HighLatencyRule(threshold_ms=10_000),
        HighErrorRateRule(threshold=0.5, min_requests=5),
        CostSpikeRule(daily_threshold=50.0),
        ProviderOutageRule(error_rate=1.0, min_requests=3),
    ]
