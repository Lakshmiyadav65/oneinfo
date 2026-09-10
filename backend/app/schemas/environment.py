"""
How a scene is filmed, as structured choices rather than prose.

The creator picks a preset and, if they care to, adjusts individual controls.
Everything here is stored as values, never as display names, so the prompt the
video provider eventually sees can be rebuilt from the record at any time.

Deliberately absent: `on_camera`. Whether the creator is in frame already
lives on the scene as `features_creator`, where it decides which model the
scene is billed against - a second copy of a billing flag is a bug waiting
for the two to disagree. `subject` says what the shot is about; the scene
says whether the creator is in it.

Also absent: aspect ratio. Output size is a project-wide setting today, and a
per-scene override that silently disagreed with it would produce a video that
cannot concatenate.
"""

import enum

from pydantic import BaseModel, Field


class EnvironmentPreset(str, enum.Enum):
    youtube_studio = "youtube_studio"
    podcast = "podcast"
    office = "office"
    home = "home"
    outdoor = "outdoor"
    classroom = "classroom"
    product_demo = "product_demo"
    cinematic = "cinematic"
    custom = "custom"


class Background(str, enum.Enum):
    clean_studio = "clean_studio"
    modern_office = "modern_office"
    home_interior = "home_interior"
    outdoor = "outdoor"
    classroom = "classroom"
    custom = "custom"


class CameraFraming(str, enum.Enum):
    wide = "wide"
    medium = "medium"
    medium_close_up = "medium_close_up"
    close_up = "close_up"
    over_the_shoulder = "over_the_shoulder"
    full_body = "full_body"


class CameraAngle(str, enum.Enum):
    eye_level = "eye_level"
    low_angle = "low_angle"
    high_angle = "high_angle"
    over_the_shoulder = "over_the_shoulder"


class CameraMovement(str, enum.Enum):
    static = "static"
    slow_push_in = "slow_push_in"
    slow_pull_out = "slow_pull_out"
    handheld = "handheld"
    pan = "pan"
    tracking = "tracking"


class Lighting(str, enum.Enum):
    natural = "natural"
    soft_studio = "soft_studio"
    warm = "warm"
    cool = "cool"
    dramatic = "dramatic"
    high_key = "high_key"
    low_key = "low_key"


class VisualStyle(str, enum.Enum):
    realistic = "realistic"
    cinematic = "cinematic"
    documentary = "documentary"
    professional = "professional"
    social_media = "social_media"
    commercial = "commercial"
    educational = "educational"


class Subject(str, enum.Enum):
    creator = "creator"
    product = "product"
    people = "people"
    environment = "environment"
    screen = "screen"


class SceneEnvironment(BaseModel):
    """One scene's filming setup. Every field has a usable default, so a
    creator who ignores this section entirely still gets a coherent shot."""

    preset: EnvironmentPreset = EnvironmentPreset.youtube_studio
    background: Background = Background.clean_studio
    camera_framing: CameraFraming = CameraFraming.medium
    camera_angle: CameraAngle = CameraAngle.eye_level
    camera_movement: CameraMovement = CameraMovement.static
    lighting: Lighting = Lighting.soft_studio
    visual_style: VisualStyle = VisualStyle.realistic
    subject: Subject = Subject.creator
    # Free text, only meaningful when the matching choice is "custom".
    custom_setup: str = Field(default="", max_length=600)
    custom_background: str = Field(default="", max_length=300)
    additional_requirements: str = Field(default="", max_length=600)


