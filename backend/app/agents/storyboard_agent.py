from typing import cast

from app.providers.llm.base import LLMProvider
from app.schemas.agents import StoryboardOutput


async def run_storyboard_agent(
    llm: LLMProvider, *, script_content: str, estimated_duration_seconds: int | None
) -> StoryboardOutput:
    prompt = (
        "SYSTEM: You are OneInfo's storyboard assistant. Break the "
        "approved script into an ordered sequence of short video scenes. "
        "Each scene needs a duration in seconds, the voiceover line spoken "
        "during it, a visual_prompt describing what should be shown, and a "
        "short on-screen caption. Scene durations should roughly sum to "
        "the script's estimated duration.\n\n"
        f"SCRIPT: {script_content}\n"
        f"ESTIMATED DURATION SECONDS: {estimated_duration_seconds or 45}\n"
    )
    result = await llm.generate_structured(prompt, StoryboardOutput)
    return cast(StoryboardOutput, result)
