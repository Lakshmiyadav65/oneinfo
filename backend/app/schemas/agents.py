from pydantic import BaseModel, Field


class ResearchContext(BaseModel):
    topic: str
    audience: str
    goal: str
    angle: str


class HookCandidate(BaseModel):
    text: str
    type: str


class HookList(BaseModel):
    hooks: list[HookCandidate] = Field(min_length=3, max_length=5)


class ScriptOutput(BaseModel):
    title: str
    language: str = "english"
    script: str
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
