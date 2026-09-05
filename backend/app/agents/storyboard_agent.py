from typing import cast

from app.providers.llm.base import LLMProvider
from app.schemas.agents import StoryboardOutput


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
        duration_rule = (
            f"Each scene's duration MUST be exactly one of: {options} seconds. "
            "No other value is allowed - the video model rejects anything else. "
            "Choose the combination whose total is closest to the estimated "
            "duration, adding or removing scenes as needed."
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
            camera_rule += (
                f"An on-camera scene MUST be exactly {ref_options} second(s) long - "
                "the video model allows no other length while the creator is in "
                "frame. Scenes without the creator keep the durations above.\n"
            )
        camera_rule += (
            "Keep the spoken line in an on-camera scene under 20 words so it fits "
            "the clip length.\n"
        )
    else:
        camera_rule = (
            "The creator does not appear in this video. Set features_creator to "
            "false on every scene.\n"
        )

    prompt = (
        "SYSTEM: You are OneInfo's storyboard assistant. Break the "
        "approved script into an ordered sequence of short video scenes. "
        "Each scene needs a duration in seconds, the voiceover line spoken "
        "during it, a visual_prompt describing what should be shown, and a "
        "short on-screen caption. Number scenes consecutively starting at 1, "
        "with no gaps and no repeats.\n"
        f"{duration_rule}\n"
        f"{camera_rule}\n"
        f"SCRIPT: {script_content}\n"
        f"ESTIMATED DURATION SECONDS: {estimated_duration_seconds or 45}\n"
    )
    result = await llm.generate_structured(prompt, StoryboardOutput)
    return cast(StoryboardOutput, result)
