import asyncio
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.knowledge_structuring_agent import (
    MAX_STRUCTURING_CHARS,
    run_knowledge_structuring_agent,
)
from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.core.errors import ValidationAppError
from app.db.session import get_db
from app.models.creator import Creator
from app.models.knowledge import KnowledgeDocument, KnowledgeSourceType
from app.providers.llm import get_llm_provider
from app.providers.storage import get_storage_provider
from app.schemas.knowledge import (
    KnowledgeBulkIn,
    KnowledgeDocumentOut,
    KnowledgeSectionOut,
    KnowledgeStructureIn,
    KnowledgeStructureOut,
    KnowledgeTextIn,
)
from app.services import knowledge_service
from app.services.knowledge_processing import process_knowledge_document

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

_EXTENSION_TO_SOURCE_TYPE = {
    "pdf": KnowledgeSourceType.pdf,
    "docx": KnowledgeSourceType.docx,
    "txt": KnowledgeSourceType.txt,
}


@router.get("", response_model=list[KnowledgeDocumentOut])
async def list_knowledge(
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> list[KnowledgeDocument]:
    return await knowledge_service.list_documents(db, creator.id)


@router.post("/text", response_model=KnowledgeDocumentOut, status_code=201)
async def add_text_knowledge(
    payload: KnowledgeTextIn,
    background_tasks: BackgroundTasks,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeDocument:
    document = await knowledge_service.create_pending_document(
        db, creator.id, payload.title, KnowledgeSourceType.text, storage_key=None
    )
    background_tasks.add_task(process_knowledge_document, document.id, payload.content)
    return document


@router.post("/upload", response_model=KnowledgeDocumentOut, status_code=201)
async def upload_knowledge(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> KnowledgeDocument:
    extension = (file.filename or "").rsplit(".", 1)[-1].lower()
    source_type = _EXTENSION_TO_SOURCE_TYPE.get(extension)
    if source_type is None:
        raise ValidationAppError("Only PDF, DOCX, or TXT files are supported.")

    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise ValidationAppError("File is too large.")

    storage = get_storage_provider(settings)
    storage_key = f"{creator.id}/{uuid.uuid4()}_{file.filename}"
    # StorageProvider is a sync interface (local disk is sync; so is the
    # GCS SDK) — always hop off the event loop so a slow upload can't
    # stall every other concurrent request.
    await asyncio.to_thread(storage.save, storage_key, content)

    document = await knowledge_service.create_pending_document(
        db, creator.id, file.filename or "Untitled", source_type, storage_key
    )
    background_tasks.add_task(process_knowledge_document, document.id, None)
    return document


@router.post("/structure", response_model=KnowledgeStructureOut)
async def structure_knowledge(
    payload: KnowledgeStructureIn,
    creator: Creator = Depends(get_current_creator),
    settings: Settings = Depends(get_settings),
) -> KnowledgeStructureOut:
    """
    Proposes a split of a raw paste into topic-separated documents.

    Deliberately saves nothing: the creator reviews and edits the proposal,
    then commits it via POST /knowledge/bulk. Storing first and cleaning up
    after would leave a bad split in retrieval for as long as it took them
    to notice.
    """
    if not payload.content.strip():
        raise ValidationAppError("Paste some content first.")

    llm = get_llm_provider(settings)
    structured = await run_knowledge_structuring_agent(llm, raw_text=payload.content)
    return KnowledgeStructureOut(
        sections=[
            KnowledgeSectionOut(title=section.title, content=section.content)
            for section in structured.sections
        ],
        truncated=len(payload.content) > MAX_STRUCTURING_CHARS,
    )


@router.post("/bulk", response_model=list[KnowledgeDocumentOut], status_code=201)
async def add_bulk_knowledge(
    payload: KnowledgeBulkIn,
    background_tasks: BackgroundTasks,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> list[KnowledgeDocument]:
    """Commits the reviewed sections from /structure as separate documents."""
    documents = []
    for entry in payload.documents:
        document = await knowledge_service.create_pending_document(
            db, creator.id, entry.title, KnowledgeSourceType.text, storage_key=None
        )
        background_tasks.add_task(process_knowledge_document, document.id, entry.content)
        documents.append(document)
    return documents


@router.delete("/{document_id}", status_code=204)
async def delete_knowledge(
    document_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> None:
    await knowledge_service.delete_document(db, creator.id, document_id)
