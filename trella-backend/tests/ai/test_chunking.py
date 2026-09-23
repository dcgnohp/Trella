"""Tests for the Phase 9 char-based text chunker."""

from __future__ import annotations

import pytest

from app.ai.retrieval.chunking import chunk_text


def test_normal_split_with_overlap_exact_boundaries() -> None:
    text = "ABCDEFGHIJKLMNOPQRSTUVWXY"  # 25 chars
    assert len(text) == 25
    chunks = chunk_text(text, size=10, overlap=3)
    # step = size - overlap = 7 -> starts at 0, 7, 14, 21
    assert chunks == [
        "ABCDEFGHIJ",  # [0:10]
        "HIJKLMNOPQ",  # [7:17]
        "OPQRSTUVWX",  # [14:24]
        "VWXY",  # [21:25] remainder, shorter than size
    ]


def test_overlap_correctness_between_consecutive_chunks() -> None:
    text = "The quick brown fox jumps over the lazy dog and runs away fast."
    overlap = 5
    chunks = chunk_text(text, size=12, overlap=overlap)
    for a, b in zip(chunks, chunks[1:], strict=False):
        # Last `overlap` chars of chunk N equal first `overlap` chars of chunk N+1.
        assert a[-overlap:] == b[:overlap]


def test_text_shorter_than_size_returns_single_chunk() -> None:
    assert chunk_text("hello", size=10, overlap=3) == ["hello"]


def test_text_equal_to_size_returns_single_chunk() -> None:
    text = "0123456789"  # exactly size
    assert chunk_text(text, size=10, overlap=3) == [text]


def test_empty_text_returns_empty_list() -> None:
    assert chunk_text("", size=10, overlap=3) == []


def test_whitespace_only_text_returns_empty_list() -> None:
    assert chunk_text("   \n\t  ", size=10, overlap=3) == []


def test_no_empty_trailing_chunk() -> None:
    # length 14 with step 7 must not emit a stray tail chunk.
    text = "A" * 14
    chunks = chunk_text(text, size=10, overlap=3)
    assert all(chunk for chunk in chunks)
    assert chunks == ["A" * 10, "A" * 7]


def test_zero_overlap_is_contiguous() -> None:
    text = "ABCDEFGHIJ"
    assert chunk_text(text, size=4, overlap=0) == ["ABCD", "EFGH", "IJ"]


def test_value_error_when_overlap_ge_size() -> None:
    with pytest.raises(ValueError):
        chunk_text("some text", size=5, overlap=5)
    with pytest.raises(ValueError):
        chunk_text("some text", size=5, overlap=6)


def test_value_error_when_size_not_positive() -> None:
    with pytest.raises(ValueError):
        chunk_text("some text", size=0, overlap=0)
    with pytest.raises(ValueError):
        chunk_text("some text", size=-3, overlap=0)


def test_value_error_when_overlap_negative() -> None:
    with pytest.raises(ValueError):
        chunk_text("some text", size=10, overlap=-1)
