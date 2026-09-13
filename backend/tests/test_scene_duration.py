"""
How long a clip runs, decided by the line it has to carry.

Measured across three real storyboards, between 27% and 43% of the finished
video had nobody saying anything. The cause was always the same shape: the
model wrote a nine-word hook, asked for eight seconds beside it, and Veo -
which runs a clip for its full length whatever is in it - stretched nine
words across the whole clip at 1.2 words a second. Billed in full, delivered
at half pace, and heard as the presenter going quiet in the middle.

Nothing downstream can fix that. The clip is already paid for, and trimming
it throws away seconds that were bought. So the length is taken from the
words, and where the length cannot move - an on-camera scene is 8 seconds on
Veo and nothing else - the agent is told to write a line that fills it.
"""

import pytest

from app.agents.qa_agent import run_qa_agent
from app.agents.storyboard_agent import run_storyboard_agent, word_range
from app.providers.llm.dev_provider import DevLLMProvider
from app.providers.speech import WORDS_PER_SECOND, speech_seconds
from app.providers.video.base import fit_duration, snap_duration
from app.schemas.agents import StoryboardOutput, StoryboardScene
from app.services.storyboard_service import (
    _cap_on_camera_scenes,
    _normalize_scenes,
    _on_camera_ceiling,
    _split_overlong_scenes,
)
from tests.conftest import auth_headers

VEO = (4, 6, 8)
VEO_ON_CAMERA = (8,)


def _line(words: int) -> str:
    return " ".join(["word"] * words)


def test_a_line_is_measured_in_the_time_it_takes_to_say():
    assert speech_seconds(_line(26)) == pytest.approx(26 / WORDS_PER_SECOND)
    assert speech_seconds("   ") == 0.0


def test_the_hook_that_started_this_no_longer_buys_eight_seconds():
    """Nine words is three and a half seconds of speech. It was an 8s clip."""
    assert fit_duration(speech_seconds(_line(9)), VEO, fallback=8) == 4


def test_a_full_line_still_gets_the_room_it_needs():
    assert fit_duration(speech_seconds(_line(21)), VEO, fallback=4) == 8


def test_a_line_too_long_for_any_clip_gets_the_longest_there_is():
    """It overruns, and the voice pass reports that so the creator can cut
    the sentence. Silently handing it a short clip would cut it for them."""
    assert fit_duration(speech_seconds(_line(60)), VEO, fallback=4) == 8


def test_rounding_to_the_nearest_length_used_to_cut_words_off():
    """
    The bug this replaces. A 21-word line was given 12 seconds by the model;
    snapping to the *nearest* legal length rounded 12 down to 8 - and 21
    words do not fit in 8 seconds, so the clip talked over its own ending.
    """
    twenty_one_words = speech_seconds(_line(21))

    assert snap_duration(12, VEO) == 8
    assert fit_duration(twenty_one_words, VEO, fallback=8) >= 8


def test_an_on_camera_scene_takes_the_only_length_it_is_allowed():
    """Veo's reference-to-video accepts 8 seconds and nothing else, however
    short the line is. This is why the agent is told to fill it instead."""
    assert fit_duration(speech_seconds(_line(9)), VEO_ON_CAMERA, fallback=8) == 8


def test_a_scene_with_nothing_to_say_keeps_the_length_it_was_given():
    """A silent establishing shot has no line to measure, so there is
    nothing to derive a length from and the caller's figure stands."""
    assert fit_duration(0.0, VEO, fallback=6) == 6


def _scene(order: int, words: int, *, on_camera: bool, duration: int) -> StoryboardScene:
    return StoryboardScene(
        order=order,
        duration_seconds=duration,
        voiceover=_line(words),
        visual_prompt="a shot",
        caption="caption",
        features_creator=on_camera,
    )


def test_normalising_sizes_every_scene_to_its_own_line():
    output = StoryboardOutput(
        scenes=[
            _scene(1, 9, on_camera=True, duration=8),
            _scene(2, 16, on_camera=False, duration=8),
            _scene(3, 9, on_camera=False, duration=8),
        ]
    )

    _normalize_scenes(output, VEO, VEO_ON_CAMERA)
    durations = [scene.duration_seconds for scene in output.scenes]

    # On camera stays 8 because it must; the b-roll shrinks to fit its line.
    assert durations == [8, 8, 4]


def test_normalising_still_renumbers_scenes():
    """The other half of this function's job, unchanged: the model repeats
    and skips scene numbers often enough that generation cannot trust them."""
    output = StoryboardOutput(
        scenes=[
            _scene(5, 16, on_camera=False, duration=6),
            _scene(5, 16, on_camera=False, duration=6),
        ]
    )

    _normalize_scenes(output, VEO, VEO_ON_CAMERA)

    assert [scene.order for scene in output.scenes] == [1, 2]


