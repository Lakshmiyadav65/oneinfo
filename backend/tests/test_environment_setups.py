"""
Saved filming setups.

A creator works out a look once - a campus walk-and-talk, a classroom, a
hackathon floor - and then had to rebuild it from the advanced controls on
every new project. These are that look, named and kept.
"""

from tests.conftest import auth_headers

SETUPS = "/knowledge/environment-setups"

CAMPUS = {
    "preset": "outdoor",
    "background": "outdoor",
    "camera_framing": "medium_close_up",
    "camera_angle": "eye_level",
    "camera_movement": "handheld",
    "lighting": "natural",
    "visual_style": "documentary",
    "subject": "people",
    "custom_setup": "",
    "custom_background": "",
    "additional_requirements": "Students walking behind, natural campus ambience",
}


async def test_a_saved_setup_comes_back_exactly_as_it_was_saved(client):
    """The reason these are not knowledge documents: a setup is applied, not
    retrieved by similarity, so every value has to survive the round trip."""
    headers = auth_headers("creator-a")

    resp = await client.post(
        SETUPS,
        json={"name": "Campus walk-and-talk", "environment": CAMPUS},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["environment"] == CAMPUS

    resp = await client.get(SETUPS, headers=headers)
    assert resp.status_code == 200, resp.text
    assert [s["name"] for s in resp.json()] == ["Campus walk-and-talk"]


async def test_two_setups_cannot_share_a_name(client):
    """The picker shows names alone, so duplicates are indistinguishable at
    the moment of choosing one."""
    headers = auth_headers("creator-a")
    body = {"name": "Classroom", "environment": CAMPUS}

    assert (await client.post(SETUPS, json=body, headers=headers)).status_code == 201
    resp = await client.post(SETUPS, json=body, headers=headers)
    assert resp.status_code == 422
    assert "already have a saved setup" in resp.text


async def test_marking_a_setup_as_usual_demotes_the_previous_one(client):
    headers = auth_headers("creator-a")

    first = await client.post(
        SETUPS,
        json={"name": "Classroom", "environment": CAMPUS, "is_default": True},
        headers=headers,
    )
    second = await client.post(
        SETUPS,
        json={"name": "Hackathon floor", "environment": CAMPUS, "is_default": True},
        headers=headers,
    )
    assert second.status_code == 201, second.text

    resp = await client.get(SETUPS, headers=headers)
    defaults = {s["name"]: s["is_default"] for s in resp.json()}
    assert defaults == {"Classroom": False, "Hackathon floor": True}
    assert first.json()["id"] != second.json()["id"]


async def test_a_new_project_starts_from_the_setup_marked_as_usual(client):
    """The payoff. Without this the saved setup is a list nobody's project
    ever reads."""
    headers = auth_headers("creator-a")
    await client.post(
        SETUPS,
        json={"name": "Campus walk-and-talk", "environment": CAMPUS, "is_default": True},
        headers=headers,
    )

    resp = await client.post("/projects", json={"idea": "Infosys exam tips"}, headers=headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["default_environment"] == CAMPUS


async def test_deleting_a_setup_leaves_projects_built_from_it_alone(client):
    """A project holds its own copy of the values. Deleting the entry a look
    came from must never reach back into work already done."""
    headers = auth_headers("creator-a")
    created = await client.post(
        SETUPS,
        json={"name": "Campus walk-and-talk", "environment": CAMPUS, "is_default": True},
        headers=headers,
    )
    project = await client.post(
        "/projects", json={"idea": "Infosys exam tips"}, headers=headers
    )
    project_id = project.json()["id"]

    resp = await client.delete(f"{SETUPS}/{created.json()['id']}", headers=headers)
    assert resp.status_code == 204, resp.text

    resp = await client.get(f"/projects/{project_id}", headers=headers)
    assert resp.json()["default_environment"] == CAMPUS


async def test_one_creator_never_sees_another_creators_setups(client):
    await client.post(
        SETUPS,
        json={"name": "Campus walk-and-talk", "environment": CAMPUS},
        headers=auth_headers("creator-a"),
    )

    resp = await client.get(SETUPS, headers=auth_headers("creator-b"))
    assert resp.status_code == 200, resp.text
    assert resp.json() == []
