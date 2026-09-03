from tests.conftest import auth_headers, run_full_pipeline


async def test_creator_a_can_progress_idea_to_approved_storyboard(client):
    await run_full_pipeline(client, "creator-a", "How to brew pour-over coffee at home")


async def test_creator_b_uses_the_same_pipeline_independently(client):
    await run_full_pipeline(client, "creator-b", "Beginner guitar chords in ten minutes")


async def test_creator_b_cannot_access_creator_a_project(client):
    result_a = await run_full_pipeline(client, "creator-a", "A private recipe idea")
    project_id = result_a["project_id"]

    resp = await client.get(f"/projects/{project_id}", headers=auth_headers("creator-b"))
    assert resp.status_code == 404

    resp = await client.post(
        f"/projects/{project_id}/hooks/generate", headers=auth_headers("creator-b")
    )
    assert resp.status_code == 404

    resp = await client.get(f"/projects/{project_id}/storyboard", headers=auth_headers("creator-b"))
    assert resp.status_code == 404


async def test_script_generation_requires_a_selected_hook(client):
    headers = auth_headers("creator-a")
    resp = await client.post("/projects", json={"idea": "An idea with no hook yet"}, headers=headers)
    project_id = resp.json()["id"]

    resp = await client.post(f"/projects/{project_id}/script/generate", headers=headers)
    assert resp.status_code == 422


async def test_approved_tanglish_is_used_as_storyboard_source(client):
    headers = auth_headers("creator-a")

    resp = await client.post("/projects", json={"idea": "A tanglish walkthrough"}, headers=headers)
    project_id = resp.json()["id"]

    resp = await client.post(f"/projects/{project_id}/hooks/generate", headers=headers)
    hook_id = resp.json()[0]["id"]
    await client.post(f"/projects/{project_id}/hooks/{hook_id}/select", headers=headers)

    await client.post(f"/projects/{project_id}/script/generate", headers=headers)
    resp = await client.post(f"/projects/{project_id}/script/approve", headers=headers)
    assert resp.status_code == 200

    resp = await client.post(f"/projects/{project_id}/tanglish/generate", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "draft"

    # Storyboard generation should still work off the English script while
    # Tanglish is unapproved (approval, not mere existence, is the gate).
    resp = await client.post(f"/projects/{project_id}/storyboard/generate", headers=headers)
    assert resp.status_code == 200

    resp = await client.post(f"/projects/{project_id}/tanglish/approve", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    resp = await client.post(f"/projects/{project_id}/storyboard/generate", headers=headers)
    assert resp.status_code == 200, resp.text
    storyboard = resp.json()
    # The dev LLM provider echoes distinguishable content depending on
    # whether it was fed the English or Tanglish script — confirms the
    # approved-Tanglish branch was actually taken.
    combined_voiceover = " ".join(scene["voiceover"] for scene in storyboard["scenes"]).lower()
    assert "pathi pesalam" in combined_voiceover or "ipo" in combined_voiceover


async def test_tanglish_is_optional_and_storyboard_falls_back_to_english(client):
    headers = auth_headers("creator-a")
    result = await run_full_pipeline(client, "creator-a", "Skipping Tanglish entirely")
    project_id = result["project_id"]

    # No Tanglish was generated for this project — storyboard already
    # succeeded above using the English script, proving Tanglish truly is
    # optional and doesn't block the pipeline.
    resp = await client.get(f"/projects/{project_id}/tanglish", headers=headers)
    assert resp.status_code == 404
