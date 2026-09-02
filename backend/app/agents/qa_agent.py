from app.schemas.agents import QAResult, StoryboardOutput

_MIN_SCENES = 2
_MAX_SCENE_DURATION_SECONDS = 20
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
        if not scene.caption.strip():
            issues.append(f"Scene {scene.order} is missing a caption.")
        if scene.duration_seconds <= 0 or scene.duration_seconds > _MAX_SCENE_DURATION_SECONDS:
            issues.append(f"Scene {scene.order} has an implausible duration ({scene.duration_seconds}s).")

        lowered = f"{scene.voiceover} {scene.visual_prompt} {scene.caption}".lower()
        if any(term in lowered for term in _UNSAFE_TERMS):
            issues.append(f"Scene {scene.order} contains a flagged term and needs manual review.")

    if estimated_duration_seconds and total_duration > 0:
        deviation = abs(total_duration - estimated_duration_seconds) / estimated_duration_seconds
        if deviation > 0.6:
            issues.append(
                f"Total scene duration ({total_duration}s) deviates significantly from the "
                f"script's estimated duration ({estimated_duration_seconds}s)."
            )

    return QAResult(passed=len(issues) == 0, issues=issues)
