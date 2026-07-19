"""Post-retrieval ranking seams (Phase 9 extensibility points).

These are LIVE call sites (the semantic search tool routes its candidates
through :func:`rerank` then :func:`rank_knowledge`) so they are real seams, not
dead code. Today both are order-preserving no-ops.

Retrieval pipeline (see ``app.ai.retrieval``):
    retrieve (vector; hybrid strategy seam) -> rerank -> rank_knowledge -> cite

ponytail: no relevance re-scoring or trust ranking yet — results are ordered
purely by vector cosine distance. Ceilings + upgrade paths (Phase 10):
* rerank: cross-encoder / LLM-as-reranker behind the frozen signature;
* rank_knowledge: boost by trust signals (recency, pinned, access frequency,
  task/sprint links) behind the frozen signature;
* hybrid: fuse keyword + vector scores (e.g. Reciprocal Rank Fusion) at the
  retrieval-strategy layer — documented in ``app.ai.retrieval`` — without
  changing these callers.
"""

from __future__ import annotations

from typing import Any


def rerank(query: str, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:  # noqa: ARG001
    """Return ``candidates`` re-ordered by relevance to ``query``.

    Placeholder: identity (keeps the vector-distance order). ``query`` is part
    of the frozen signature a real reranker will use.
    """
    return candidates


def rank_knowledge(query: str, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:  # noqa: ARG001
    """Return ``candidates`` re-ordered by knowledge-trust signals.

    Placeholder: identity. The frozen signature lets a future implementation
    boost by recency / pinned / access-frequency / task-sprint links without
    changing callers.
    """
    return candidates