async def test_the_storyboard_prompt_gives_a_word_budget_not_just_a_ceiling():
    """
    "Under 20 words" is what produced a nine-word hook: it is satisfied by
    saying almost nothing. The agent needs to know what fills a clip, not
    only what overflows one.
    """
    seen: dict[str, str] = {}

    class _Recorder(DevLLMProvider):
        async def generate_structured(self, prompt, schema, *, model=None):
            seen["prompt"] = prompt
            return await super().generate_structured(prompt, schema, model=model)

    await run_storyboard_agent(
        _Recorder(),
        script_content='Hook\n"line"',
        estimated_duration_seconds=30,
        allowed_durations=VEO,
        reference_durations=VEO_ON_CAMERA,
        creator_on_camera=True,
        appearance_description="a person",
    )
    prompt = seen["prompt"]

    # A band, not a floor. An earlier version gave only a minimum and the
    # agent answered with 29 words in an 8-second clip, overrunning by four
    # seconds - the same failure inverted.
    low, high = word_range(8)

    assert f"8s takes {low}-{high} words" in prompt
    assert f"between {low} and {high} words" in prompt
    assert low < 8 * WORDS_PER_SECOND < high


@pytest.mark.parametrize(
    ("scenes", "ceiling"),
    [(1, 1), (2, 1), (3, 1), (4, 2), (5, 2), (8, 2)],
)
def test_on_camera_is_capped_at_half_the_video(scenes, ceiling):
    """
    A flat cap of two stopped capping anything once videos got short. Asked
    for fifteen seconds the storyboard comes back as two scenes, and two of
    two on camera is every scene on the expensive tier - the costliest way
    to build the cheapest video on the menu.
    """
    assert _on_camera_ceiling(scenes) == ceiling


def test_a_short_storyboard_keeps_the_creator_in_the_shot_that_earns_it():
    output = StoryboardOutput(
        scenes=[
            _scene(1, 19, on_camera=True, duration=8),
            _scene(2, 19, on_camera=True, duration=8),
        ]
    )

    _cap_on_camera_scenes(output, allowed=True)

    # The hook keeps the creator; the second scene drops to b-roll.
    assert [scene.features_creator for scene in output.scenes] == [True, False]


def test_a_line_that_outruns_every_clip_is_split_across_scenes():
    """
    The prompt asks for a word count and the model mostly obliges. Asked for
    a 15-second video it answered with 43 words in an 8-second scene -
    sixteen seconds of speech in a clip that cannot exceed eight. An
    instruction a model can decline cannot hold an invariant, so the
    storyboard is repaired rather than re-requested.
    """
    long_line = " ".join(f"This is sentence number {n} of the line." for n in range(6))
    output = StoryboardOutput(scenes=[_scene(1, 4, on_camera=False, duration=8)])
    output.scenes[0].voiceover = long_line

    _split_overlong_scenes(output, VEO)

    assert len(output.scenes) > 1
    for scene in output.scenes:
        assert speech_seconds(scene.voiceover) <= max(VEO)
    # Nothing is dropped on the way through.
    assert " ".join(s.voiceover for s in output.scenes).split() == long_line.split()


def test_a_line_that_already_fits_is_left_alone():
    output = StoryboardOutput(scenes=[_scene(1, 16, on_camera=False, duration=6)])

    _split_overlong_scenes(output, VEO)

    assert len(output.scenes) == 1


def test_one_unsplittable_sentence_is_reported_rather_than_chopped():
    """Shortening it is a wording decision, and that belongs to the creator."""
    one_sentence = _line(60)
    output = StoryboardOutput(scenes=[_scene(1, 4, on_camera=False, duration=8)])
    output.scenes[0].voiceover = one_sentence

    _split_overlong_scenes(output, VEO)
    _normalize_scenes(output, VEO, VEO_ON_CAMERA)
    result = run_qa_agent(output, estimated_duration_seconds=30)

    assert len(output.scenes) == 1
    assert not result.passed
    assert "cut off" in " ".join(result.issues)


def test_a_line_that_fits_raises_no_qa_issue_about_length():
    output = StoryboardOutput(
        scenes=[
            _scene(1, 20, on_camera=False, duration=8),
            _scene(2, 20, on_camera=False, duration=8),
        ]
    )

    result = run_qa_agent(output, estimated_duration_seconds=16)

    assert "cut off" not in " ".join(result.issues)


