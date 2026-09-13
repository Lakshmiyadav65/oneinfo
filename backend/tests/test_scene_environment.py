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


def test_render_size_follows_shape_and_resolution():
    """
    A vertical project stitched at the configured landscape pair pillarboxes
    every scene - and the creator finds out only after paying for all of them.
    """
    from app.schemas.output_settings import AspectRatio, OutputSettings, Resolution
    from app.services.project_service import output_size

    def size(aspect: AspectRatio, resolution: Resolution) -> tuple[int, int]:
        return output_size(OutputSettings(aspect_ratio=aspect, resolution=resolution))

    assert size(AspectRatio.vertical, Resolution.hd) == (720, 1280)
    assert size(AspectRatio.vertical, Resolution.full_hd) == (1080, 1920)
    assert size(AspectRatio.landscape, Resolution.hd) == (1280, 720)
    assert size(AspectRatio.landscape, Resolution.full_hd) == (1920, 1080)

    # libx264 with yuv420p rejects an odd dimension outright.
    for aspect in AspectRatio:
        for resolution in Resolution:
            width, height = size(aspect, resolution)
            assert width % 2 == 0 and height % 2 == 0


def test_b_roll_says_nobody_is_in_the_shot():
    """
    An unanswered question is not an empty answer.

    A b-roll prompt used to describe a studio, hand over a line to say, and
    never mention who was in frame. Veo filled the silence with a presenter
    of its own, so the creator's video cut from them to a stranger reading
    their script - which looks less like a missing shot than like a
    different creator.
    """
    prompt = compose_visual_prompt(
        environment_for_preset(EnvironmentPreset.youtube_studio),
        action="explaining the roadmap",
        features_creator=False,
        dialogue="First, master the basics.",
    )

    assert "nobody on camera" in prompt
    negative = prompt.split("NEGATIVE PROMPT:")[1]
    assert "No people on camera" in negative
    assert "No face" in negative


def test_a_shot_of_people_is_not_told_to_have_none_in_it():
    """
    People are what the creator asked for here, so the negatives must not
    argue with the line above them. A prompt that says both is a prompt the
    model resolves however it likes.
    """
    prompt = compose_visual_prompt(
        SceneEnvironment(subject=Subject.people),
        action="students in a lab",
        features_creator=False,
    )

    assert "People are the subject" in prompt
    assert "No people on camera" not in prompt


def test_an_on_camera_scene_rules_out_everyone_else():
    """The other half of the same problem: a second invented person standing
    beside the creator, who is the only one the reference photo describes."""
    prompt = compose_visual_prompt(
        environment_for_preset(EnvironmentPreset.youtube_studio),
        action="talking to camera",
        features_creator=True,
        appearance_description="A woman in her thirties",
    )

    assert "No other people in the shot" in prompt
    assert "No people on camera" not in prompt


def test_an_on_camera_scene_with_no_appearance_on_file_still_names_a_presenter():
    """Otherwise it falls through to the b-roll wording and tells the model
    nobody is in a shot the reference photo is about to be attached to."""
    prompt = compose_visual_prompt(
        environment_for_preset(EnvironmentPreset.youtube_studio),
        action="talking to camera",
        features_creator=True,
    )

    assert "speaks directly to camera" in prompt
    assert "nobody on camera" not in prompt


def test_the_voice_is_named_on_b_roll_too():
    """
    The bug this guards, reported as "the b-rolls use both female and male
    voices". The voice was named only on scenes the creator appeared in, so
    every b-roll clip was cast from nothing - and Veo, asked for narration
    and told nothing about the narrator, picked a different one per clip.
    Being off screen changes the picture, not who is speaking.
    """
    voice = "Warm, conversational, Indian English accent"

    b_roll = compose_visual_prompt(
        environment_for_preset(EnvironmentPreset.youtube_studio),
        action="typing at a laptop",
        features_creator=False,
        voice_description=voice,
    )

    assert voice in b_roll
    assert "off-screen voiceover" in b_roll


def test_every_scene_asks_for_one_narrator():
    """
    Said even with no description on file, and said on every scene. Veo has
    no memory between clips, so this is the only thing holding one voice
    across a video generated one clip at a time - the same reason the
    appearance is repeated word for word.
    """
    for features_creator in (True, False):
        prompt = compose_visual_prompt(
            environment_for_preset(EnvironmentPreset.youtube_studio),
            action="talking to camera",
            features_creator=features_creator,
        )

        assert "One narrator for the whole video" in prompt


