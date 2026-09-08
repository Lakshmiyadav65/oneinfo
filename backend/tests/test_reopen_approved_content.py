"""
Going back to a finished step.

Approving was one-way: the editor locked, and the only route to a wording
change was Regenerate, which discards the script and pays the model for a
new one. Reopening puts it back to draft so it can simply be edited.
"""

from tests.conftest import auth_headers


async def _project_with_approved_script(client, headers) -> str:
    resp = await client.post(
        "/projects", json={"idea": "A short video about filter coffee"}, headers=headers
    )
    project_id = resp.json()["id"]

    resp = await client.post(f"/projects/{project_id}/hooks/generate", headers=headers)
    hook_id = resp.json()[0]["id"]
    await client.post(f"/projects/{project_id}/hooks/{hook_id}/select", headers=headers)

    await client.post(f"/projects/{project_id}/script/generate", headers=headers)
    resp = await client.post(f"/projects/{project_id}/script/approve", headers=headers)
    assert resp.status_code == 200, resp.text
    return project_id


async def test_an_approved_script_refuses_edits_until_it_is_reopened(client):
    headers = auth_headers("creator-a")
    project_id = await _project_with_approved_script(client, headers)

    resp = await client.patch(
        f"/projects/{project_id}/script", json={"content": "edited"}, headers=headers
    )
    assert resp.status_code == 422

    resp = await client.post(f"/projects/{project_id}/script/reopen", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "draft"

    resp = await client.patch(
        f"/projects/{project_id}/script", json={"content": "edited"}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["content"] == "edited"


async def test_reopening_keeps_the_same_version_rather_than_writing_a_new_one(client):
    """The point of reopening is that it is not a regenerate."""
    headers = auth_headers("creator-a")
    project_id = await _project_with_approved_script(client, headers)

    before = (await client.get(f"/projects/{project_id}/script", headers=headers)).json()
    reopened = (
        await client.post(f"/projects/{project_id}/script/reopen", headers=headers)
    ).json()

    assert reopened["id"] == before["id"]
    assert reopened["version"] == before["version"]
    assert reopened["content"] == before["content"]


async def test_reopening_a_script_leaves_the_storyboard_alone(client):
    """
    Downstream work is not deleted on the way back. It is out of step with the
    edit, which the UI says, but destroying a storyboard someone is happy with
    to protect them from their own edit is the worse trade.
    """
    headers = auth_headers("creator-a")
    project_id = await _project_with_approved_script(client, headers)

    resp = await client.post(f"/projects/{project_id}/storyboard/generate", headers=headers)
    assert resp.status_code == 200, resp.text
    storyboard_id = resp.json()["id"]

    await client.post(f"/projects/{project_id}/script/reopen", headers=headers)

    resp = await client.get(f"/projects/{project_id}/storyboard", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == storyboard_id


async def test_an_approved_localization_can_be_reopened_too(client):
    headers = auth_headers("creator-a")
    project_id = await _project_with_approved_script(client, headers)

    await client.post(f"/projects/{project_id}/tanglish/generate", headers=headers)
    resp = await client.post(f"/projects/{project_id}/tanglish/approve", headers=headers)
    assert resp.json()["status"] == "approved"

    resp = await client.patch(
        f"/projects/{project_id}/tanglish", json={"content": "edited"}, headers=headers
    )
    assert resp.status_code == 422

    resp = await client.post(f"/projects/{project_id}/tanglish/reopen", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "draft"

    resp = await client.patch(
        f"/projects/{project_id}/tanglish", json={"content": "edited"}, headers=headers
    )
    assert resp.status_code == 200, resp.text


async def test_creator_b_cannot_reopen_creator_a_script(client):
    project_id = await _project_with_approved_script(client, auth_headers("creator-a"))

    resp = await client.post(
        f"/projects/{project_id}/script/reopen", headers=auth_headers("creator-b")
    )
    assert resp.status_code == 404
