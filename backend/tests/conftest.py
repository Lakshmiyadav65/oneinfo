import os
import shutil

# Pin every external provider to its dev implementation so the suite stays
# deterministic and offline even when .env points at real Gemini/Veo — these
# take precedence over .env values in pydantic-settings.
os.environ.setdefault("EMBEDDING_PROVIDER", "dev")
os.environ.setdefault("LLM_PROVIDER", "dev")
os.environ.setdefault("VIDEO_PROVIDER", "dev")
os.environ.setdefault("STORAGE_LOCAL_PATH", "./data/test-uploads")

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.db.base import Base, get_engine, get_session_factory
from app.main import app as fastapi_app
from app.models.creator import Creator


def auth_headers(creator_id: str) -> dict:
    return {"Authorization": f"Bearer dev:{creator_id}"}


@pytest.fixture(scope="session")
def ffmpeg_available() -> bool:
    """
    Tests that need to actually run FFmpeg (video generation, rendering)
    skip when it's not on PATH / FFMPEG_PATH, same graceful pattern as
    db_available — they run for real once FFmpeg is installed.
    """
    settings = get_settings()
    return bool(shutil.which(settings.ffmpeg_path) and shutil.which(settings.ffprobe_path))


@pytest.fixture
def requires_ffmpeg(ffmpeg_available: bool) -> None:
    if not ffmpeg_available:
        pytest.skip("FFmpeg not available on PATH/FFMPEG_PATH — install it to run this test.")


@pytest_asyncio.fixture(scope="session")
async def db_available() -> bool:
    """
    Session-wide check for a reachable, migratable database. Tests that
    need real Postgres+pgvector skip (not fail) when this is False, so the
    suite stays green before Supabase credentials are configured and turns
    into real coverage the moment they are.
    """
    try:
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(sa.text("SELECT 1"))
            await conn.run_sync(Base.metadata.create_all)
        return True
    except Exception:
        return False


@pytest_asyncio.fixture
async def db_session(db_available: bool):
    if not db_available:
        pytest.skip("DATABASE_URL not reachable — configure Supabase credentials to run this test.")

    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session

    async with session_factory() as session:
        # Every creator-owned table cascades from creators.id (ON DELETE
        # CASCADE), so clearing creators alone clears the whole tree —
        # knowledge, projects, hooks, scripts, storyboards, assets, jobs,
        # outputs — without needing to enumerate them here.
        await session.execute(sa.text("DELETE FROM creators"))
        await session.commit()


@pytest_asyncio.fixture
async def seeded_dev_creators(db_session):
    db_session.add(Creator(id="creator-a", name="Demo Creator A", email="creator-a@oneinfo.dev"))
    db_session.add(Creator(id="creator-b", name="Demo Creator B", email="creator-b@oneinfo.dev"))
    await db_session.commit()


@pytest_asyncio.fixture
async def client(db_session):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def run_full_pipeline(client: AsyncClient, creator_id: str, idea: str) -> dict:
    """Drives a project from idea through an approved storyboard via the
    real API — shared by the Phase 03 content-pipeline tests and the
    Phase 04 generation tests, which both need to reach that starting
    point before testing what they actually care about."""
    headers = auth_headers(creator_id)

    resp = await client.post("/projects", json={"idea": idea}, headers=headers)
    assert resp.status_code == 201, resp.text
    project = resp.json()
    project_id = project["id"]
    assert project["status"] == "draft"

    resp = await client.post(f"/projects/{project_id}/hooks/generate", headers=headers)
    assert resp.status_code == 200, resp.text
    hooks = resp.json()
    assert 3 <= len(hooks) <= 5

    resp = await client.get(f"/projects/{project_id}", headers=headers)
    assert resp.json()["status"] == "hooks"

    hook_id = hooks[0]["id"]
    resp = await client.post(f"/projects/{project_id}/hooks/{hook_id}/select", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_selected"] is True

    resp = await client.post(f"/projects/{project_id}/script/generate", headers=headers)
    assert resp.status_code == 200, resp.text
    script = resp.json()
    assert script["status"] == "draft"
    assert script["version"] == 1

    # PATCH before approval works.
    resp = await client.patch(
        f"/projects/{project_id}/script", json={"content": "Edited script content."}, headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["content"] == "Edited script content."

    resp = await client.post(f"/projects/{project_id}/script/approve", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"

    # Approved content can't be edited in place.
    resp = await client.patch(
        f"/projects/{project_id}/script", json={"content": "Sneaky overwrite."}, headers=headers
    )
    assert resp.status_code == 422, resp.text

    # Regenerating an approved script creates a new version, not an overwrite.
    resp = await client.post(f"/projects/{project_id}/script/regenerate", headers=headers)
    assert resp.status_code == 200, resp.text
    regenerated = resp.json()
    assert regenerated["version"] == 2
    assert regenerated["status"] == "draft"

    resp = await client.post(f"/projects/{project_id}/script/approve", headers=headers)
    assert resp.status_code == 200, resp.text

    resp = await client.post(f"/projects/{project_id}/storyboard/generate", headers=headers)
    assert resp.status_code == 200, resp.text
    storyboard = resp.json()
    assert len(storyboard["scenes"]) >= 2
    assert isinstance(storyboard["qa_passed"], bool)

    resp = await client.get(f"/projects/{project_id}", headers=headers)
    assert resp.json()["status"] == "storyboard"

    return {"project_id": project_id, "storyboard": storyboard}
