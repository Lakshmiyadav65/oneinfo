"""
Changing a project's language after the work has started.

The switcher was always reachable from every step, and it always did one
thing: set a column. The creator was told so, plainly - "applies from the
next generation, anything already written stays as it is" - which described
the behaviour accurately and left them looking at five English hooks under a
Tenglish badge. The only way out was to regenerate, which discards the hook
they picked, the script they edited and every setup on the storyboard.

So the language now carries the work with it. The tests here are mostly
about what must NOT change while it does: ids, selections, approvals, the
beat labels the script view parses, and the clips that were paid for.
"""

import pytest
from pydantic import BaseModel

from app.agents.environment_prompt import compose_visual_prompt, replace_spoken_language
from app.agents.translation_agent import (
    LANGUAGE_INSTRUCTIONS,
    run_line_translation_agent,
    run_script_translation_agent,
)
from app.providers.llm.dev_provider import DevLLMProvider
from app.schemas.agents import TranslatedLines
from app.schemas.environment import SceneEnvironment
from tests.conftest import auth_headers, run_full_pipeline

IDEA = "Amazon is hiring software developers"

SCRIPT = 'Hook\n"Amazon is hiring."\n\nCTA\n"Apply this week."'


class _Miscounting:
    """A model that drops a line. The failure this is all defended against:
    nine answers for ten questions leaves every line after the gap paired
    with somebody else's scene."""

    def __init__(self, drop: int = 1) -> None:
        self.drop = drop

    async def generate_structured(
        self, prompt: str, schema: type[BaseModel], *, model: str | None = None
    ) -> BaseModel:
        count = prompt.count("\n") + 1
        return TranslatedLines(lines=[f"translated {i}" for i in range(count - self.drop)])


async def test_lines_come_back_one_for_one_and_in_order():
    lines = ["First hook.", "Why it works.", "Second hook."]

    result = await run_line_translation_agent(
        DevLLMProvider(), lines=lines, language="tenglish"
    )

    assert len(result) == len(lines)
    assert [text.endswith(original) for text, original in zip(result, lines)] == [True] * 3


async def test_a_miscounted_answer_is_thrown_away_whole():
    """
    Half a translation is worse than none. The creator can see that nothing
    happened; they cannot see that scene four now says scene three's line.
    """
    lines = ["One.", "Two.", "Three."]

    result = await run_line_translation_agent(_Miscounting(), lines=lines, language="telugu")

    assert result == lines


async def test_nothing_to_translate_costs_nothing():
    """A project with no hooks yet must not spend a call finding that out."""
    assert await run_line_translation_agent(DevLLMProvider(), lines=[], language="telugu") == []


async def test_the_beat_labels_survive_translation():
    """
    They are structure, not content: the script view parses them to draw the
    beats and the storyboard reads dialogue out from under them. A localized
    "Hook" breaks both.
    """
    result = await run_script_translation_agent(
        DevLLMProvider(), script=SCRIPT, language="telugu"
    )

    assert "Hook" in result
    assert "CTA" in result


def test_every_project_language_has_wording_of_its_own():
    """A language with no instruction falls back to English, which is how a
    script quietly comes back in a language nobody asked for."""
    assert set(LANGUAGE_INSTRUCTIONS) == {"english", "tenglish", "telugu"}


def test_the_prompt_stops_telling_veo_to_speak_the_old_language():
    """
    The half of this that is easy to miss. The prompt carries both the line
    and a header naming the language to say it in, and given Telugu words
    under an English instruction Veo speaks English - so a translated scene
    with an untouched header is a clip in the wrong language, billed.
    """
    prompt = compose_visual_prompt(
        SceneEnvironment(),
        action="explaining the roles",
        features_creator=False,
        dialogue="Amazon is hiring.",
        language="english",
    )

    retargeted = replace_spoken_language(prompt, "telugu")

    assert "Spoken language: Telugu" in retargeted
    assert "Spoken language: English" not in retargeted
    # Everything else is left exactly as it was.
    assert "NEGATIVE PROMPT:" in retargeted


def test_a_prompt_without_the_header_is_left_alone():
    assert replace_spoken_language("Words of my own.", "telugu") is None


