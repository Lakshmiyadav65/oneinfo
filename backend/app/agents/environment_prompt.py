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

import re

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
    # "Uncluttered", not "blank". A genuinely empty wall gives the lens
    # nothing to defocus, and the shot comes back looking pasted together.
    Background.clean_studio: "an uncluttered studio background with real depth behind it",
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

# The lens, chosen from the framing rather than asked for separately.
#
# A shot description with no optics in it is the largest single tell that
# footage was rendered: real cameras have a focal length and an aperture, and
# those decide how much of the room is sharp behind the subject. Without
# them Veo tends to hold everything in focus at once, which no camera does
# and which the eye reads as a game engine.
_LENS = {
    CameraFraming.wide: (
        "Shot on a 24mm lens at f/4, deep focus, the room readable behind the subject"
    ),
    CameraFraming.medium: (
        "Shot on a 35mm lens at f/2.8, the background falling gently out of focus"
    ),
    CameraFraming.medium_close_up: (
        "Shot on a 50mm lens at f/2, shallow depth of field, the background soft"
    ),
    CameraFraming.close_up: (
        "Shot on an 85mm lens at f/1.8, very shallow depth of field, only the eyes "
        "critically sharp"
    ),
    CameraFraming.over_the_shoulder: (
        "Shot on a 50mm lens at f/2, the foreground shoulder soft and out of focus"
    ),
    CameraFraming.full_body: (
        "Shot on a 35mm lens at f/4, the whole figure held in focus"
    ),
}

# Said on every scene, whatever the style or the set.
#
# None of the style options ask for a drawing - they ask for footage, and
# differ in how it is graded. What separated the output from footage was
# never the grade: it was skin with no pores, cloth with no weave, light
# that arrived from everywhere at once, and a backdrop with nothing behind
# it. Each line here names one of those.
_REALISM = (
    "Real camera footage, not a render. Recorded on a full-frame mirrorless "
    "camera at 24fps with natural motion blur and fine sensor grain in the "
    "shadows. Natural skin with visible pores, fine lines, stray hairs and "
    "small asymmetries - a real face, not a corrected one. Real fabric with "
    "visible weave, creases where it folds and a little wear. Surfaces carry "
    "dust, fingerprints and small marks. Light comes from one dominant "
    "source with soft physically plausible falloff and shadows that agree "
    "with it, and the colour temperature varies slightly across the frame "
    "rather than sitting flat."
)

# The background, as a place rather than a colour.
#
# "A clean studio background" is a wall. A room that is genuinely empty
# behind the subject has nothing for a lens to defocus, so the shot comes
# back looking pasted together - which is the specific complaint this
# answers.
_BACKGROUND_DEPTH = (
    "The background is a real place with depth: several planes of actual "
    "objects receding behind the subject, softly out of focus, lit by the "
    "same light as the subject - never a flat backdrop."
)

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
    "No jump cuts. No slow motion. No dramatic zooms. No oversaturated colors. "
    # The render tells, named one at a time. "No AI-generated look" above is
    # a category; these are the specific artefacts a viewer actually notices,
    # and a model given the specifics avoids more of them than one given the
    # category.
    "No plastic or waxy skin. No airbrushed faces. No perfectly symmetrical "
    "features. No dead or glassy eyes. No warped, extra or merged fingers. "
    "No floating or intersecting objects. No flat empty backdrop. No uniform "
    "shadowless lighting. No 3D render, no CGI, no video-game look."
)

# Added to a scene the creator is not in.
#
# Nothing used to say this, and the silence was the bug. A b-roll scene's
# prompt described a studio, gave it a line to say, and never mentioned who
# was in frame - so Veo invented someone, and the creator's video cut from
# them to a stranger presenting their script. It reads as a different
# creator, which is worse than an empty shot in every way that matters.
_NO_PEOPLE = (
    "No people on camera. No face. No presenter, host or narrator in frame. "
    "No person speaking to camera."
)

# Added to a scene the creator IS in, for the other half of the same
# problem: a second invented person standing next to them.
_NO_OTHER_PEOPLE = "No other people in the shot besides the person described."


