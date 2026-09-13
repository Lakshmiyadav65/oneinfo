import re

from pydantic import BaseModel

from app.schemas.agents import (
    HookCandidate,
    QAResult,
    ResearchContext,
    ResearchedHookList,
    RoadmapStep,
    ScriptBeat,
    ScriptOutput,
    StoryboardOutput,
    StoryboardScene,
    TanglishOutput,
    TranslatedLines,
    TranslatedScript,
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


def _numbered_lines(prompt: str) -> list[str]:
    """
    The lines a translation was asked for, read back out of the prompt.

    The provider is handed a prompt, not the caller's list, and returning
    the wrong number of lines is the one answer the caller throws away
    whole. So the count comes from the same place the model would read it.
    """
    block = prompt.split("LINES:\n", 1)
    if len(block) < 2:
        return []
    lines: list[str] = []
    for raw in block[1].splitlines():
        match = re.match(r"^\s*\d+\.\s+(.*)$", raw)
        if match:
            lines.append(match.group(1).strip())
    return lines


def _after_label(prompt: str, label: str) -> str:
    body = prompt.split(f"{label}:\n", 1)
    return body[1].strip() if len(body) > 1 else ""


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

        if schema is ResearchedHookList:
            return ResearchedHookList(
                research=ResearchContext(
                    topic=snippet,
                    audience="[DEV MODE] a general audience",
                    goal="[DEV MODE] inform and engage",
                    angle=f"[DEV MODE] a fresh take on {snippet}",
                ),
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
            # Three steps, because the real agent is told to produce at least
            # three - dev mode exists to exercise the same shape the pipeline
            # will see, including the parts that get persisted and rendered.
            roadmap = [
                RoadmapStep(
                    order=index,
                    topic=f"{_TEMPLATE_TAG} Step {index} of {snippet}",
                    detail=f"What a viewer does at step {index}.",
                )
                for index in (1, 2, 3)
            ]
            return ScriptOutput(
                title=snippet.title(),
                language="english",
                beats=[
                    ScriptBeat(label="Hook", line=f"{_TEMPLATE_TAG} Let's talk about {snippet}."),
                    ScriptBeat(label="Curiosity", line=f"Most people get {snippet} wrong."),
                    ScriptBeat(
                        label="Value",
                        line=" ".join(f"{step.order}. {step.topic}." for step in roadmap),
                    ),
                    ScriptBeat(label="CTA", line="Follow for more."),
                ],
                estimated_duration_seconds=45,
                roadmap=roadmap,
            )

        if schema is TranslatedLines:
            # Echoes the lines it was given, tagged. Dev mode cannot speak
            # Telugu, and inventing something that looks like it would hide
            # exactly the bug this path has - a line coming back paired with
            # the wrong scene. Same count, same order, visibly untranslated.
            return TranslatedLines(
                lines=[f"{_TEMPLATE_TAG} {line}" for line in _numbered_lines(prompt)]
            )

        if schema is TranslatedScript:
            # The beats are kept exactly as they arrived: the script view
            # parses those labels, and dev mode exercising a shape the real
            # agent is told never to break would prove nothing.
            return TranslatedScript(
                script=f"{_TEMPLATE_TAG}\n{_after_label(prompt, 'SCRIPT')}"
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
