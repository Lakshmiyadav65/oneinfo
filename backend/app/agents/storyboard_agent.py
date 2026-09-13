from typing import cast

from app.providers.llm.base import LLMProvider
from app.providers.speech import WORDS_PER_SECOND
from app.schemas.agents import StoryboardOutput


def word_range(seconds: int) -> tuple[int, int]:
    """
    How many words fill a clip of this length without overflowing it.

    A range, not a target, and the two ends fail differently. Under the
    floor the video model drawls the line out to fill the clip; over the
    ceiling the clip ends mid-sentence. The band is deliberately not
    centred - it sits slightly low, because a held beat at the end of a
    scene is survivable and a cut-off word is not.
    """
    words = seconds * WORDS_PER_SECOND
    return round(words * 0.8), round(words * 1.05)


async def run_storyboard_agent(
    llm: LLMProvider,
    *,
    script_content: str,
    estimated_duration_seconds: int | None,
    allowed_durations: tuple[int, ...] | None = None,
    reference_durations: tuple[int, ...] | None = None,
    creator_on_camera: bool = False,
    appearance_description: str | None = None,
    voice_description: str | None = None,
) -> StoryboardOutput:
    if allowed_durations:
        options = ", ".join(str(d) for d in sorted(allowed_durations))
        budget = ", ".join(
            f"{d}s takes {word_range(d)[0]}-{word_range(d)[1]} words"
            for d in sorted(allowed_durations)
        )
        duration_rule = (
            f"Each scene's duration MUST be exactly one of: {options} seconds. "
            "No other value is allowed - the video model rejects anything else. "
            "Choose the combination whose total is closest to the estimated "
            "duration, adding or removing scenes as needed.\n"
            "MATCH THE LINE TO THE CLIP. A clip runs for its full length "
            f"whatever you put in it, and speech runs at about "
            f"{WORDS_PER_SECOND} words a second, so: {budget}. Every "
            "voiceover must land inside the range for the duration you chose. "
            "Too short and the video model stretches the words across the "
            "whole clip - it comes out drawled, with the speaker apparently "
            "pausing for no reason. Too long and the clip ends mid-sentence. "
            "Count the words before you settle on a duration."
        )
    else:
        duration_rule = (
            "Scene durations should roughly sum to the script's estimated duration."
        )

    if creator_on_camera:
        # On-camera scenes cost several times a b-roll scene, so the agent is
        # steered towards the shots where a presenter actually earns it -
        # opening hook and closing call to action - rather than every scene.
        camera_rule = (
            "The creator can appear on camera. Set features_creator to true ONLY "
            "for scenes where they speak directly to the viewer - typically the "
            "opening hook and the closing line. Every other scene must be b-roll "
            "with features_creator false, illustrating the voiceover without the "
            "creator in frame. On-camera scenes cost several times more, so use "
            "at most two of them.\n"
            # "Without the creator in frame" excluded one person and invited
            # another: the agent wrote "someone sketching on a whiteboard",
            # the model obliged, and the video cut from the creator to a
            # stranger presenting their script. B-roll means no people.
            "A b-roll visual_prompt must contain NO PEOPLE AT ALL - not the "
            "creator, and not an anonymous person either. Never write "
            "'someone', 'a person', 'a developer' or any human subject "
            "into one. Describe the thing being talked about instead: the "
            "screen, the code, the whiteboard already drawn on, the object, "
            "the place, the written words. If the point only makes sense "
            "with a person doing it, show what they would have made rather "
            "than them making it.\n"
            "For an on-camera scene, the visual_prompt must describe the creator "
            "speaking to camera and MUST begin with this description of them, "
            "copied word for word:\n"
            f"{appearance_description or 'the creator'}\n"
        )
        if voice_description:
            camera_rule += (
                "End every on-camera visual_prompt with this voice description, "
                f"copied word for word: {voice_description}\n"
            )
        if reference_durations:
            ref_options = ", ".join(str(d) for d in sorted(reference_durations))
            low, high = word_range(max(reference_durations))
            camera_rule += (
                f"An on-camera scene MUST be exactly {ref_options} second(s) long - "
                "the video model allows no other length while the creator is in "
                "frame. Scenes without the creator keep the durations above.\n"
                "Because that length cannot move, the line has to be written to "
                f"fit it exactly: between {low} and {high} words. This is the "
                "scene that goes wrong most often. A nine-word hook in an "
                "eight-second clip is the single biggest source of dead air in "
                "a finished video, and no later step can fix it.\n"
            )
    else:
        camera_rule = (
            "The creator does not appear in this video. Set features_creator to "
            "false on every scene.\n"
        )

    # The budget for the whole video, not per scene. Without it the agent
    # re-times the script instead of fitting it: asked for fifteen seconds it
    # kept every word of a forty-second script and returned six scenes
    # totalling thirty-six, because nothing in the prompt ever said that
    # leaving something out was allowed.
    total_rule = ""
    if estimated_duration_seconds:
        total_words = round(estimated_duration_seconds * WORDS_PER_SECOND)
        total_rule = (
            f"THE WHOLE VIDEO IS {estimated_duration_seconds} SECONDS. That is "
            f"about {total_words} words of speech across every scene put "
            "together, and it is a hard budget rather than a target to "
            "approach from below. If the script says more than fits, leave "
            "things out: cover the most important beats properly and drop the "
            "rest. A rushed tour of every point is worse than a clear run at "
            "the ones that matter, and going over budget is not an option - "
            "it is what the creator is billed for.\n"
        )

    prompt = (
        "SYSTEM: You are OneInfo's storyboard assistant. Break the "
        "approved script into an ordered sequence of short video scenes. "
        "The script arrives as labelled beats: a bare label on its own line "
        "(Hook, Curiosity, Value, CTA) followed by the spoken line in double "
        "quotes. Only the quoted text is said out loud - never put a label "
        "into a voiceover, and keep each voiceover in the same language as "
        "the quoted line it came from. "
        "Each scene needs a duration in seconds, the voiceover line spoken "
        "during it, a visual_prompt describing what should be shown, and a "
        "short on-screen caption. Number scenes consecutively starting at 1, "
        "with no gaps and no repeats.\n"
        f"{total_rule}"
        f"{duration_rule}\n"
        f"{camera_rule}\n"
        f"SCRIPT: {script_content}\n"
        f"ESTIMATED DURATION SECONDS: {estimated_duration_seconds or 45}\n"
    )
    result = await llm.generate_structured(prompt, StoryboardOutput)
    return cast(StoryboardOutput, result)