async def test_the_hooks_move_and_the_chosen_one_stays_chosen(client, seeded_dev_creators):
    """
    Every hook, not just the selected one: the screen is a comparison, and
    four of the five staying in the old language turns a choice between
    hooks into a choice between languages.
    """
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    headers = auth_headers("creator-a")

    before = (await client.get(f"/projects/{project_id}/hooks", headers=headers)).json()
    chosen = next(hook["id"] for hook in before if hook["is_selected"])

    resp = await client.patch(
        f"/projects/{project_id}", json={"language": "telugu"}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["project"]["language"] == "telugu"
    assert resp.json()["retranslated"]["hooks"] == len(before)

    after = (await client.get(f"/projects/{project_id}/hooks", headers=headers)).json()
    assert [hook["id"] for hook in after] == [hook["id"] for hook in before]
    assert next(hook["id"] for hook in after if hook["is_selected"]) == chosen
    assert [hook["text"] for hook in after] != [hook["text"] for hook in before]


async def test_an_approved_script_is_restated_not_sent_back_a_step(
    client, seeded_dev_creators
):
    """
    In place, keeping its version and its approval. A new draft would undo
    an approval the creator never withdrew, for a change they just asked
    for - and the words are the same words.
    """
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    headers = auth_headers("creator-a")

    before = (await client.get(f"/projects/{project_id}/script", headers=headers)).json()
    assert before["status"] == "approved"

    await client.patch(f"/projects/{project_id}", json={"language": "telugu"}, headers=headers)

    after = (await client.get(f"/projects/{project_id}/script", headers=headers)).json()
    assert after["version"] == before["version"]
    assert after["status"] == "approved"
    assert after["language"] == "telugu"


async def test_the_storyboard_keeps_every_choice_made_on_it(client, seeded_dev_creators):
    """
    The expensive half. A scene carries a setup, an on-camera decision and a
    clip length, and all of them survive - only the words change, and the
    clips already generated are marked rather than replaced.
    """
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    headers = auth_headers("creator-a")

    before = result["storyboard"]["scenes"]
    scene_id = before[0]["id"]
    await client.patch(
        f"/projects/{project_id}/storyboard/scenes/{scene_id}/duration",
        json={"duration_seconds": 8},
        headers=headers,
    )

    resp = await client.patch(
        f"/projects/{project_id}", json={"language": "telugu"}, headers=headers
    )
    assert resp.json()["retranslated"]["scenes"] == len(before)

    after = (
        await client.get(f"/projects/{project_id}/storyboard", headers=headers)
    ).json()["scenes"]
    assert [scene["id"] for scene in after] == [scene["id"] for scene in before]
    assert [scene["features_creator"] for scene in after] == [
        scene["features_creator"] for scene in before
    ]
    assert [scene["voiceover"] for scene in after] != [
        scene["voiceover"] for scene in before
    ]
    # The length someone chose by hand is not a translation of anything.
    chosen = next(scene for scene in after if scene["id"] == scene_id)
    assert chosen["duration_override"] == 8
    # Every scene now says something its clips, if any, do not.
    assert all(scene["dialogue_edited_at"] is not None for scene in after)


async def test_choosing_the_language_it_is_already_in_does_nothing(
    client, seeded_dev_creators
):
    """An accidental click on the current language must not spend a single
    model call, let alone rewrite the creator's approved script."""
    result = await run_full_pipeline(client, "creator-a", IDEA)
    project_id = result["project_id"]
    headers = auth_headers("creator-a")

    before = (await client.get(f"/projects/{project_id}/hooks", headers=headers)).json()
    language = (
        await client.get(f"/projects/{project_id}", headers=headers)
    ).json()["language"]

    resp = await client.patch(
        f"/projects/{project_id}", json={"language": language}, headers=headers
    )

    assert resp.json()["retranslated"] == {
        "hooks": 0,
        "script": False,
        "scenes": 0,
        "scenes_with_clips": [],
    }
    after = (await client.get(f"/projects/{project_id}/hooks", headers=headers)).json()
    assert [hook["text"] for hook in after] == [hook["text"] for hook in before]


async def test_the_language_belongs_to_the_project_owner(client, seeded_dev_creators):
    result = await run_full_pipeline(client, "creator-a", IDEA)

    resp = await client.patch(
        f"/projects/{result['project_id']}",
        json={"language": "telugu"},
        headers=auth_headers("creator-b"),
    )

    assert resp.status_code == 404, resp.text


@pytest.mark.parametrize("language", ["english", "tenglish", "telugu"])
def test_the_instruction_names_the_script_to_write_in(language):
    """Telugu is the only one in its own script, and saying so is what
    stops the model transliterating it into Latin letters instead."""
    instruction = LANGUAGE_INSTRUCTIONS[language]

    assert instruction
    if language == "telugu":
        assert "Telugu script" in instruction
    if language == "tenglish":
        assert "Latin alphabet" in instruction
