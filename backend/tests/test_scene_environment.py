"""
The filming setup, and the prompt it turns into.

The point of the setup is that a creator never writes a video prompt. These
check the translation holds: every preset produces a usable shot, the
creator's own words survive, and the parts that cost money stay honest.
"""

import pytest

from app.agents.environment_prompt import compose_visual_prompt
from app.schemas.environment import (
    PRESETS,
    Background,
    CameraFraming,
    CameraMovement,
    EnvironmentPreset,
    Lighting,
    SceneEnvironment,
    Subject,
    VisualStyle,
    environment_for_preset,
)


@pytest.mark.parametrize("preset", list(EnvironmentPreset))
def test_every_preset_builds_a_complete_setup(preset):
    """A preset chip is one click; it has to settle every control behind it."""
    environment = environment_for_preset(preset)

    assert environment.preset is preset
    assert isinstance(environment.background, Background)
    assert isinstance(environment.camera_framing, CameraFraming)
    assert isinstance(environment.camera_movement, CameraMovement)
    assert isinstance(environment.lighting, Lighting)
    assert isinstance(environment.visual_style, VisualStyle)
    assert isinstance(environment.subject, Subject)


@pytest.mark.parametrize("preset", list(EnvironmentPreset))
def test_every_preset_produces_a_prompt(preset):
    prompt = compose_visual_prompt(
        environment_for_preset(preset), action="a person at a desk", features_creator=False
    )

    assert prompt.endswith(".")
    assert "a person at a desk".capitalize() in prompt
    # Framing, movement, lighting and style are never optional: an empty one
    # would leave the model to invent that part of the shot.
    assert "Shot as" in prompt
    assert "camera" in prompt.lower()


def test_the_smart_defaults_match_what_each_preset_is_for():
    assert PRESETS[EnvironmentPreset.podcast]["defaults"]["camera_framing"] is (
        CameraFraming.medium_close_up
    )
    assert PRESETS[EnvironmentPreset.outdoor]["defaults"]["camera_movement"] is (
        CameraMovement.handheld
    )
    assert PRESETS[EnvironmentPreset.product_demo]["defaults"]["subject"] is Subject.product
    assert PRESETS[EnvironmentPreset.product_demo]["defaults"]["camera_movement"] is (
        CameraMovement.slow_push_in
    )


def test_an_on_camera_scene_repeats_the_appearance_word_for_word():
    """
    Veo has no memory between clips, so the same description has to reach
    every on-camera scene unchanged or the face drifts across the video.
    """
    appearance = "A young Indian man in his mid-twenties wearing a white polo shirt"
    prompt = compose_visual_prompt(
        environment_for_preset(EnvironmentPreset.youtube_studio),
        action="talking to camera",
        features_creator=True,
        appearance_description=appearance,
    )

    assert appearance in prompt
    assert "speaking directly to camera" in prompt


def test_a_b_roll_scene_never_describes_the_creator():
    """
    The bug this guards: a scene toggled off camera kept the creator's
    description in its prompt, so the model drew a lookalike while the
    reference photo went unused - and it was billed as b-roll.
    """
    appearance = "A young Indian man in a white polo shirt"
    prompt = compose_visual_prompt(
        environment_for_preset(EnvironmentPreset.product_demo),
        action="a laptop on a desk",
        features_creator=False,
        appearance_description=appearance,
    )

    assert appearance not in prompt
    assert "product is the subject" in prompt


def test_a_custom_setup_uses_the_creators_own_words():
    environment = SceneEnvironment(
        preset=EnvironmentPreset.custom,
        custom_setup="A modern Bengaluru startup office with a large glass wall",
    )
    prompt = compose_visual_prompt(environment, action="talking", features_creator=False)

    assert "Bengaluru startup office" in prompt
    # Nothing invented on top of what they described.
    assert "Filmed in a modern creator studio" not in prompt


def test_additional_requirements_are_carried_through():
    environment = environment_for_preset(EnvironmentPreset.youtube_studio)
    environment.additional_requirements = "Keep a laptop visible on the desk"
    prompt = compose_visual_prompt(environment, action="talking", features_creator=False)

    assert "Keep a laptop visible on the desk" in prompt


def test_a_preset_does_not_repeat_its_own_background():
    """The preset already describes its set; saying it twice competes with
    the rest of the prompt for the model's attention."""
    environment = environment_for_preset(EnvironmentPreset.youtube_studio)
    prompt = compose_visual_prompt(environment, action="talking", features_creator=False)

    assert "Set against" not in prompt


def test_an_overridden_background_is_stated():
    environment = environment_for_preset(EnvironmentPreset.youtube_studio)
    environment.background = Background.outdoor
    prompt = compose_visual_prompt(environment, action="talking", features_creator=False)

    assert "Set against an outdoor background" in prompt


def test_the_setup_carries_no_on_camera_flag_of_its_own():
    """
    features_creator lives on the scene, where it decides which model the
    scene is billed against. A second copy here would eventually disagree
    with it, and the disagreement would be about money.
    """
    assert "on_camera" not in SceneEnvironment.model_fields


def test_dialogue_reaches_the_prompt_verbatim():
    """
    The bug this guards: Veo was only ever sent visual_prompt, so it invented
    English dialogue for a Tenglish project. The voiceover has to arrive
    unedited, or the video speaks a language nobody chose.
    """
    line = "Bro... August 2nd na Infosys exam! Ee video end varuku chudu."
    prompt = compose_visual_prompt(
        SceneEnvironment(),
        action="walking through campus",
        features_creator=True,
        dialogue=line,
        language="tenglish",
    )

    assert f'"{line}"' in prompt
    assert "DIALOGUE:" in prompt
    # Naming the language is not enough on its own - Veo will render a Telugu
    # line's meaning in English unless told outright not to.
    assert "Telugu" in prompt
    assert "Do not translate it" in prompt


def test_captions_are_suppressed_on_every_scene():
    """Burnt-in text cannot be removed after generation, so this one is not
    optional and does not depend on any creator setting."""
    prompt = compose_visual_prompt(
        SceneEnvironment(), action="talking", features_creator=False
    )
    assert "No subtitles" in prompt
    assert "No captions" in prompt


def test_continuity_is_stated_only_for_a_multi_clip_video():
    environment = SceneEnvironment()
    across = compose_visual_prompt(
        environment,
        action="talking",
        features_creator=False,
        scene_number=2,
        scene_count=5,
    )
    assert "clip 2 of 5" in across
    assert "same outfit" in across

    alone = compose_visual_prompt(
        environment,
        action="talking",
        features_creator=False,
        scene_number=1,
        scene_count=1,
    )
    assert "clip 1 of 1" not in alone


def test_aspect_line_follows_the_size_we_actually_render():
    from app.agents.environment_prompt import aspect_ratio_label

    assert aspect_ratio_label(1080, 1920).startswith("9:16")
    assert aspect_ratio_label(1280, 720).startswith("16:9")
