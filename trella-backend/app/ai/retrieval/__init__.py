"""Phase 9 semantic search / RAG retrieval layer.

Part of the sanctioned Workspace Data Access boundary (alongside
``app.ai.tools.data_access``): it is the ONLY other place in ``app.ai`` that may
touch business data — and only the document data layer (the ``Doc`` model + the
AI-owned ``doc_embeddings`` repository), never business *services* (the
semantic-search TOOL, which does call ``DocsService`` for permission filtering,
lives in ``data_access``).

Retrieval pipeline + extension seams:
    retrieve  ->  rerank  ->  rank_knowledge  ->  source citation
    (vector today; ``hybrid`` keyword+vector fusion is the documented strategy
     seam — Phase 10 — that composes at the ``retrieve`` step via e.g. RRF
     without changing the tool or the ranking seams in ``reranking.py``.)

Building blocks:
* ``chunking``   — pure text chunking (no I/O);
* ``indexing``   — chunk -> embed -> upsert (IndexingService);
* ``backfill``   — one-off recovery/rebuild indexer;
* ``validation`` — startup fail-fast embedding-dimension guard;
* ``sync``       — background subscriber that keeps the index in sync with
                   document lifecycle events;
* ``reranking``  — post-retrieval ranking seams (rerank, rank_knowledge).
"""
