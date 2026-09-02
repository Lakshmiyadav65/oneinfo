import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.core.errors import ValidationAppError
from app.db.session import get_db
from app.models.creator import Creator
from app.models.knowledge import KnowledgeDocument, KnowledgeSourceType
from app.providers.storage import get_storage_provider
from app.schemas.knowledge import KnowledgeDocumentOut, KnowledgeTextIn
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
    storage.save(storage_key, content)

    document = await knowledge_service.create_pending_document(
        db, creator.id, file.filename or "Untitled", source_type, storage_key
    )
    background_tasks.add_task(process_knowledge_document, document.id, None)
    return document


@router.delete("/{document_id}", status_code=204)
async def delete_knowledge(
    document_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> None:
    await knowledge_service.delete_document(db, creator.id, document_id)
