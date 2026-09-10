"""
Turns a scene's filming setup into the visual prompt the video model reads.

This exists so the creator never has to write one. They pick "YouTube Studio"
and a framing; the sentences a video model responds to are assembled here,
where they can be corrected once for everybody rather than learned by each
creator through paid retries.

Content and production stay separate right up to this point: the storyboard
agent says what happens in the shot, the environment says how it is filmed,
and only here do the two become a single prompt.
"""

from app.schemas.environment import (
    PRESETS,
    Background,
    CameraAngle,
    CameraFraming,
    CameraMovement,
    EnvironmentPreset,
    Lighting,
    SceneEnvironment,
    Subject,
    VisualStyle,
)

_BACKGROUND = {
    Background.clean_studio: "a clean studio background",
    Background.modern_office: "a modern office background",
    Background.home_interior: "a home interior background",
    Background.outdoor: "an outdoor background",
    Background.classroom: "a classroom background",
    Background.custom: "",
}

_FRAMING = {
    CameraFraming.wide: "a wide shot",
    CameraFraming.medium: "a medium shot",
    CameraFraming.medium_close_up: "a medium close-up",
    CameraFraming.close_up: "a close-up",
    CameraFraming.over_the_shoulder: "an over-the-shoulder shot",
    CameraFraming.full_body: "a full-body shot",
}

_ANGLE = {
    CameraAngle.eye_level: "at eye level",
    CameraAngle.low_angle: "from a slightly low angle",
    CameraAngle.high_angle: "from a slightly high angle",
    CameraAngle.over_the_shoulder: "from over the shoulder",
}

_MOVEMENT = {
    CameraMovement.static: "The camera is static",
    CameraMovement.slow_push_in: "The camera slowly pushes in",
    CameraMovement.slow_pull_out: "The camera slowly pulls out",
    CameraMovement.handheld: "The camera has subtle handheld movement",
    CameraMovement.pan: "The camera pans slowly",
    CameraMovement.tracking: "The camera tracks the subject",
}

_LIGHTING = {
    Lighting.natural: "natural lighting",
    Lighting.soft_studio: "soft professional studio lighting",
    Lighting.warm: "warm lighting",
    Lighting.cool: "cool lighting",
    Lighting.dramatic: "dramatic lighting",
    Lighting.high_key: "bright high-key lighting",
    Lighting.low_key: "moody low-key lighting",
}

_STYLE = {
    VisualStyle.realistic: "Realistic, photographic quality with natural skin texture",
    VisualStyle.cinematic: "Cinematic film-quality treatment with shallow depth of field",
    VisualStyle.documentary: "Documentary style, natural and unstaged",
    VisualStyle.professional: "Polished professional production quality",
    VisualStyle.social_media: "Bright, punchy social-video production quality",
    VisualStyle.commercial: "Premium commercial production quality",
    VisualStyle.educational: "Clear, instructional production quality",
}

_SUBJECT = {
    Subject.product: "The product is the subject of the shot, shown clearly",
    Subject.people: "People are the subject of the shot",
    Subject.environment: "The environment itself is the subject of the shot",
    Subject.screen: "A screen or user interface is the subject of the shot",
}


def compose_visual_prompt(
    environment: SceneEnvironment,
    *,
    action: str,
    features_creator: bool,
    appearance_description: str | None = None,
    voice_description: str | None = None,
) -> str:
    """
    The full visual prompt for one scene.

    `action` is what the storyboard agent said happens in the shot. It is kept
    verbatim in the middle of the prompt rather than paraphrased: it is the
    part tied to the script, and the part a creator may have edited by hand.
    """
    parts: list[str] = []

    # 1. The set. A custom preset says whatever the creator typed; the rest
    #    carry the wording that makes the preset mean something to the model.
    if environment.preset is EnvironmentPreset.custom:
        if environment.custom_setup.strip():
            parts.append(environment.custom_setup.strip().rstrip("."))
    else:
        characteristics = PRESETS[environment.preset]["characteristics"]
        if characteristics:
            parts.append(f"Filmed in {characteristics}")

    # 2. The background, but only when it says something the preset has not.
    #    A preset already describes its own set, so repeating its default
    #    background back at the model is noise competing with the rest.
    preset_background = PRESETS[environment.preset]["defaults"]["background"]
    if environment.background is Background.custom:
        if environment.custom_background.strip():
            parts.append(environment.custom_background.strip().rstrip("."))
    elif environment.background is not preset_background and _BACKGROUND[environment.background]:
        parts.append(f"Set against {_BACKGROUND[environment.background]}")

    # 3. Who or what is in frame. An on-camera scene repeats the creator's
    #    appearance word for word - Veo has no memory between clips, so
    #    identical wording is the only thing holding a face steady across a
    #    video. Same reasoning as the storyboard agent's on-camera rule.
    if features_creator and appearance_description:
        parts.append(f"{appearance_description.strip().rstrip('.')}, speaking directly to camera")
    elif environment.subject in _SUBJECT:
        parts.append(_SUBJECT[environment.subject])

    # 4. What happens, from the storyboard. Sentence-cased because it is
    #    written as a fragment ("explaining hackathon failures") and lands
    #    mid-prompt as its own sentence.
    action_text = action.strip().rstrip(".")
    if action_text:
        parts.append(action_text[0].upper() + action_text[1:])

    # 5. How it is shot.
    parts.append(
        f"Shot as {_FRAMING[environment.camera_framing]} "
        f"{_ANGLE[environment.camera_angle]}"
    )
    parts.append(_MOVEMENT[environment.camera_movement])
    parts.append(_LIGHTING[environment.lighting].capitalize())
    parts.append(_STYLE[environment.visual_style])

    # 6. Anything the creator asked for by hand, last so it is not diluted.
    if environment.additional_requirements.strip():
        parts.append(environment.additional_requirements.strip().rstrip("."))

    if features_creator and voice_description:
        parts.append(voice_description.strip().rstrip("."))

    return ". ".join(part for part in parts if part) + "."
