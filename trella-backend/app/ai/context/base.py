"""Context builder base.

Every AI feature receives *structured* context rather than hand-concatenated
strings (``.ai/AI_ARCHITECTURE.md`` §6). Concrete builders (TaskContext,
SprintContext, ...) arrive in their respective phases. This base also defines
the RAG extension point and a credential-redaction helper.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from typing import Any

# Keys that look like credentials are dropped before context leaves the app
# (never send secrets to a provider — ``.ai/AI_ARCHITECTURE.md`` §13).
_SECRET_KEY_PATTERN = re.compile(
    r"api[_-]?key|secret|token|password|passwd|authorization|credential",
    re.IGNORECASE,
)


class ContextBuilder(ABC):
    """Abstract base for feature-specific context builders."""

    @abstractmethod
    def build(self) -> dict[str, str]:
        """Return the prompt-ready variables for this feature.

        This is the ONLY method that produces prompt variables. Metadata and
        token estimation are kept separate so they can grow without changing
        the prompt contract (``.ai/AI_ARCHITECTURE.md`` §6).
        """

    def metadata(self) -> dict[str, Any]:
        # ponytail: optional, non-breaking hook for logging/analytics. Default
        # empty so existing builders need no change. Must stay non-sensitive.
        return {}

    def estimated_tokens(self) -> int | None:
        # ponytail: optional hook for future token estimation / cost control.
        # Default None until a real estimator lands. Override then.
        return None

    async def retrieve(self, query: str) -> list[str]:
        # ponytail: RAG extension point. No-op until Knowledge Intelligence
        # (embeddings + vector store) lands in a later phase. Override then.
        return []

    @staticmethod
    def redact(data: dict[str, Any]) -> dict[str, Any]:
        """Recursively drop credential-like keys from ``data``."""

        def _clean(value: Any) -> Any:
            if isinstance(value, dict):
                return {
                    k: _clean(v)
                    for k, v in value.items()
                    if not _SECRET_KEY_PATTERN.search(str(k))
                }
            if isinstance(value, list):
                return [_clean(v) for v in value]
            return value

        cleaned: dict[str, Any] = _clean(data)
        return cleaned
