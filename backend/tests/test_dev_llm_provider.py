import pytest

from app.providers.llm.dev_provider import DevLLMProvider
from app.schemas.agents import (
    HookList,
    QAResult,
    ResearchContext,
    ScriptOutput,
    StoryboardOutput,
    TanglishOutput,
)


@pytest.fixture
def provider() -> DevLLMProvider:
    return DevLLMProvider()


async def test_generates_research_context(provider: DevLLMProvider):
    result = await provider.generate_structured("IDEA: how to brew pour-over coffee", ResearchContext)
    assert isinstance(result, ResearchContext)
    assert "coffee" in result.topic.lower()


async def test_generates_hook_list_within_schema_bounds(provider: DevLLMProvider):
    result = await provider.generate_structured("IDEA: pottery basics", HookList)
    assert isinstance(result, HookList)
    assert 3 <= len(result.hooks) <= 5
    assert all(h.text and h.type for h in result.hooks)


async def test_generates_script_output(provider: DevLLMProvider):
    result = await provider.generate_structured("IDEA: guitar chords for beginners", ScriptOutput)
    assert isinstance(result, ScriptOutput)
    assert result.script
    assert result.estimated_duration_seconds > 0


async def test_generates_tanglish_output(provider: DevLLMProvider):
    result = await provider.generate_structured("ENGLISH SCRIPT: hello there", TanglishOutput)
    assert isinstance(result, TanglishOutput)
    assert result.language == "tanglish"


async def test_generates_storyboard_output(provider: DevLLMProvider):
    result = await provider.generate_structured("SCRIPT: something", StoryboardOutput)
    assert isinstance(result, StoryboardOutput)
    assert len(result.scenes) >= 2
    orders = [s.order for s in result.scenes]
    assert orders == sorted(orders)


async def test_generates_qa_result(provider: DevLLMProvider):
    result = await provider.generate_structured("anything", QAResult)
    assert isinstance(result, QAResult)


async def test_raises_for_unknown_schema(provider: DevLLMProvider):
    from pydantic import BaseModel

    class Unknown(BaseModel):
        pass

    with pytest.raises(ValueError):
        await provider.generate_structured("x", Unknown)
