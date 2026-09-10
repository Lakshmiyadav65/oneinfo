import uuid

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.environment import SceneEnvironment


class StoryboardSceneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order: int
    duration_seconds: int
    voiceover: str
    visual_prompt: str
    caption: str
    features_creator: bool
    # Always present, even on scenes stored before setups existed: the
    # service fills the default in rather than making every caller handle a
    # null shape.
    environment: SceneEnvironment
    # Which take the final video uses. Zero-based.
    selected_take: int = 0
    # False for a scene the creator has left out of this cut.
    included_in_video: bool = True
    # True once the creator has edited the visual description by hand, which
    # is what stops a change of setup from quietly rewriting their words.
    visual_is_custom: bool

    @field_validator("environment", mode="before")
    @classmethod
    def _default_environment(cls, value: object) -> object:
        # Null on scenes stored before setups existed. Read as the default
        # rather than propagating the history into every client.
        return value or {}


class StoryboardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    qa_passed: bool
    qa_issues: list[str]
    scenes: list[StoryboardSceneOut]


class SceneOnCameraIn(BaseModel):
    features_creator: bool


class SceneInclusionIn(BaseModel):
    """Whether this scene goes into the finished video. The scene itself is
    kept either way - see storyboard_service.set_scene_inclusion."""

    included_in_video: bool


class SceneEnvironmentIn(BaseModel):
    """
    A scene's setup, replaced whole.

    `rebuild_visual` is the answer to "changing the setup may update the
    visual description": true rebuilds it, false keeps the creator's wording.
    It only matters for a scene whose visual was edited by hand; anything
    else rebuilds, since there is nothing there to protect.
    """

    environment: SceneEnvironment
    rebuild_visual: bool = True
    # Set when the creator picked a preset chip rather than tuning one
    # control. The server rebuilds the whole setup from that preset's
    # defaults, so "what YouTube Studio means" is defined in exactly one
    # place instead of being copied into the client.
    reset_to_preset: bool = False


class SceneVisualIn(BaseModel):
    """The visual description, written by the creator. Marks the scene custom
    so nothing rebuilds over it later without being asked."""

    visual_prompt: str


class ProjectEnvironmentIn(BaseModel):
    """
    The project's default setup.

    `apply_to_all` rewrites the setup on every existing scene. Off by
    default: a creator changing the default for scenes they have not written
    yet must not silently lose the setups they tuned on the ones they have.
    """

    environment: SceneEnvironment
    apply_to_all: bool = False
    reset_to_preset: bool = False
