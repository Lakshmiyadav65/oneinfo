from app.providers.llm.openai_compatible import OpenAICompatibleLLMProvider


class GroqLLMProvider(OpenAICompatibleLLMProvider):
    """Fast/low-cost LLM option — Groq's API is OpenAI-compatible."""

    def __init__(self, api_key: str, default_model: str):
        super().__init__("https://api.groq.com/openai/v1", api_key, default_model)