# What each preset looks like, in the words that go into the prompt, plus the
# control values it starts from. Taken together these are the "smart defaults"
# that keep the advanced panel optional.
PRESETS: dict[EnvironmentPreset, dict] = {
    EnvironmentPreset.youtube_studio: {
        "characteristics": (
            "a modern creator studio with a clean background and a desk setup, "
            "professional key lighting with soft fill and subtle background light, "
            "clean composition and professional YouTube production quality"
        ),
        "defaults": {
            "background": Background.clean_studio,
            "camera_framing": CameraFraming.medium,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.static,
            "lighting": Lighting.soft_studio,
            "visual_style": VisualStyle.realistic,
            "subject": Subject.creator,
        },
    },
    EnvironmentPreset.podcast: {
        "characteristics": (
            "a podcast recording room with a professional microphone on a desk, "
            "acoustic treatment on the walls, warm studio lighting and a "
            "professional podcast atmosphere"
        ),
        "defaults": {
            "background": Background.clean_studio,
            "camera_framing": CameraFraming.medium_close_up,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.static,
            "lighting": Lighting.warm,
            "visual_style": VisualStyle.cinematic,
            "subject": Subject.creator,
        },
    },
    EnvironmentPreset.office: {
        "characteristics": (
            "a modern office workspace with a desk and laptop, soft natural "
            "light and a realistic professional corporate atmosphere"
        ),
        "defaults": {
            "background": Background.modern_office,
            "camera_framing": CameraFraming.medium,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.static,
            "lighting": Lighting.natural,
            "visual_style": VisualStyle.professional,
            "subject": Subject.creator,
        },
    },
    EnvironmentPreset.home: {
        "characteristics": (
            "a realistic, comfortable home interior with natural window light, "
            "a casual creator setup, natural colours and a conversational feel"
        ),
        "defaults": {
            "background": Background.home_interior,
            "camera_framing": CameraFraming.medium,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.static,
            "lighting": Lighting.natural,
            "visual_style": VisualStyle.realistic,
            "subject": Subject.creator,
        },
    },
    EnvironmentPreset.outdoor: {
        "characteristics": (
            "a realistic outdoor location in natural daylight, with an "
            "environmental background, realistic shadows and subtle background "
            "movement, shot in a documentary creator style"
        ),
        "defaults": {
            "background": Background.outdoor,
            "camera_framing": CameraFraming.medium,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.handheld,
            "lighting": Lighting.natural,
            "visual_style": VisualStyle.documentary,
            "subject": Subject.creator,
        },
    },
    EnvironmentPreset.classroom: {
        "characteristics": (
            "a modern classroom with a whiteboard or display screen, an "
            "educational environment with clean lighting and instructional "
            "composition"
        ),
        "defaults": {
            "background": Background.classroom,
            "camera_framing": CameraFraming.medium,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.static,
            "lighting": Lighting.soft_studio,
            "visual_style": VisualStyle.educational,
            "subject": Subject.creator,
        },
    },
    EnvironmentPreset.product_demo: {
        "characteristics": (
            "a clean product-focused set with controlled lighting, professional "
            "commercial composition and emphasis on product detail"
        ),
        "defaults": {
            "background": Background.clean_studio,
            "camera_framing": CameraFraming.medium,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.slow_push_in,
            "lighting": Lighting.soft_studio,
            "visual_style": VisualStyle.commercial,
            "subject": Subject.product,
        },
    },
    EnvironmentPreset.cinematic: {
        "characteristics": (
            "a cinematic set with dramatic but realistic lighting, controlled "
            "composition, shallow depth of field, film-quality framing and "
            "realistic textures"
        ),
        "defaults": {
            "background": Background.clean_studio,
            "camera_framing": CameraFraming.medium_close_up,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.slow_push_in,
            "lighting": Lighting.dramatic,
            "visual_style": VisualStyle.cinematic,
            "subject": Subject.creator,
        },
    },
    EnvironmentPreset.custom: {
        # Nothing to assert about a set the creator is describing themselves.
        "characteristics": "",
        "defaults": {
            "background": Background.custom,
            "camera_framing": CameraFraming.medium,
            "camera_angle": CameraAngle.eye_level,
            "camera_movement": CameraMovement.static,
            "lighting": Lighting.soft_studio,
            "visual_style": VisualStyle.realistic,
            "subject": Subject.creator,
        },
    },
}


def environment_for_preset(preset: EnvironmentPreset) -> SceneEnvironment:
    """A whole setup from one choice — what picking a preset chip means."""
    return SceneEnvironment(preset=preset, **PRESETS[preset]["defaults"])
