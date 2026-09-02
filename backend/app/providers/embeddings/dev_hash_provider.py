import hashlib
import math


class DevHashEmbeddingProvider:
    """
    Deterministic, dependency-free embedding provider used until a real
    GEMINI_API_KEY is configured. It's a hashed bag-of-words vector (the
    "hashing trick") — documents sharing vocabulary land closer together,
    which is enough to prove the storage/retrieval pipeline and creator
    isolation work correctly, without calling a paid external API from
    every dev machine and CI run. Not semantically meaningful; swap to
    GeminiEmbeddingProvider for real retrieval quality.
    """

    def __init__(self, dimensions: int):
        self._dimensions = dimensions

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self._dimensions
        words = text.lower().split() or [""]
        for word in words:
            digest = hashlib.sha256(word.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:4], "big") % self._dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[bucket] += sign
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]
