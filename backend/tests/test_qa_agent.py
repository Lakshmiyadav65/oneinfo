from app.agents.qa_agent import run_qa_agent
from app.schemas.agents import StoryboardOutput, StoryboardScene


def _scene(**overrides) -> StoryboardScene:
    defaults = {
        "order": 1,
        "duration_seconds": 5,
        "voiceover": "Hello",
        "visual_prompt": "A shot",
        "caption": "Hi",
    }
    defaults.update(overrides)
    return StoryboardScene(**defaults)


def test_passes_for_well_formed_storyboard():
    storyboard = StoryboardOutput(
        scenes=[_scene(order=1), _scene(order=2, duration_seconds=8), _scene(order=3, duration_seconds=4)]
    )
    result = run_qa_agent(storyboard, estimated_duration_seconds=17)
    assert result.passed is True
    assert result.issues == []


def test_flags_too_few_scenes():
    storyboard = StoryboardOutput(scenes=[_scene(order=1)])
    result = run_qa_agent(storyboard, estimated_duration_seconds=5)
    assert result.passed is False
    assert any("scene" in issue.lower() for issue in result.issues)


def test_flags_missing_voiceover_and_visual_prompt():
    storyboard = StoryboardOutput(
        scenes=[_scene(order=1, voiceover="  "), _scene(order=2, visual_prompt="")]
    )
    result = run_qa_agent(storyboard, estimated_duration_seconds=10)
    assert result.passed is False
    assert any("voiceover" in issue.lower() for issue in result.issues)
    assert any("visual prompt" in issue.lower() for issue in result.issues)


def test_flags_implausible_duration():
    storyboard = StoryboardOutput(scenes=[_scene(order=1, duration_seconds=0), _scene(order=2, duration_seconds=999)])
    result = run_qa_agent(storyboard, estimated_duration_seconds=10)
    assert result.passed is False
    assert sum("implausible duration" in issue for issue in result.issues) == 2


def test_flags_out_of_order_scenes():
    storyboard = StoryboardOutput(scenes=[_scene(order=2), _scene(order=1)])
    result = run_qa_agent(storyboard, estimated_duration_seconds=10)
    assert result.passed is False
    assert any("order" in issue.lower() for issue in result.issues)


def test_never_mutates_storyboard_content():
    storyboard = StoryboardOutput(scenes=[_scene(order=1)])
    original = storyboard.model_copy(deep=True)
    run_qa_agent(storyboard, estimated_duration_seconds=5)
    assert storyboard == original
