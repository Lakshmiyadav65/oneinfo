from app.core.config import get_settings
from app.models.knowledge import KnowledgeSourceType
from app.services.knowledge_processing import process_knowledge_document
from app.services.knowledge_service import create_pending_document
from app.services.rag_service import retrieve
from tests.conftest import auth_headers


async def test_creator_b_cannot_see_or_delete_creator_a_document(client):
    resp_a = await client.post(
        "/knowledge/text",
        json={"title": "A's secret recipe", "content": "The secret ingredient is saffron."},
        headers=auth_headers("creator-a"),
    )
    assert resp_a.status_code == 201
    document_a_id = resp_a.json()["id"]

    resp_list_b = await client.get("/knowledge", headers=auth_headers("creator-b"))
    assert resp_list_b.status_code == 200
    assert all(item["id"] != document_a_id for item in resp_list_b.json())

    # Direct access by id must fail safely — 404, not 403 (never confirm
    # to Creator B that Creator A's document exists at all).
    resp_delete = await client.delete(f"/knowledge/{document_a_id}", headers=auth_headers("creator-b"))
    assert resp_delete.status_code == 404

    resp_list_a = await client.get("/knowledge", headers=auth_headers("creator-a"))
    assert any(item["id"] == document_a_id for item in resp_list_a.json())


async def test_rag_retrieval_is_scoped_to_creator(db_session, seeded_dev_creators):
    doc_a = await create_pending_document(
        db_session, "creator-a", "A knowledge", KnowledgeSourceType.text, None
    )
    await process_knowledge_document(doc_a.id, "OneInfo Creator A sells handmade ceramic pottery.")

    doc_b = await create_pending_document(
        db_session, "creator-b", "B knowledge", KnowledgeSourceType.text, None
    )
    await process_knowledge_document(doc_b.id, "OneInfo Creator B teaches guitar lessons online.")

    settings = get_settings()

    results_for_a = await retrieve(db_session, settings, "creator-a", "pottery", k=5)
    assert results_for_a, "expected at least one chunk for creator-a"
    assert all(chunk.creator_id == "creator-a" for chunk in results_for_a)
    assert any("pottery" in chunk.content.lower() for chunk in results_for_a)
    assert not any("guitar" in chunk.content.lower() for chunk in results_for_a)

    results_for_b = await retrieve(db_session, settings, "creator-b", "guitar", k=5)
    assert results_for_b, "expected at least one chunk for creator-b"
    assert all(chunk.creator_id == "creator-b" for chunk in results_for_b)
    assert any("guitar" in chunk.content.lower() for chunk in results_for_b)
    assert not any("pottery" in chunk.content.lower() for chunk in results_for_b)


def test_a_document_reads_back_out_of_its_chunks_without_repeating_itself():
    """
    Opening a knowledge item shows what it says, and the text only survives
    ingestion as overlapping chunks. Rejoining without dropping the overlap
    makes every boundary read twice — a creator checking a transcript would
    see each sentence stutter and reasonably conclude the transcriber did it.
    """
    from app.providers.chunking import chunk_text
    from app.services.knowledge_service import rejoin_chunks

    original = " ".join(f"word{n}" for n in range(1000))
    chunks = chunk_text(original, 400, 60)

    assert len(chunks) > 1, "needs to actually chunk for this to mean anything"
    assert rejoin_chunks(chunks, 60) == original


def test_rejoining_a_single_chunk_changes_nothing():
    from app.services.knowledge_service import rejoin_chunks

    assert rejoin_chunks(["just the one"], 60) == "just the one"
    assert rejoin_chunks([], 60) == ""


def test_a_trailing_chunk_shorter_than_the_overlap_adds_nothing():
    """It is entirely contained in the chunk before it, so contributing any
    of it would duplicate text that is already there."""
    from app.providers.chunking import chunk_text
    from app.services.knowledge_service import rejoin_chunks

    original = " ".join(f"w{n}" for n in range(341 + 340))
    chunks = chunk_text(original, 400, 60)

    assert rejoin_chunks(chunks, 60) == original


async def test_a_creator_nobody_has_seen_before_can_bring_their_own_knowledge(client):
    """
    The question this whole layer exists to answer: someone signs in with an
    account that has never existed, pastes their knowledge, and builds from
    it - without seeing anyone else's, and without anyone having seeded a row
    for them first.

    It could not be asked at all until recently. The dev verifier accepted
    exactly two ids, so a third creator could not be created, and the app
    read as single-tenant when only its front door was.
    """
    newcomer = auth_headers("meera@runclub.in")

    # No row is seeded for her. The first authenticated request makes one.
    empty = await client.get("/knowledge", headers=newcomer)
    assert empty.status_code == 200
    assert empty.json() == []

    filed = await client.post(
        "/knowledge/text",
        json={
            "title": "Couch to 10K",
            "content": (
                "Run-walk intervals. Week one is sixty seconds running and "
                "ninety walking. Never add more than ten percent mileage in "
                "a week or you will get shin splints."
            ),
        },
        headers=newcomer,
    )
    assert filed.status_code == 201, filed.text

    hers = await client.get("/knowledge", headers=newcomer)
    assert [item["title"] for item in hers.json()] == ["Couch to 10K"]

    # And she is nobody else's problem, in either direction.
    theirs = await client.get("/knowledge", headers=auth_headers("creator-a"))
    assert all(item["title"] != "Couch to 10K" for item in theirs.json())


async def test_a_new_creator_builds_a_project_from_their_own_knowledge(client):
    """
    Past the knowledge layer and into the work. A project, its hooks and its
    script all have to be filed against the creator who asked for them, or a
    second creator's video is built out of the first one's material.
    """
    newcomer = auth_headers("meera@runclub.in")
    await client.post(
        "/knowledge/text",
        json={"title": "My voice", "content": "Short sentences. Plain English. No jargon."},
        headers=newcomer,
    )

    created = await client.post(
        "/projects",
        json={"idea": "A beginner roadmap for a first 10K", "language": "english"},
        headers=newcomer,
    )
    assert created.status_code == 201, created.text
    project_id = created.json()["id"]

    hooks = await client.post(f"/projects/{project_id}/hooks/generate", headers=newcomer)
    assert hooks.status_code == 200, hooks.text
    assert hooks.json()

    # The project belongs to her and to nobody else.
    mine = await client.get("/projects", headers=newcomer)
    assert [p["id"] for p in mine.json()] == [project_id]

    others = await client.get("/projects", headers=auth_headers("creator-a"))
    assert all(p["id"] != project_id for p in others.json())

    denied = await client.get(f"/projects/{project_id}", headers=auth_headers("creator-a"))
    assert denied.status_code == 404
