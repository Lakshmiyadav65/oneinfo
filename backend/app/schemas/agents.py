from pydantic import BaseModel, Field


class ResearchContext(BaseModel):
    topic: str
    audience: str
    goal: str
    angle: str


class HookCandidate(BaseModel):
    text: str
    type: str
    # One line on why this hook earns the scroll-stop, so the creator can
    # choose on reasoning instead of vibes.
    reason: str


class ResearchedHookList(BaseModel):
    """
    Research context and hooks from one call.

    Hooks depend on the research, so the two cannot run in parallel — but one
    model call can produce both, which is what keeps a new project from
    waiting on two round trips before it sees anything. Only `hooks` is
    length-constrained: Gemini rejects minItems/maxItems on two nested array
    levels at once (see StructuredKnowledgeSection).
    """

    research: ResearchContext
    hooks: list[HookCandidate] = Field(min_length=3, max_length=5)
    recommended_index: int = 0


class ScriptBeat(BaseModel):
    """
    One labelled beat of a script - Hook, Curiosity, Value, CTA.

    A script used to come back as a single paragraph, which left the creator
    editing a wall of text and gave no sign of the shape underneath it. The
    beats are what a short video is actually built from, so they are named.

    `line` is the spoken words alone. No label, no stage direction: it is
    read aloud exactly as written.
    """

    label: str
    line: str


class ScriptOutput(BaseModel):
    title: str
    language: str = "english"
    beats: list[ScriptBeat] = Field(min_length=2, max_length=6)
    estimated_duration_seconds: int


class TanglishOutput(BaseModel):
    language: str = "tanglish"
    script: str


class StoryboardScene(BaseModel):
    order: int
    duration_seconds: int
    voiceover: str
    visual_prompt: str
    caption: str
    # True when the creator is on camera. Costs 3-8x a b-roll scene, so the
    # agent is told to use it sparingly and only where a presenter earns it.
    features_creator: bool = False


class StoryboardOutput(BaseModel):
    scenes: list[StoryboardScene]


class QAResult(BaseModel):
    passed: bool
    issues: list[str]


class KnowledgePart(BaseModel):
    """One labelled block within a filed document, e.g. Hook / Body / CTA."""

    label: str
    text: str


class StructuredKnowledgeSection(BaseModel):
    title: str
    # Deliberately unconstrained. Gemini's responseSchema rejects the whole
    # request (a bare 400 "invalid argument") when minItems/maxItems appear on
    # two nested array levels at once — sections AND parts. Either alone is
    # accepted. The outer cap is the one worth keeping, so empty/degenerate
    # parts are filtered after the call instead.
    parts: list[KnowledgePart]


class StructuredKnowledge(BaseModel):
    sections: list[StructuredKnowledgeSection] = Field(min_length=1, max_length=15)


class IdeaSuggestion(BaseModel):
    text: str
    angle: str


class IdeaSuggestionList(BaseModel):
    ideas: list[IdeaSuggestion] = Field(min_length=1, max_length=8)
