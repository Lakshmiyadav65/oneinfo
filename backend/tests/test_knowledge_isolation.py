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
