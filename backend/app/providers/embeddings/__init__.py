from app.core.config import Settings
from app.providers.embeddings.base import EmbeddingProvider
from app.providers.embeddings.dev_hash_provider import DevHashEmbeddingProvider
from app.providers.embeddings.gemini_provider import GeminiEmbeddingProvider
from app.providers.embeddings.openai_provider import OpenAIEmbeddingProvider


def get_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.embedding_provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY.")
        return GeminiEmbeddingProvider(
            settings.gemini_api_key, settings.embedding_dimensions, settings.gemini_embedding_model
        )
    if settings.embedding_provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY.")
        return OpenAIEmbeddingProvider(
            settings.openai_api_key, settings.embedding_dimensions, settings.openai_embedding_model
        )
    return DevHashEmbeddingProvider(settings.embedding_dimensions)
