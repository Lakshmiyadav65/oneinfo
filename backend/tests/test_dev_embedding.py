from app.providers.embeddings.dev_hash_provider import DevHashEmbeddingProvider


def test_embedding_is_deterministic():
    provider = DevHashEmbeddingProvider(dimensions=64)
    assert provider.embed(["hello world"])[0] == provider.embed(["hello world"])[0]


def test_embedding_has_correct_dimension_and_is_normalized():
    provider = DevHashEmbeddingProvider(dimensions=64)
    vector = provider.embed(["some text here"])[0]
    assert len(vector) == 64
    norm = sum(v * v for v in vector) ** 0.5
    assert abs(norm - 1.0) < 1e-6


def test_different_text_produces_different_embeddings():
    provider = DevHashEmbeddingProvider(dimensions=64)
    a = provider.embed(["cats and dogs"])[0]
    b = provider.embed(["rockets and space"])[0]
    assert a != b
