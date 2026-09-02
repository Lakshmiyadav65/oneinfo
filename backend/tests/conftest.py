import os

os.environ.setdefault("EMBEDDING_PROVIDER", "dev")
os.environ.setdefault("STORAGE_LOCAL_PATH", "./data/test-uploads")

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient

from app.db.base import Base, get_engine, get_session_factory
from app.main import app as fastapi_app
from app.models.creator import Creator


def auth_headers(creator_id: str) -> dict:
    return {"Authorization": f"Bearer dev:{creator_id}"}


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
        await session.execute(sa.text("DELETE FROM knowledge_chunks"))
        await session.execute(sa.text("DELETE FROM knowledge_documents"))
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
