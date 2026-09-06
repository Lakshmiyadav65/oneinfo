import re

from pydantic import BaseModel

from app.schemas.agents import (
    HookCandidate,
    HookList,
    QAResult,
    ResearchContext,
    ScriptOutput,
    StoryboardOutput,
    StoryboardScene,
    TanglishOutput,
)

_TEMPLATE_TAG = "[DEV MODE]"


_LABEL_PRIORITY = ("IDEA", "ENGLISH SCRIPT", "SCRIPT", "SELECTED HOOK")


def _snippet(prompt: str) -> str:
    """
    Pulls a short, meaningful excerpt out of the prompt for templating.
    Different agents label their main content differently (IDEA for
    research/hooks/scripts, ENGLISH SCRIPT for Tanglish, SCRIPT for
    storyboard) — try each in turn so every agent's dev-mode output
    actually reflects its real input instead of the shared SYSTEM preamble.
    """
    for label in _LABEL_PRIORITY:
        match = re.search(rf"{label}:\s*(.+)", prompt)
        if match:
            first_line = match.group(1).strip().splitlines()[0]
            if first_line:
                return first_line[:80]
    first_line = prompt.strip().splitlines()[0] if prompt.strip() else "this idea"
    return first_line[:80]


class DevLLMProvider:
    """
    Deterministic, dependency-free structured "LLM" used until a real
    GEMINI_API_KEY is configured. Produces schema-valid, clearly-labeled
    placeholder content derived from the prompt — enough to exercise the
    full agent pipeline end-to-end and prove creator isolation, not to be
    creatively good. Swap to GeminiLLMProvider for real quality.
    """

    async def generate_structured(
        self, prompt: str, schema: type[BaseModel], *, model: str | None = None
    ) -> BaseModel:
        snippet = _snippet(prompt)

        if schema is ResearchContext:
            return ResearchContext(
                topic=snippet,
                audience="general audience",
                goal="engage and inform viewers",
                angle=f"a fresh take on {snippet}",
            )

        if schema is HookList:
            return HookList(
                hooks=[
                    HookCandidate(
                        text=f"You won't believe this about {snippet}...",
                        type="curiosity",
                        reason="[DEV MODE] Opens a curiosity gap the viewer wants closed.",
                    ),
                    HookCandidate(
                        text=f"Here's what nobody tells you about {snippet}.",
                        type="shock",
                        reason="[DEV MODE] Promises insider knowledge the viewer lacks.",
                    ),
                    HookCandidate(
                        text=f"Why does {snippet} actually matter?",
                        type="question",
                        reason="[DEV MODE] A direct question invites the viewer to answer it.",
                    ),
                ],
                recommended_index=0,
            )

        if schema is ScriptOutput:
            return ScriptOutput(
                title=snippet.title(),
                language="english",
                script=(
                    f"{_TEMPLATE_TAG} Opening: Let's talk about {snippet}.\n"
                    f"Body: Here is what you need to know about {snippet}.\n"
                    "Closing: Follow for more."
                ),
                estimated_duration_seconds=45,
            )

        if schema is TanglishOutput:
            return TanglishOutput(
                script=f"{_TEMPLATE_TAG} Ipo {snippet} pathi pesalam. Ithu romba interesting-a irukum!",
            )

        if schema is StoryboardOutput:
            return StoryboardOutput(
                scenes=[
                    StoryboardScene(
                        order=1,
                        duration_seconds=5,
                        voiceover=f"Let's talk about {snippet}.",
                        visual_prompt=f"Close-up shot introducing {snippet}.",
                        caption=snippet,
                    ),
                    StoryboardScene(
                        order=2,
                        duration_seconds=8,
                        voiceover=f"Here's what you need to know about {snippet}.",
                        visual_prompt=f"Illustrative footage related to {snippet}.",
                        caption="Key details",
                    ),
                    StoryboardScene(
                        order=3,
                        duration_seconds=4,
                        voiceover="Follow for more.",
                        visual_prompt="Branded outro card.",
                        caption="Follow for more",
                    ),
                ]
            )

        if schema is QAResult:
            return QAResult(passed=True, issues=[])

        raise ValueError(f"DevLLMProvider has no template for schema {schema!r}")
