from app.core.config import Settings
from app.providers.embeddings.base import EmbeddingProvider
from app.providers.embeddings.dev_hash_provider import DevHashEmbeddingProvider
from app.providers.embeddings.gemini_provider import GeminiEmbeddingProvider


def get_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.embedding_provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY.")
        return GeminiEmbeddingProvider(settings.gemini_api_key, settings.embedding_dimensions)
    return DevHashEmbeddingProvider(settings.embedding_dimensions)
