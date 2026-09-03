import pytest

from app.core.config import Settings
from app.providers.embeddings import get_embedding_provider
from app.providers.embeddings.dev_hash_provider import DevHashEmbeddingProvider
from app.providers.llm import get_llm_provider
from app.providers.llm.dev_provider import DevLLMProvider
from app.providers.storage import get_storage_provider


@pytest.mark.parametrize(
    ("provider_name", "key_field"),
    [("gemini", "gemini_api_key"), ("groq", "groq_api_key"), ("openai", "openai_api_key")],
)
def test_llm_factory_requires_key_for_each_real_provider(provider_name, key_field):
    settings = Settings(llm_provider=provider_name, **{key_field: None})
    with pytest.raises(RuntimeError):
        get_llm_provider(settings)


@pytest.mark.parametrize(
    ("provider_name", "key_field"), [("gemini", "gemini_api_key"), ("openai", "openai_api_key")]
)
def test_embedding_factory_requires_key_for_each_real_provider(provider_name, key_field):
    settings = Settings(embedding_provider=provider_name, **{key_field: None})
    with pytest.raises(RuntimeError):
        get_embedding_provider(settings)


def test_storage_factory_requires_bucket_and_credentials_for_gcs():
    settings = Settings(storage_backend="gcs", storage_bucket=None, google_application_credentials=None)
    with pytest.raises(RuntimeError):
        get_storage_provider(settings)


def test_llm_factory_returns_dev_provider_by_default():
    assert isinstance(get_llm_provider(Settings()), DevLLMProvider)


def test_embedding_factory_returns_dev_provider_by_default():
    assert isinstance(get_embedding_provider(Settings()), DevHashEmbeddingProvider)