def test_ten_seconds_is_not_a_length_that_exists():
    """
    The length people reach for, and the one Veo does not have. It answers
    "Unsupported output video duration 10 seconds, supported durations are
    [8,4,6]" - during the run, so every scene generated before the rejection
    has already been billed. That is why the control is buttons, not a field.
    """
    from app.core.config import Settings
    from app.providers.video import get_supported_durations

    allowed = get_supported_durations(Settings(video_provider="veo"))

    assert allowed == (4, 6, 8)
    assert 10 not in allowed


async def test_a_length_the_model_cannot_render_is_refused_before_the_run(
    client, seeded_dev_creators
):
    """Refused here rather than by Veo, because Veo refuses mid-run."""
    from tests.conftest import run_full_pipeline

    result = await run_full_pipeline(client, "creator-a", "A short explainer about filter coffee")
    project_id = result["project_id"]
    scene_id = result["storyboard"]["scenes"][0]["id"]
    headers = auth_headers("creator-a")

    refused = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/duration",
        json={"duration_seconds": 10},
        headers=headers,
    )
    assert refused.status_code == 422, refused.text

    accepted = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/duration",
        json={"duration_seconds": 4},
        headers=headers,
    )
    assert accepted.status_code == 200, accepted.text
    scene = next(s for s in accepted.json()["scenes"] if s["id"] == scene_id)
    assert scene["duration_seconds"] == 4
    assert scene["duration_override"] == 4

    # Back to Auto: the override clears and the length is derived again.
    auto = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/duration",
        json={"duration_seconds": None},
        headers=headers,
    )
    assert auto.status_code == 200, auto.text
    scene = next(s for s in auto.json()["scenes"] if s["id"] == scene_id)
    assert scene["duration_override"] is None


def test_on_camera_leaves_exactly_one_length_to_choose_from():
    """Reference-to-video accepts 8 seconds and nothing else, so the control
    is locked rather than offering choices the model would refuse."""
    from app.core.config import Settings
    from app.providers.video import get_supported_durations

    settings = Settings(video_provider="veo")

    assert get_supported_durations(settings, with_reference=True) == (8,)
    assert get_supported_durations(settings, with_reference=False) == (4, 6, 8)


def test_auto_recomputes_the_length_from_the_line():
    """What null means: hand the decision back to the dialogue."""
    short = speech_seconds(_line(9))
    long = speech_seconds(_line(21))

    assert fit_duration(short, VEO, fallback=8) == 4
    assert fit_duration(long, VEO, fallback=4) == 8


def test_being_in_frame_leaves_exactly_one_length():
    """
    The rule the generate dialog is built around. Reference-to-video answers
    a 6 second request with "Unsupported output video duration 6 seconds,
    supported durations are [8] for feature reference_to_video", so a scene
    with the creator in it is 8 seconds or it is not that scene.

    The dialog no longer freezes the control over this. It offers the only
    thing that would make a shorter clip possible - taking the creator out
    of frame - rather than pointing at a checkbox elsewhere on the card.
    """
    from app.core.config import Settings
    from app.providers.video import get_supported_durations

    settings = Settings(video_provider="veo")

    assert get_supported_durations(settings, with_reference=True) == (8,)
    assert get_supported_durations(settings, with_reference=False) == (4, 6, 8)


def test_a_split_beat_keeps_its_caption_on_every_piece():
    """
    One long line becomes several scenes, and all of them are still that
    beat. The caption used to be dropped from every piece but the first so
    it would not stutter on screen - which stopped being a reason when
    captions stopped reaching the screen, and left QA failing the storyboard
    over blanks the code had just written itself.
    """
    long_line = " ".join(f"This is sentence number {n} of the line." for n in range(6))
    output = StoryboardOutput(scenes=[_scene(1, 4, on_camera=False, duration=8)])
    output.scenes[0].voiceover = long_line
    output.scenes[0].caption = "What to learn first"

    _split_overlong_scenes(output, VEO)

    assert len(output.scenes) > 1
    assert {scene.caption for scene in output.scenes} == {"What to learn first"}


