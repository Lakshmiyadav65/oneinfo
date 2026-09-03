import json

import httpx
import pytest

from app.providers.llm.openai_compatible import OpenAICompatibleError, OpenAICompatibleLLMProvider
from app.schemas.agents import ResearchContext


async def test_parses_valid_json_response(monkeypatch):
    content = json.dumps(
        {
            "topic": "coffee",
            "audience": "home baristas",
            "goal": "teach basics",
            "angle": "beginner friendly",
        }
    )
    payload = {"choices": [{"message": {"content": content}}]}

    async def fake_post(self, url, headers=None, json=None):
        return httpx.Response(200, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    provider = OpenAICompatibleLLMProvider("https://example.test/v1", "fake-key", "fake-model")
    result = await provider.generate_structured("IDEA: coffee", ResearchContext)

    assert isinstance(result, ResearchContext)
    assert result.topic == "coffee"


async def test_raises_on_malformed_response(monkeypatch):
    async def fake_post(self, url, headers=None, json=None):
        return httpx.Response(200, json={"unexpected": "shape"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    provider = OpenAICompatibleLLMProvider("https://example.test/v1", "fake-key", "fake-model")
    with pytest.raises(OpenAICompatibleError):
        await provider.generate_structured("IDEA: coffee", ResearchContext)
