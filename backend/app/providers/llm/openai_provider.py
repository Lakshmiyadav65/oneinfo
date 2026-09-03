from app.providers.llm.openai_compatible import OpenAICompatibleLLMProvider


class OpenAILLMProvider(OpenAICompatibleLLMProvider):
    """Optional fallback LLM, per the master spec."""

    def __init__(self, api_key: str, default_model: str):
        super().__init__("https://api.openai.com/v1", api_key, default_model)
