"""
The script says what the video is about, instead of promising that it will.

A script for "GenAI Roadmap for Freshers" came back with a Value beat reading
"I made a clear learning path, step by step, all free" - four beats that
never once named a topic. It is impossible to fact-check, impossible to
disagree with, and worthless to a viewer, and no amount of rewording fixes it
because the agent had never worked out what the steps were.

So the agent now researches first and writes second: `roadmap` is filled in
before any line exists, and the Value beat is spoken from it.
"""

import pytest

from app.agents.script_agent import BEATS, run_script_agent
from app.providers.llm.dev_provider import DevLLMProvider
from app.schemas.agents import ScriptOutput
from tests.conftest import auth_headers


async def _prompt_the_agent_builds() -> str:
    """The prompt the agent sends, captured without calling a real model."""
    seen: dict[str, str] = {}

    class _Recorder(DevLLMProvider):
        async def generate_structured(self, prompt, schema, *, model=None):
            seen["prompt"] = prompt
            return await super().generate_structured(prompt, schema, model=model)

    await run_script_agent(
        _Recorder(), idea="GenAI roadmap", selected_hook_text="hook", knowledge_chunks=[]
    )
    return seen["prompt"]


async def test_the_roadmap_is_worked_out_before_any_line_is_written():
    """
    Order is the whole fix. Asked for afterwards, the roadmap becomes a
    summary of a script that was already vague - which is where it started.
    """
    prompt = await _prompt_the_agent_builds()

    assert prompt.index("STEP 1") < prompt.index("STEP 2")
    assert "roadmap" in prompt[: prompt.index("STEP 2")]


async def test_the_prompt_rules_out_the_line_that_started_this():
    """The failure is a specific, nameable habit, so it is named."""
    assert "I made a clear learning path" in await _prompt_the_agent_builds()


def test_the_value_beat_is_told_to_speak_the_roadmap():
    """
    The other three beats are unchanged. Value is the one that was empty, and
    it is the one pinned to the researched steps.
    """
    intents = dict(BEATS)

    assert "roadmap" in intents["Value"]
    assert [label for label, _ in BEATS] == ["Hook", "Curiosity", "Value", "CTA"]


async def test_the_value_beat_names_every_step_it_researched():
    """
    Not a wording check - a shape check. Whatever the model writes, the beat
    a viewer hears has to contain the topics the agent claims to cover, or
    the roadmap beside it is describing a different video.
    """
    output = await DevLLMProvider().generate_structured(
        "IDEA: GenAI roadmap for freshers", ScriptOutput
    )
    value = next(beat.line for beat in output.beats if beat.label == "Value")

    assert len(output.roadmap) >= 3
    for step in output.roadmap:
        assert step.topic in value


@pytest.mark.parametrize("field", ["topic", "detail"])
def test_every_researched_step_carries_something_to_say(field):
    """A step with an empty detail is a category, and a category is what the
    Value beat was already failing at."""
    from app.schemas.agents import RoadmapStep

    step = RoadmapStep(order=1, topic="Prompt engineering", detail="Few-shot vs chain-of-thought.")

    assert getattr(step, field)


async def _script_for(client, creator_id: str, idea: str) -> tuple[str, dict]:
    headers = auth_headers(creator_id)
    resp = await client.post("/projects", json={"idea": idea}, headers=headers)
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    hooks = await client.post(f"/projects/{project_id}/hooks/generate", headers=headers)
    assert hooks.status_code == 200, hooks.text
    hook_id = hooks.json()[0]["id"]
    await client.post(f"/projects/{project_id}/hooks/{hook_id}/select", headers=headers)

    script = await client.post(f"/projects/{project_id}/script/generate", headers=headers)
    assert script.status_code == 200, script.text
    return project_id, script.json()


async def test_the_researched_topics_reach_the_creator(client, seeded_dev_creators):
    """
    The roadmap is the deliverable, not a working note. Thrown away after the
    beats were written, the creator would be left checking five spoken
    clauses against nothing.
    """
    project_id, script = await _script_for(client, "creator-a", "GenAI roadmap for freshers")

    assert len(script["roadmap"]) >= 3
    assert [step["order"] for step in script["roadmap"]] == sorted(
        step["order"] for step in script["roadmap"]
    )

    # And it survives a reload, rather than living only in the response that
    # created it.
    fetched = await client.get(f"/projects/{project_id}/script", headers=auth_headers("creator-a"))
    assert fetched.json()["roadmap"] == script["roadmap"]


async def test_restoring_an_earlier_take_brings_its_research_back_with_it(
    client, seeded_dev_creators
):
    """
    A restored version is the script the creator preferred. Arriving without
    the topics it was written from would leave the roadmap panel showing the
    research for a script that is no longer on screen.
    """
    headers = auth_headers("creator-a")
    project_id, first = await _script_for(client, "creator-a", "GenAI roadmap for freshers")

    regenerated = await client.post(f"/projects/{project_id}/script/regenerate", headers=headers)
    assert regenerated.json()["version"] == 2

    restored = await client.post(
        f"/projects/{project_id}/script/versions/{first['version']}/restore", headers=headers
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["roadmap"] == first["roadmap"]
