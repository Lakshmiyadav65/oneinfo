"""
Rewriting what a scene says, at the step where the creator finds out it is
wrong.

The words are written at the script step, but they are not judged there.
They are judged here, read against the shot they are going into - and the
only way to change one sentence used to be to go back and regenerate the
whole storyboard, losing every setup and on-camera choice on it. So either
the line stayed as written or the storyboard was thrown away. Both are
worse than editing the sentence.

Three things follow the words, and each of them costs money to get wrong:
the clip length, the prompt that tells the video model what to say, and the
clips already generated - which keep saying the old line while looking
identical to the ones that do not.
"""

import pytest

from app.agents.environment_prompt import compose_visual_prompt, replace_dialogue
from app.providers.speech import WORDS_PER_SECOND, speech_seconds
from app.providers.video.base import fit_duration
from app.schemas.environment import SceneEnvironment
from tests.conftest import auth_headers, run_full_pipeline

VEO = (4, 6, 8)
IDEA = "A short explainer about filter coffee"


def _line(words: int) -> str:
    return " ".join(["word"] * words)


def _prompt(dialogue: str) -> str:
    return compose_visual_prompt(
        SceneEnvironment(),
        action="explaining the price",
        features_creator=False,
        dialogue=dialogue,
        language="tenglish",
        aspect_ratio="9:16 Vertical",
        scene_number=1,
        scene_count=3,
    )


def test_the_spoken_line_can_be_swapped_without_touching_the_rest():
    """
    The case a rebuild cannot serve: the creator wrote this prompt by hand
    and has now changed what is said in it. Rebuilding throws their wording
    away; leaving it alone generates a clip speaking the words they just
    deleted, and that clip is billed.
    """
    written_by_hand = _prompt("old line").replace(
        "Explaining the price.", "Slow push in, shot on a 35mm lens."
    )

    swapped = replace_dialogue(written_by_hand, "brand new line")

    assert '"brand new line"' in swapped
    assert "old line" not in swapped
    # Their words survive, and so does everything around them.
    assert "Slow push in, shot on a 35mm lens." in swapped
    assert "NEGATIVE PROMPT:" in swapped


def test_a_prompt_with_no_dialogue_block_is_left_alone():
    """Nothing to swap, and guessing where speech belongs in someone else's
    wording would be worse than leaving it as they wrote it."""
    assert replace_dialogue("A prompt written from scratch, no labels.", "x") is None


async def test_a_new_line_takes_the_clip_with_it(client, seeded_dev_creators):
    """
    A shorter line in an unchanged clip is dead air - between 27% and 43% of
    three real storyboards. A longer one runs past its own ending. Either
    way the length has to follow the words.
    """
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    scene_id = result["storyboard"]["scenes"][0]["id"]
    headers = auth_headers("creator-a")

    long_line = _line(21)
    resp = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": long_line},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    scene = next(s for s in resp.json()["scenes"] if s["id"] == scene_id)
    assert scene["voiceover"] == long_line
    assert scene["duration_seconds"] == fit_duration(
        speech_seconds(long_line), VEO, fallback=4
    )

    short_line = _line(5)
    resp = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": short_line},
        headers=headers,
    )
    scene = next(s for s in resp.json()["scenes"] if s["id"] == scene_id)
    assert scene["duration_seconds"] == 4
    # The prompt is the only thing telling Veo what to say, so it moves too.
    assert short_line in scene["visual_prompt"]
    assert long_line not in scene["visual_prompt"]


async def test_a_length_the_creator_chose_survives_a_rewrite(client, seeded_dev_creators):
    """They picked it against this scene, not against this sentence."""
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    scene_id = result["storyboard"]["scenes"][0]["id"]
    headers = auth_headers("creator-a")

    chosen = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/duration",
        json={"duration_seconds": 8},
        headers=headers,
    )
    assert chosen.status_code == 200, chosen.text

    resp = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": _line(4)},
        headers=headers,
    )

    scene = next(s for s in resp.json()["scenes"] if s["id"] == scene_id)
    assert scene["duration_override"] == 8
    assert scene["duration_seconds"] == 8


async def test_a_hand_written_prompt_keeps_its_wording(client, seeded_dev_creators):
    """The shot is theirs; only the quoted line inside it moves."""
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    scene_id = result["storyboard"]["scenes"][0]["id"]
    headers = auth_headers("creator-a")

    mine = _prompt("whatever is there now") + "\n\nShot on a 35mm lens, handheld."
    written = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/visual",
        json={"visual_prompt": mine},
        headers=headers,
    )
    assert written.status_code == 200, written.text

    resp = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": "The new line entirely."},
        headers=headers,
    )

    scene = next(s for s in resp.json()["scenes"] if s["id"] == scene_id)
    assert scene["visual_is_custom"] is True
    assert "Shot on a 35mm lens, handheld." in scene["visual_prompt"]
    assert '"The new line entirely."' in scene["visual_prompt"]
    assert "whatever is there now" not in scene["visual_prompt"]


async def test_clips_are_marked_older_than_the_line_only_once_it_changes(
    client, seeded_dev_creators
):
    """
    The timestamp behind "this clip says something the scene no longer
    says". Saving the line unchanged must not set it: the creator opened the
    editor, thought about it, and left the sentence alone.
    """
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    scene = result["storyboard"]["scenes"][0]
    scene_id = scene["id"]
    headers = auth_headers("creator-a")

    assert scene["dialogue_edited_at"] is None

    padded = "  " + scene["voiceover"] + "  "
    unchanged = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": padded},
        headers=headers,
    )
    still = next(s for s in unchanged.json()["scenes"] if s["id"] == scene_id)
    assert still["dialogue_edited_at"] is None

    changed = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": "Something else entirely."},
        headers=headers,
    )
    edited = next(s for s in changed.json()["scenes"] if s["id"] == scene_id)
    assert edited["dialogue_edited_at"] is not None


async def test_a_scene_cannot_be_left_with_nothing_to_say(client, seeded_dev_creators):
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    scene_id = result["storyboard"]["scenes"][0]["id"]

    resp = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": "   "},
        headers=auth_headers("creator-a"),
    )

    assert resp.status_code == 422, resp.text


async def test_the_line_belongs_to_the_creator_who_wrote_it(client, seeded_dev_creators):
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    scene_id = result["storyboard"]["scenes"][0]["id"]

    resp = await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/dialogue",
        json={"voiceover": "Written by somebody else."},
        headers=auth_headers("creator-b"),
    )

    assert resp.status_code == 404, resp.text


def test_how_long_a_line_takes_is_answered_in_one_place():
    """
    The estimate the card warns from is the estimate the length is derived
    from. Sent with the scene rather than recomputed in the browser, so
    "does this still fit?" cannot be answered two different ways.
    """
    from app.schemas.storyboard import StoryboardSceneOut

    sent = StoryboardSceneOut.model_json_schema(mode="serialization")["properties"]

    assert "speech_seconds" in sent
    assert speech_seconds(_line(21)) == pytest.approx(21 / WORDS_PER_SECOND)
