import uuid

from pydantic import BaseModel, ConfigDict


class StoryboardSceneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order: int
    duration_seconds: int
    voiceover: str
    visual_prompt: str
    caption: str
    features_creator: bool


class StoryboardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    qa_passed: bool
    qa_issues: list[str]
    scenes: list[StoryboardSceneOut]


class SceneOnCameraIn(BaseModel):
    features_creator: bool
