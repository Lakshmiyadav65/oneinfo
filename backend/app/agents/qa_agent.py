from app.providers.speech import MAX_PACE, speech_seconds
from app.schemas.agents import QAResult, StoryboardOutput

_MIN_SCENES = 2
_MAX_SCENE_DURATION_SECONDS = 20
# How far the storyboard may run from the length that was asked for before
# the creator is told. Was 0.6, which was set when the figure was the script
# agent's own guess at its own length and missing it meant little. It is now
# usually a length the creator picked off a panel, and a 30-second request
# coming back as 46 seconds is a half-again bill they did not agree to.
_MAX_DURATION_DEVIATION = 0.35
# Deliberately minimal — obvious/unsafe-only per the Phase 03 spec, not a
# content moderation system.
_UNSAFE_TERMS = {"nudity", "gore", "self-harm", "weapon instructions"}


def run_qa_agent(
    storyboard: StoryboardOutput, *, estimated_duration_seconds: int | None
) -> QAResult:
    """
    Validates storyboard structure only — never rewrites content. This is
    deliberately plain code, not another LLM call: counting scenes,
    checking for blank fields, and comparing durations are things
    deterministic logic does more reliably than a model.
    """
    issues: list[str] = []

    if len(storyboard.scenes) < _MIN_SCENES:
        issues.append(
            f"Storyboard has only {len(storyboard.scenes)} scene(s); expected at least {_MIN_SCENES}."
        )

    orders = [scene.order for scene in storyboard.scenes]
    if orders != sorted(orders) or len(set(orders)) != len(orders):
        issues.append("Scene order is missing, duplicated, or out of sequence.")

    total_duration = 0
    for scene in storyboard.scenes:
        total_duration += scene.duration_seconds
        if not scene.voiceover.strip():
            issues.append(f"Scene {scene.order} is missing voiceover.")
        if not scene.visual_prompt.strip():
            issues.append(f"Scene {scene.order} is missing a visual prompt.")
        # The caption is deliberately not checked. Nothing draws it any more:
        # rendering_service stopped burning captions into clips, because they
        # laid a second line of text over video already carrying the spoken
        # line - and the wrong one, in English over a Tenglish voiceover. A
        # field with no effect on the finished video is not something to stop
        # a creator over. Restore this check if captions ever reach the screen
        # again, and check the language they are in while you are there.
        if scene.duration_seconds <= 0 or scene.duration_seconds > _MAX_SCENE_DURATION_SECONDS:
            issues.append(f"Scene {scene.order} has an implausible duration ({scene.duration_seconds}s).")

        # A line longer than its clip is not a rendering problem - it
        # generates fine and then talks over its own ending. MAX_PACE is how
        # much the voice pass can speed up before it stops sounding like a
        # person, so past that the sentence itself has to come down, and
        # only the creator can decide which words go.
        spoken = speech_seconds(scene.voiceover)
        if scene.duration_seconds > 0 and spoken > scene.duration_seconds * MAX_PACE:
            issues.append(
                f"Scene {scene.order}'s line takes about {spoken:.0f}s to say but "
                f"its clip is {scene.duration_seconds}s, so the end would be cut "
                "off. Shorten the line or split the scene."
            )

        lowered = f"{scene.voiceover} {scene.visual_prompt} {scene.caption}".lower()
        if any(term in lowered for term in _UNSAFE_TERMS):
            issues.append(f"Scene {scene.order} contains a flagged term and needs manual review.")

    if estimated_duration_seconds and total_duration > 0:
        deviation = abs(total_duration - estimated_duration_seconds) / estimated_duration_seconds
        if deviation > _MAX_DURATION_DEVIATION:
            issues.append(
                f"The storyboard runs {total_duration}s against a target of "
                f"{estimated_duration_seconds}s. Video is billed by the second, "
                "so the difference is the difference in the bill - drop or "
                "shorten a scene to bring it back."
            )

    return QAResult(passed=len(issues) == 0, issues=issues)
