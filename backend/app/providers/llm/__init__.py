from app.core.config import Settings
from app.providers.llm.base import LLMProvider
from app.providers.llm.dev_provider import DevLLMProvider
from app.providers.llm.gemini_provider import GeminiLLMProvider


def get_llm_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("LLM_PROVIDER=gemini requires GEMINI_API_KEY.")
        return GeminiLLMProvider(settings.gemini_api_key)
    return DevLLMProvider()
