"""Phase 9 (semantic search / RAG) text chunking step.

Splits a document's text into overlapping, character-based chunks that feed
the embedding/indexing pipeline. Character counting keeps this consistent with
the codebase's ``AI_MAX_PROMPT_CHARS`` ~4-chars/token approximation, so no
tokenizer or extra dependency is pulled in.

ponytail: char-based splitting is naive — it can cut mid-word or mid-token and
does not respect model token boundaries. Ceiling: chunk sizes only approximate
token budgets. Upgrade path: swap in a token-aware splitter (tiktoken / provider
tokenizer) behind this same ``chunk_text`` signature when accuracy matters.
"""

from __future__ import annotations


def chunk_text(text: str, *, size: int, overlap: int) -> list[str]:
    """Split ``text`` into consecutive chunks of at most ``size`` chars, each
    overlapping the previous by ``overlap`` chars.

    Args:
        text: The source document text.
        size: Maximum characters per chunk. Must be > 0.
        overlap: Characters shared between consecutive chunks. Must satisfy
            ``0 <= overlap < size`` (``overlap >= size`` would never advance,
            causing an infinite loop).

    Returns:
        Chunks in document order. Empty or whitespace-only ``text`` yields ``[]``.
    """
    # Validate at the trust boundary: bad step sizes would spin forever.
    if size <= 0:
        raise ValueError(f"size must be > 0, got {size}")
    if not 0 <= overlap < size:
        raise ValueError(
            f"overlap must satisfy 0 <= overlap < size, got overlap={overlap}, size={size}"
        )

    if not text.strip():
        return []

    step = size - overlap
    chunks: list[str] = []
    start = 0
    length = len(text)
    while True:
        chunks.append(text[start : start + size])
        # Stop once this chunk reaches the end; avoids an empty/redundant tail.
        if start + size >= length:
            break
        start += step
    return chunks
