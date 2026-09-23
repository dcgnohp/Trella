"""One-off backfill (Phase 9): embed all existing, non-archived documents.

Idempotent — re-running re-indexes each doc (``replace_for_doc`` swaps rows), so
it is safe to run repeatedly. Reads ``Doc`` rows directly (data layer, not the
DocsService) since this is a maintenance job, and delegates all embedding work
to :class:`IndexingService`.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.ai.retrieval.indexing import IndexingService
from app.models.docs_model import Doc


async def backfill_embeddings(
    session: Session,
    *,
    service: IndexingService | None = None,
) -> int:
    """Index every non-archived document; return the total chunks written.

    ponytail: processes docs one-by-one in a single pass. Ceiling: for very
    large corpora this is slow and re-embeds everything. Upgrade path = batch
    the embed() calls and skip unchanged docs via a content hash.
    """
    service = service or IndexingService()
    rows = session.exec(
        select(Doc.id, Doc.workspace_id, Doc.title, Doc.content).where(
            Doc.is_archived == False  # noqa: E712
        )
    ).all()
    total = 0
    for doc_id, workspace_id, title, content in rows:
        total += await service.index_doc(
            session,
            doc_id=doc_id,
            workspace_id=workspace_id,
            title=title,
            content=content,
        )
    return total