def _negative_prompt(*, features_creator: bool, subject: Subject) -> str:
    """
    The negatives for this scene, not for scenes in general.

    Whether a person belongs in the shot is the one entry that cannot be
    written once for everything: it is the difference between the creator's
    own piece to camera, a deliberate shot of people, and a cutaway that
    should have nobody in it at all.
    """
    if subject is Subject.people:
        # People are what the creator asked to see. Saying "no people" here
        # would contradict the SCENE line directly above it.
        return _NEGATIVE_PROMPT
    tail = _NO_OTHER_PEOPLE if features_creator else _NO_PEOPLE
    return f"{_NEGATIVE_PROMPT} {tail}"


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

    # The voice belongs to the whole video, not to the scenes the creator is
    # visible in.
    #
    # It used to be named only on on-camera scenes, so every b-roll clip was
    # cast from nothing - and Veo, asked for narration and told nothing
    # about the narrator, picked a different one each time. One video came
    # back with a woman reading one clip and a man reading the next. Being
    # off screen changes the picture; it does not change who is speaking.
    audio = ["Native recorded audio. No music, no dubbing."]
    if voice_description:
        audio.append(f"{voice_description.strip().rstrip('.')}.")
    if not features_creator:
        # Nobody is in frame here and the negatives say so, and a line still
        # has to come from somewhere. Saying where stops the model resolving
        # that by putting a speaker back in the shot.
        audio.append("The line is delivered as an off-screen voiceover.")
    # Said on every scene, and said even when no description is on file: it
    # is the only thing holding one narrator across clips the model
    # generates separately and with no memory of each other.
    audio.append(
        "One narrator for the whole video - the same voice, accent, age and "
        "gender in every clip."
    )
    header.append("Audio: " + " ".join(audio))

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

    # Who is in the shot, said outright in every case.
    #
    # It used to be said only when the creator was in it and had an
    # appearance on file. Every other scene left it out, and an unanswered
    # question is not an empty answer: given a studio, a line to say and
    # nobody named, Veo puts a presenter of its own invention in the frame.
    # The creator's video then cuts from them to a stranger saying their
    # script.
    #
    # The creator's appearance is repeated word for word on every on-camera
    # scene. Veo has no memory between clips, so identical wording is the
    # only thing holding one face steady across a video.
    if features_creator:
        if appearance_description:
            scene.append(
                f"{appearance_description.strip().rstrip('.')}, speaking directly to camera"
            )
        else:
            scene.append("The presenter speaks directly to camera")
    elif environment.subject is Subject.people:
        scene.append(_SUBJECT[Subject.people])
    elif environment.subject in _SUBJECT:
        scene.append(f"{_SUBJECT[environment.subject]}, with nobody on camera")
    else:
        # Subject.creator on a scene the creator is not in - the default
        # setup, on the scenes that are b-roll precisely because the
        # creator left the box unticked.
        scene.append(
            "A b-roll cutaway with nobody on camera, showing what the line "
            "describes rather than a person saying it"
        )

    # Said last, so it is the final word on a question the rest of the
    # prompt keeps reopening.
    #
    # Two things above this outrank a negative. The set can imply a person -
    # "a modern creator studio with a desk setup" is a room built for
    # someone to sit in - and the ACTION can name one outright: storyboards
    # written before the agent was told otherwise say things like "someone
    # sketching on a whiteboard". Both are positive instructions, and a
    # positive instruction beats an entry on a list of things to avoid. So
    # the conflict is resolved here in words rather than left to the model.
    if not features_creator and environment.subject is not Subject.people:
        scene.append(
            "Nobody appears in this shot at all - no presenter, no bystander, "
            "no hands, no reflection of a person. Where the set or the action "
            "below implies someone, show only what they would be working on: "
            "the screen, the whiteboard already drawn on, the desk, the "
            "object, the place. An empty frame of the right thing is correct "
            "here; a person is not"
        )

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

    # The lens travels with the framing. Asking for "a close-up" describes
    # what is in the frame; adding the glass describes what a camera does
    # with it, which is the part that decides whether the shot looks
    # photographed or assembled.
    camera = (
        f"Shot as {_FRAMING[environment.camera_framing]} "
        f"{_ANGLE[environment.camera_angle]}. "
        f"{_LENS[environment.camera_framing]}. "
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
        # Its own block rather than another clause on the style header. It
        # is the longest instruction in the prompt and the one carrying the
        # difference between footage and a render, and a labelled block is
        # read as an instruction where a trailing clause is read as flavour.
        ("REALISM", f"{_REALISM} {_BACKGROUND_DEPTH}"),
        (
            "NEGATIVE PROMPT",
            _negative_prompt(
                features_creator=features_creator, subject=environment.subject
            ),
        ),
    ]

    body = "\n\n".join(f"{label}:\n{text}" for label, text in sections if text)
    return "\n".join(header) + "\n\n" + body


# The DIALOGUE block, from its label to the next labelled section. Written
# against the shape compose_visual_prompt builds above, which is the only
# thing that writes these prompts.
_DIALOGUE_SECTION = re.compile(
    r"^DIALOGUE:\n.*?(?=\n\n[A-Z][A-Z ]*:\n|\Z)", re.MULTILINE | re.DOTALL
)


def replace_dialogue(prompt: str, dialogue: str) -> str | None:
    """
    Swaps the spoken line inside an already-written prompt, leaving the rest
    of it untouched. None when the prompt has no DIALOGUE block to swap.

    For the one case a full rebuild cannot serve: the creator has written
    this scene's prompt by hand, and has now changed what is said in it.
    Rebuilding would throw their wording away; leaving the prompt alone
    would generate a clip speaking the words they just deleted. Neither is
    what they asked for, and the second one is billed.
    """
    line = dialogue.strip()
    replacement = f'DIALOGUE:\n"{line}"' if line else ""
    if not _DIALOGUE_SECTION.search(prompt):
        return None
    return _DIALOGUE_SECTION.sub(lambda _: replacement, prompt, count=1)


# The Spoken language header line, which is its own line in the header block.
_SPOKEN_HEADER = re.compile(r"^Spoken language: .*$", re.MULTILINE)


def replace_spoken_language(prompt: str, language: str) -> str | None:
    """
    Retargets the language an already-written prompt speaks in. None when
    the prompt has no Spoken language header to retarget.

    The companion to replace_dialogue, and needed for the same reason: a
    creator who wrote this prompt by hand and has now changed the project's
    language would otherwise get a clip whose dialogue is Telugu and whose
    instructions still say English. Veo resolves that disagreement by
    speaking English, which is the bug this exists to prevent.
    """
    if not _SPOKEN_HEADER.search(prompt):
        return None
    spoken = _SPOKEN_LANGUAGE.get(language, _SPOKEN_LANGUAGE["english"])
    return _SPOKEN_HEADER.sub(
        lambda _: f"Spoken language: {spoken} {_DIALOGUE_RULE}", prompt, count=1
    )
