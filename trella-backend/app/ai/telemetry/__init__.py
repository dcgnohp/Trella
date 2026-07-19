"""AI telemetry: aggregate metrics and per-request tracing (kept separate).

Metrics are counters (how much / how often / how expensive); tracing is a
bounded log of per-request lifecycle spans (what happened on one call). They
live in separate modules with separate collectors on purpose -- tracing never
holds content, metrics never holds per-request detail.
"""

from __future__ import annotations

from app.ai.telemetry.metrics import MetricsCollector, get_metrics_collector
from app.ai.telemetry.monitoring import (
    Alert,
    AlertRule,
    AlertSeverity,
    CostSpikeRule,
    HighErrorRateRule,
    HighLatencyRule,
    MonitorEvaluator,
    ProviderOutageRule,
    default_rules,
)
from app.ai.telemetry.tracing import Span, TracingCollector, get_tracing_collector

__all__ = [
    "Alert",
    "AlertRule",
    "AlertSeverity",
    "CostSpikeRule",
    "HighErrorRateRule",
    "HighLatencyRule",
    "MetricsCollector",
    "MonitorEvaluator",
    "ProviderOutageRule",
    "Span",
    "TracingCollector",
    "default_rules",
    "get_metrics_collector",
    "get_tracing_collector",
]
