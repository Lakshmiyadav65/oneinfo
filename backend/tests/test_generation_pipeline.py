import asyncio

from tests.conftest import auth_headers, run_full_pipeline


async def _wait_for_job(client, project_id: str, headers: dict, *, max_attempts=120, interval=0.5) -> dict:
    for _ in range(max_attempts):
        resp = await client.get(f"/projects/{project_id}/generation", headers=headers)
        assert resp.status_code == 200
        job = resp.json()
        if job["status"] in ("completed", "failed"):
            return job
        await asyncio.sleep(interval)
    raise AssertionError("Generation job did not finish in time")


async def test_full_generation_produces_a_playable_mp4(client, requires_ffmpeg):
    headers = auth_headers("creator-a")
    result = await run_full_pipeline(client, "creator-a", "A short video about tea ceremonies")
    project_id = result["project_id"]

    resp = await client.post(f"/projects/{project_id}/generate", headers=headers)
    assert resp.status_code == 200, resp.text
    job = resp.json()
    assert job["status"] in ("queued", "processing")

    # NOTE: the duplicate-job guard (start_generation's "existing job still
    # queued/processing -> return it, don't dispatch another" check) is real
    # application logic and isn't being tested here. httpx's ASGITransport
    # runs the whole request, including its BackgroundTasks, in-process
    # before `client.post()` returns — so by the time a *second* sequential
    # call fires, the first job has typically already reached a terminal
    # state, making "returns the same job" untestable via sequential calls
    # through this harness (a second call at that point legitimately starts
    # a fresh job, which is correct). Exercising the guard under genuine
    # concurrency — and whether it's race-safe against two truly-simultaneous
    # requests — is a separate, deliberately deferred question; see the
    # session notes. This just confirms the endpoint stays healthy on a
    # repeat call, not the dedup guarantee itself.
    resp2 = await client.post(f"/projects/{project_id}/generate", headers=headers)
    assert resp2.status_code == 200, resp2.text

    finished = await _wait_for_job(client, project_id, headers)
    assert finished["status"] == "completed", finished

    resp = await client.get(f"/projects/{project_id}", headers=headers)
    assert resp.json()["status"] == "completed"

    resp = await client.get(f"/projects/{project_id}/output", headers=headers)
    assert resp.status_code == 200, resp.text
    output = resp.json()
    assert output["mime_type"] == "video/mp4"
    assert output["duration_seconds"] > 0
    assert output["file_size_bytes"] > 0

    resp = await client.get(f"/projects/{project_id}/output/file", headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "video/mp4"
    assert len(resp.content) == output["file_size_bytes"]
    # A valid MP4 container has an "ftyp" box near the start of the file.
    assert b"ftyp" in resp.content[:32]


async def test_creator_b_cannot_access_creator_a_output(client, requires_ffmpeg):
    result = await run_full_pipeline(client, "creator-a", "A private cooking video")
    project_id = result["project_id"]

    headers_a = auth_headers("creator-a")
    await client.post(f"/projects/{project_id}/generate", headers=headers_a)
    await _wait_for_job(client, project_id, headers_a)

    headers_b = auth_headers("creator-b")
    resp = await client.get(f"/projects/{project_id}/output", headers=headers_b)
    assert resp.status_code == 404

    resp = await client.get(f"/projects/{project_id}/output/file", headers=headers_b)
    assert resp.status_code == 404


async def test_generation_requires_a_storyboard(client):
    headers = auth_headers("creator-a")
    resp = await client.post("/projects", json={"idea": "No storyboard yet"}, headers=headers)
    project_id = resp.json()["id"]

    resp = await client.post(f"/projects/{project_id}/generate", headers=headers)
    assert resp.status_code == 422