@pytest.mark.parametrize("framing", list(CameraFraming))
def test_every_framing_carries_a_lens(framing):
    """
    A shot description with no optics in it is the largest single tell that
    footage was rendered. Asked for "a close-up" and nothing else, Veo holds
    the whole room in focus at once - which no camera does, and which the
    eye reads as a game engine rather than as a mistake.
    """
    prompt = compose_visual_prompt(
        SceneEnvironment(camera_framing=framing),
        action="talking to camera",
        features_creator=False,
    )

    camera = prompt.split("CAMERA:")[1].split("LIGHTING:")[0]
    assert "mm lens" in camera
    assert "f/" in camera


@pytest.mark.parametrize("style", list(VisualStyle))
def test_realism_is_asked_for_whatever_the_style(style):
    """
    None of the styles ask for a drawing - they ask for footage and differ
    in how it is graded. What separated the output from footage was never
    the grade: skin with no pores, cloth with no weave, light from
    everywhere at once, and a backdrop with nothing behind it.
    """
    prompt = compose_visual_prompt(
        SceneEnvironment(visual_style=style),
        action="talking to camera",
        features_creator=True,
        appearance_description="A woman in her thirties",
    )

    realism = prompt.split("REALISM:")[1].split("NEGATIVE PROMPT:")[0]
    assert "not a render" in realism
    assert "visible pores" in realism
    assert "never a flat backdrop" in realism


def test_the_render_tells_are_named_one_at_a_time():
    """"No AI-generated look" is a category. These are the artefacts a
    viewer actually notices, and naming them beats naming the category."""
    negative = compose_visual_prompt(
        SceneEnvironment(), action="talking", features_creator=False
    ).split("NEGATIVE PROMPT:")[1]

    for tell in ("plastic or waxy skin", "warped, extra or merged fingers",
                 "flat empty backdrop", "video-game look"):
        assert tell in negative


def test_the_set_does_not_argue_with_the_depth_instruction():
    """The studio preset used to ask for "a clean background" while the
    realism block asked for never a flat backdrop. A prompt that says both
    is one the model resolves however it likes."""
    prompt = compose_visual_prompt(
        environment_for_preset(EnvironmentPreset.youtube_studio),
        action="talking to camera",
        features_creator=False,
    )

    assert "clean background" not in prompt
    assert "never a flat backdrop" in prompt


def test_an_action_that_names_a_person_is_overruled_on_b_roll():
    """
    The reason the first fix was not enough. Two things outrank a negative:
    the set, which can be a room built for someone to sit in, and the
    ACTION, which storyboards written before the agent knew better fill with
    "someone sketching on a whiteboard". Both are positive instructions, and
    a positive instruction beats an entry on a list of things to avoid.
    """
    prompt = compose_visual_prompt(
        environment_for_preset(EnvironmentPreset.youtube_studio),
        action="fast-paced montage of someone sketching diagrams and typing code",
        features_creator=False,
    )

    scene = prompt.split("SCENE:")[1].split("DIALOGUE:")[0]
    assert "Nobody appears in this shot at all" in scene
    assert "no hands" in scene
    # Stated after the set, so it is the last word rather than the first.
    assert scene.index("Nobody appears") > scene.index("creator studio")


def test_the_override_leaves_a_deliberate_shot_of_people_alone():
    prompt = compose_visual_prompt(
        SceneEnvironment(subject=Subject.people),
        action="students working in a lab",
        features_creator=False,
    )

    assert "Nobody appears in this shot at all" not in prompt


async def test_the_agent_is_told_b_roll_means_no_people():
    """
    The source of the bug rather than the symptom. "Without the creator in
    frame" excluded one person and invited another, and the agent duly
    wrote "someone sketching on a whiteboard" into a b-roll visual.
    """
    from app.agents.storyboard_agent import run_storyboard_agent
    from app.providers.llm.dev_provider import DevLLMProvider

    seen: dict[str, str] = {}

    class Capturing(DevLLMProvider):
        async def generate_structured(self, prompt, schema, *, model=None):
            seen["prompt"] = prompt
            return await super().generate_structured(prompt, schema, model=model)

    await run_storyboard_agent(
        Capturing(),
        script_content='Hook\n"Something."',
        estimated_duration_seconds=30,
        allowed_durations=(4, 6, 8),
        creator_on_camera=True,
        appearance_description="A woman in her thirties",
    )

    assert "NO PEOPLE AT ALL" in seen["prompt"]
    assert "'someone'" in seen["prompt"]
