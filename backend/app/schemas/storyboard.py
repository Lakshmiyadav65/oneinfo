import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

from app.providers.speech.base import speech_seconds as estimate_speech_seconds
from app.schemas.environment import SceneEnvironment


class StoryboardSceneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order: int
    duration_seconds: int
    # Null when the length is still derived from the dialogue. The panel
    # needs this to tell "Auto happened to pick 8s" from "somebody chose 8s",
    # which are the same number and different states.
    duration_override: int | None = None
    voiceover: str
    # When the creator last rewrote that line, or null while it is still the
    # agent's. Takes generated before it were made from words this scene no
    # longer says, and the preview marks them so.
    dialogue_edited_at: datetime | None = None
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

    @computed_field  # type: ignore[prop-decorator]
    @property
    def speech_seconds(self) -> float:
        """
        How long this line takes to say, by the same estimate the length is
        derived from. Sent rather than recomputed in the client so that
        "does it fit?" is answered by one words-per-second figure, not two
        that can drift apart.
        """
        return round(estimate_speech_seconds(self.voiceover), 2)

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


class SceneDurationIn(BaseModel):
    """
    How long this one clip runs, or null to go back to fitting the dialogue.

    Validated against the provider rather than here: which lengths exist
    depends on the video provider and on whether the creator is in frame,
    and Veo answers both differently.
    """

    duration_seconds: int | None = None


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


class SceneDialogueIn(BaseModel):
    """
    What this scene says, rewritten by the creator.

    Nothing else here: the clip length and the prompt both follow the words
    on the server, because getting either of them wrong is what produces
    dead air or a clip talking over its own ending.
    """

    voiceover: str


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
