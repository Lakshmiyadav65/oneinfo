"""
Turns a scene's filming setup into the visual prompt the video model reads.

This exists so the creator never has to write one. They pick "YouTube Studio"
and a framing; the sentences a video model responds to are assembled here,
where they can be corrected once for everybody rather than learned by each
creator through paid retries.

Content and production stay separate right up to this point: the storyboard
agent says what happens in the shot, the environment says how it is filmed,
and only here do the two become a single prompt.

The shape of that prompt is not invented here. It follows the labelled-block
format the creator already generates working reels with by hand - header
lines, then SCENE / DIALOGUE / ACTION / CAMERA / LIGHTING / ENVIRONMENT /
NEGATIVE PROMPT. Two things in it matter more than the rest:

  * DIALOGUE carries the voiceover verbatim, with a Spoken language header
    above it. Veo has no other way to know what language to speak: given
    only an English visual description it invents English dialogue, which
    is exactly how a Tenglish project came back in English.
  * NEGATIVE PROMPT suppresses subtitles. Veo will otherwise burn its own
    captions into the frame, and burnt-in text cannot be removed later.
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


# How to name the spoken language to the model. Tenglish gets a sentence
# rather than a word: "Tenglish" means nothing to Veo, and the instruction
# that actually works is to name Telugu, name the accent, and then forbid
# translating the line that follows.
_SPOKEN_LANGUAGE = {
    "english": (
        "English, spoken in a natural Indian English accent. "
        "Warm, energetic, conversational."
    ),
    "telugu": (
        "Telugu (Hyderabad/Telangana accent). "
        "Warm, energetic, conversational."
    ),
    "tenglish": (
        "Telugu (Hyderabad/Telangana accent), casually mixed with the everyday "
        "English words that appear in the dialogue. Warm, energetic, "
        "conversational - the way students actually talk in Hyderabad."
    ),
}

# Said after the language header, because naming a language is not enough on
# its own: Veo will happily render the meaning of a Telugu line in English.
_DIALOGUE_RULE = (
    "Speak the DIALOGUE below exactly as written, word for word. "
    "Do not translate it. Do not paraphrase it. Do not substitute English."
)

# Applied to every scene, from the creator's own working prompts. Subtitles
# lead the list on purpose - Veo burns them in, and burnt-in text survives
# every later step, so this is the one entry that cannot be fixed afterwards.
_NEGATIVE_PROMPT = (
    "No subtitles. No captions. No on-screen text or overlays. "
    "No readable text on screens, whiteboards, banners, posters or notebooks - "
    "keep all background text blurred. No visible brand logos or branding. "
    "No background music. No dubbing. No AI-generated look. "
    "No exaggerated theatrical acting. No fake reactions. No skin smoothing. "
    "No jump cuts. No slow motion. No dramatic zooms. No oversaturated colors."
)


def aspect_ratio_label(width: int, height: int) -> str:
    """Deprecated shape: prefer project_aspect_label, which reads the
    project's own setting rather than the global render size."""
    """
    The aspect line, derived from the size the final video is actually
    rendered at rather than stated independently.

    Kept honest deliberately: asking Veo for a vertical clip and then
    concatenating at a landscape size pillarboxes every scene, and the
    creator sees that only after paying for all of them.
    """
    if height > width:
        return f"9:16 Vertical ({width}x{height})"
    if width > height:
        return f"16:9 Horizontal ({width}x{height})"
    return f"1:1 Square ({width}x{height})"


