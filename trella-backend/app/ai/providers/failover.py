"""Health-aware failover across an ordered list of providers.

Wraps N concrete :class:`AIProvider` instances, each paired with its own
:class:`ProviderHealthTracker` and :class:`CircuitBreaker`. Every call picks the
best available candidate (HEALTHY before DEGRADED, then UNAVAILABLE last, always
skipping providers whose circuit is OPEN) and, on an *infrastructure* failure,
records it and tries the next candidate.

Error taxonomy drives the behaviour (``.ai/AI_ARCHITECTURE.md`` §10):

* Infrastructure errors (:class:`ProviderTimeout`, :class:`ProviderUnavailable`)
  count against health/circuit and trigger failover to the next candidate.
* Content errors (:class:`InvalidPrompt`, :class:`InvalidResponse`) are the
  caller's fault, identical across providers, so they re-raise immediately with
  no failover and no circuit trip.

This lives behind the ``AIProvider`` interface so AI services never change.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.ai.providers.base import (
    AIProvider,
    GenerationResult,
    ProviderMessage,
    StructuredResult,
    T,
)
from app.ai.providers.circuit_breaker import CircuitBreaker
from app.ai.providers.health import ProviderHealth, ProviderHealthTracker
from app.ai.utils.errors import (
    InvalidPrompt,
    InvalidResponse,
    ProviderTimeout,
    ProviderUnavailable,
)

# Infra failures fail over + count against health/circuit.
_INFRA_ERRORS = (ProviderTimeout, ProviderUnavailable)
# Content failures re-raise immediately (caller error, same for every provider).
_CONTENT_ERRORS = (InvalidPrompt, InvalidResponse)

# Health preference: lower sorts first.
_HEALTH_RANK = {
    ProviderHealth.HEALTHY: 0,
    ProviderHealth.DEGRADED: 1,
    ProviderHealth.UNAVAILABLE: 2,
}


@dataclass
class _Candidate:
    """A provider bundled with its rolling health and circuit breaker."""

    provider: AIProvider
    health: ProviderHealthTracker
    circuit: CircuitBreaker

    def record_success(self, latency_ms: int) -> None:
        self.health.record_success(latency_ms)
        self.circuit.record_success()

    def record_infra_failure(self, *, timeout: bool) -> None:
        self.health.record_failure(timeout=timeout)
        self.circuit.record_failure()


class FailoverProvider(AIProvider):
    """Route each call to the healthiest provider whose circuit allows it."""

    name = "failover"

    def __init__(self, providers: list[AIProvider]) -> None:
        if not providers:
            raise ValueError("FailoverProvider requires at least one provider")
        self._candidates = [
            _Candidate(p, ProviderHealthTracker(), CircuitBreaker()) for p in providers
        ]

    def _ordered(self) -> list[_Candidate]:
        """Candidates whose circuit allows a call, ordered by health.

        ponytail: UNAVAILABLE providers are ranked last rather than dropped so a
        single-provider list still works and recovery is possible; a healthier
        peer is always preferred. Circuit-OPEN candidates are excluded (a
        cooldown probe re-enters as HALF_OPEN, which ``allow()`` permits).
        """
        allowed = [c for c in self._candidates if c.circuit.allow()]
        return sorted(allowed, key=lambda c: _HEALTH_RANK[c.health.status()])

    async def generate(
        self,
        *,
        prompt: str,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> GenerationResult:
        candidates = self._ordered()
        for candidate in candidates:
            try:
                started = time.monotonic()
                result = await candidate.provider.generate(
                    prompt=prompt,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=timeout,
                )
            except _CONTENT_ERRORS:
                raise
            except _INFRA_ERRORS as exc:
                candidate.record_infra_failure(timeout=isinstance(exc, ProviderTimeout))
                continue
            candidate.record_success(_elapsed_ms(started))
            return result
        raise ProviderUnavailable("All providers are unavailable.")

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_model: type[T],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> StructuredResult[T]:
        candidates = self._ordered()
        for candidate in candidates:
            try:
                started = time.monotonic()
                result = await candidate.provider.generate_structured(
                    prompt=prompt,
                    response_model=response_model,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=timeout,
                )
            except _CONTENT_ERRORS:
                raise
            except _INFRA_ERRORS as exc:
                candidate.record_infra_failure(timeout=isinstance(exc, ProviderTimeout))
                continue
            candidate.record_success(_elapsed_ms(started))
            return result
        raise ProviderUnavailable("All providers are unavailable.")

    async def stream(
        self,
        *,
        messages: list[ProviderMessage],
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> AsyncIterator[str]:
        """Fail over on *initiation* only; never switch mid-stream.

        We pull the first delta from each candidate to prove the stream started;
        an infra error there fails over to the next provider. Once the first
        delta arrives the provider is committed — later errors propagate.
        """
        candidates = self._ordered()
        for candidate in candidates:
            started = time.monotonic()
            iterator = candidate.provider.stream(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout,
            )
            try:
                first = await iterator.__anext__()
            except StopAsyncIteration:
                # Empty but successful stream: initiation worked.
                candidate.record_success(_elapsed_ms(started))
                return
            except _CONTENT_ERRORS:
                raise
            except _INFRA_ERRORS as exc:
                candidate.record_infra_failure(timeout=isinstance(exc, ProviderTimeout))
                continue
            candidate.record_success(_elapsed_ms(started))
            yield first
            # Committed to this provider — no failover past the first delta.
            async for delta in iterator:
                yield delta
            return
        raise ProviderUnavailable("All providers are unavailable.")

    async def health_check(self) -> bool:
        """Healthy if any candidate whose circuit allows it reports healthy."""
        candidates = self._ordered()
        for candidate in candidates:
            try:
                ok = await candidate.provider.health_check()
            except _INFRA_ERRORS as exc:
                candidate.record_infra_failure(timeout=isinstance(exc, ProviderTimeout))
                continue
            if ok:
                return True
        return False

    def snapshot(self) -> list[dict[str, object]]:
        """Per-provider health snapshots for observability (non-sensitive)."""
        return [
            {"provider": c.provider.name, **c.health.snapshot()}
            for c in self._candidates
        ]


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)
