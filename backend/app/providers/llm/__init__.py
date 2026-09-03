from app.core.config import Settings
from app.providers.llm.base import LLMProvider
from app.providers.llm.dev_provider import DevLLMProvider
from app.providers.llm.gemini_provider import GeminiLLMProvider
from app.providers.llm.groq_provider import GroqLLMProvider
from app.providers.llm.openai_provider import OpenAILLMProvider


def get_llm_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("LLM_PROVIDER=gemini requires GEMINI_API_KEY.")
        return GeminiLLMProvider(settings.gemini_api_key, settings.gemini_model)
    if settings.llm_provider == "groq":
        if not settings.groq_api_key:
            raise RuntimeError("LLM_PROVIDER=groq requires GROQ_API_KEY.")
        return GroqLLMProvider(settings.groq_api_key, settings.groq_model)
    if settings.llm_provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("LLM_PROVIDER=openai requires OPENAI_API_KEY.")
        return OpenAILLMProvider(settings.openai_api_key, settings.openai_model)
    return DevLLMProvider()