def compose_visual_prompt(
    environment: SceneEnvironment,
    *,
    action: str,
    features_creator: bool,
    appearance_description: str | None = None,
    voice_description: str | None = None,
    dialogue: str = "",
    language: str = "english",
    aspect_ratio: str | None = None,
    scene_number: int | None = None,
    scene_count: int | None = None,
) -> str:
    """
    The full visual prompt for one scene, as a labelled block.

    `action` is what the storyboard agent said happens in the shot. It is kept
    verbatim in the middle of the prompt rather than paraphrased: it is the
    part tied to the script, and the part a creator may have edited by hand.

    `dialogue` is the scene's voiceover. It is reproduced exactly, quoted, and
    never rewritten - it is the only thing telling Veo what to say and in
    which language.
    """
    header: list[str] = []
    if aspect_ratio:
        header.append(f"Aspect Ratio: {aspect_ratio}")
    header.append(f"Style: {_STYLE[environment.visual_style]}")

    audio = "Native recorded audio. No music, no dubbing."
    if features_creator and voice_description:
        audio = f"{audio} {voice_description.strip().rstrip('.')}."
    header.append(f"Audio: {audio}")

    spoken = _SPOKEN_LANGUAGE.get(language, _SPOKEN_LANGUAGE["english"])
    header.append(f"Spoken language: {spoken} {_DIALOGUE_RULE}")

    # SCENE - the set, who is in it, and whether it has to match its
    # neighbours.
    scene: list[str] = []
    if environment.preset is EnvironmentPreset.custom:
        if environment.custom_setup.strip():
            scene.append(environment.custom_setup.strip().rstrip("."))
    else:
        characteristics = PRESETS[environment.preset]["characteristics"]
        if characteristics:
            scene.append(f"Filmed in {characteristics}")

    # The creator's appearance is repeated word for word on every on-camera
    # scene. Veo has no memory between clips, so identical wording is the
    # only thing holding one face steady across a video.
    if features_creator and appearance_description:
        scene.append(f"{appearance_description.strip().rstrip('.')}, speaking directly to camera")
    elif environment.subject in _SUBJECT:
        scene.append(_SUBJECT[environment.subject])

    # Continuity, for the same reason and by the same means: the clips are
    # generated separately and have to look like one recording.
    if scene_number and scene_count and scene_count > 1:
        scene.append(
            f"This is clip {scene_number} of {scene_count} from a single continuous "
            "recording. Keep the same person, the same outfit and hairstyle, the "
            "same location and the same lighting as the other clips"
        )

    # ENVIRONMENT - background and whatever the creator asked for by hand,
    # kept out of SCENE so a preset's own set description is not diluted.
    ambience: list[str] = []
    preset_background = PRESETS[environment.preset]["defaults"]["background"]
    if environment.background is Background.custom:
        if environment.custom_background.strip():
            ambience.append(environment.custom_background.strip().rstrip("."))
    elif environment.background is not preset_background and _BACKGROUND[environment.background]:
        ambience.append(f"Set against {_BACKGROUND[environment.background]}")
    if environment.additional_requirements.strip():
        ambience.append(environment.additional_requirements.strip().rstrip("."))

    camera = (
        f"Shot as {_FRAMING[environment.camera_framing]} "
        f"{_ANGLE[environment.camera_angle]}. "
        f"{_MOVEMENT[environment.camera_movement]}."
    )

    # Sentence-cased because the agent writes the action as a fragment
    # ("explaining hackathon failures") and it lands here as its own line.
    action_text = action.strip().rstrip(".")
    if action_text:
        action_text = action_text[0].upper() + action_text[1:] + "."

    sections: list[tuple[str, str]] = [
        ("SCENE", ". ".join(scene) + "." if scene else ""),
        # Quoted so the model reads it as speech rather than as description,
        # and left byte-for-byte as the creator approved it.
        ("DIALOGUE", f'"{dialogue.strip()}"' if dialogue.strip() else ""),
        ("ACTION", action_text),
        ("CAMERA", camera),
        ("LIGHTING", _LIGHTING[environment.lighting].capitalize() + "."),
        ("ENVIRONMENT", ". ".join(ambience) + "." if ambience else ""),
        ("NEGATIVE PROMPT", _NEGATIVE_PROMPT),
    ]

    body = "\n\n".join(f"{label}:\n{text}" for label, text in sections if text)
    return "\n".join(header) + "\n\n" + body
