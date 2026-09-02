from app.providers.chunking import chunk_text


def test_chunk_text_splits_with_overlap():
    words = [f"word{i}" for i in range(100)]
    text = " ".join(words)
    chunks = chunk_text(text, chunk_size_words=40, overlap_words=10)

    assert len(chunks) > 1
    assert chunks[0].split()[0] == "word0"
    assert chunks[0].split()[-10:] == chunks[1].split()[:10]


def test_chunk_text_empty_returns_no_chunks():
    assert chunk_text("   ", chunk_size_words=100, overlap_words=10) == []


def test_chunk_text_short_text_is_single_chunk():
    assert chunk_text("hello world", chunk_size_words=100, overlap_words=10) == ["hello world"]