async def test_the_qa_result_follows_the_storyboard_it_describes(
    client, seeded_dev_creators
):
    """
    It used to be written once, at generation, and then kept - so it
    described a storyboard that no longer existed. A creator who shortened a
    line to clear "the end would be cut off" still saw the warning, and one
    whose storyboard was put right by a change to the code had three red
    errors and no way to clear them except regenerating and losing their
    work. It is plain code over a handful of scenes, so it is re-run on read.
    """
    from tests.conftest import run_full_pipeline

    result = await run_full_pipeline(client, "creator-a", "A short explainer about filter coffee")
    project_id = result["project_id"]
    headers = auth_headers("creator-a")
    scene = next(
        s for s in result["storyboard"]["scenes"] if not s["features_creator"]
    )

    # A line that no longer fits the clip it was pinned to.
    broken = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene['id']}/dialogue",
        json={"voiceover": " ".join(f"This is sentence {n}." for n in range(5))},
        headers=headers,
    )
    assert broken.status_code == 200, broken.text
    await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene['id']}/duration",
        json={"duration_seconds": 4},
        headers=headers,
    )

    flagged = (
        await client.get(f"/projects/{project_id}/storyboard", headers=headers)
    ).json()
    assert flagged["qa_passed"] is False
    assert any("cut off" in issue for issue in flagged["qa_issues"])

    # Handing the length back to the dialogue clears it, with no regeneration.
    await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene['id']}/duration",
        json={"duration_seconds": None},
        headers=headers,
    )
    cleared = (
        await client.get(f"/projects/{project_id}/storyboard", headers=headers)
    ).json()
    assert not any("cut off" in issue for issue in cleared["qa_issues"])


async def test_the_creator_may_appear_in_more_scenes_than_the_agent_chose(
    client, seeded_dev_creators
):
    """
    The ceiling bounds what the storyboard agent writes, not what the
    creator afterwards decides.

    It used to refuse a third scene outright - "at most 2 scenes can feature
    you on camera, turn another one off first" - which is the app holding an
    opinion about someone's video with their own money. The reason for the
    ceiling is that a model putting the creator in every scene has no idea
    it just tripled the bill. A creator ticking the box has the surcharge
    printed beside it and the running total above it.
    """
    pytest.importorskip("PIL")
    import io

    from PIL import Image

    from app.services.creator_face_service import MIN_FACE_DIMENSION
    from tests.conftest import run_full_pipeline

    headers = auth_headers("creator-a")
    buffer = io.BytesIO()
    Image.new("RGB", (MIN_FACE_DIMENSION, MIN_FACE_DIMENSION), "white").save(
        buffer, format="JPEG"
    )
    uploaded = await client.post(
        "/creators/me/face",
        files={"file": ("face.jpg", buffer.getvalue(), "image/jpeg")},
        headers=headers,
    )
    assert uploaded.status_code == 201, uploaded.text
    consented = await client.post("/creators/me/face/consent", headers=headers)
    assert consented.status_code == 200, consented.text

    result = await run_full_pipeline(client, "creator-a", "A short explainer about filter coffee")
    project_id = result["project_id"]
    scenes = result["storyboard"]["scenes"]

    for scene in scenes:
        resp = await client.patch(
            f"/projects/{project_id}/storyboard/scenes/{scene['id']}",
            json={"features_creator": True},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    storyboard = (
        await client.get(f"/projects/{project_id}/storyboard", headers=headers)
    ).json()
    assert all(scene["features_creator"] for scene in storyboard["scenes"])
    # In frame is 8 seconds and nothing else, whatever the scene used to be.
    assert {scene["duration_seconds"] for scene in storyboard["scenes"]} == {8}


async def test_leaving_the_camera_gives_the_clip_back_to_the_line(
    client, seeded_dev_creators
):
    """
    In frame, every scene is 8 seconds because nothing else exists there.
    Coming back out used to keep that 8 - it snapped to the nearest legal
    length rather than re-deriving one - so a two-second line sat in an
    eight-second clip. That is six seconds of the dead air these lengths
    were built to remove, and it is billed.
    """
    pytest.importorskip("PIL")
    import io

    from PIL import Image

    from app.services.creator_face_service import MIN_FACE_DIMENSION
    from tests.conftest import run_full_pipeline

    headers = auth_headers("creator-a")
    buffer = io.BytesIO()
    Image.new("RGB", (MIN_FACE_DIMENSION, MIN_FACE_DIMENSION), "white").save(
        buffer, format="JPEG"
    )
    await client.post(
        "/creators/me/face",
        files={"file": ("face.jpg", buffer.getvalue(), "image/jpeg")},
        headers=headers,
    )
    await client.post("/creators/me/face/consent", headers=headers)

    result = await run_full_pipeline(client, "creator-a", "A short explainer about filter coffee")
    project_id = result["project_id"]
    scene_id = result["storyboard"]["scenes"][0]["id"]

    # A line short enough that no reasonable reading fills eight seconds.
    await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": "Filter coffee."},
        headers=headers,
    )
    on = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}",
        json={"features_creator": True},
        headers=headers,
    )
    assert next(s for s in on.json()["scenes"] if s["id"] == scene_id)["duration_seconds"] == 8

    off = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}",
        json={"features_creator": False},
        headers=headers,
    )

    scene = next(s for s in off.json()["scenes"] if s["id"] == scene_id)
    assert scene["duration_seconds"] == 4
    assert scene["duration_override"] is None
