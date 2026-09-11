import asyncio
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.knowledge_structuring_agent import (
    MAX_STRUCTURING_CHARS,
    run_knowledge_structuring_agent,
    serialise_parts,
)
from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.core.errors import ValidationAppError
from app.db.session import get_db
from app.models.creator import Creator
from app.models.knowledge import KnowledgeDocument, KnowledgeSourceType
from app.providers.llm import get_llm_provider
from app.providers.reels import is_video_url
from app.providers.storage import get_storage_provider
from app.schemas.knowledge import (
    KnowledgeBulkIn,
    KnowledgeDetailOut,
    KnowledgeDocumentOut,
    KnowledgePartOut,
    KnowledgeReelsIn,
    KnowledgeReelsOut,
    KnowledgeSectionOut,
    KnowledgeStructureIn,
    KnowledgeStructureOut,
    KnowledgeTextIn,
    ReelQueuedOut,
)
from app.services import knowledge_service, project_service
from app.services.knowledge_processing import process_knowledge_document
from app.services.reel_ingestion import transcribe_into_knowledge

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

_EXTENSION_TO_SOURCE_TYPE = {
    "pdf": KnowledgeSourceType.pdf,
    "docx": KnowledgeSourceType.docx,
    "txt": KnowledgeSourceType.txt,
}

# What a browser will hand over from a phone's camera roll or a downloaded
# reel. Checked as a first pass only — ffmpeg is what actually decides
# whether the bytes are a video, and it gets the last word.
_VIDEO_EXTENSIONS = {"mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"}

_UPLOAD_CHUNK_BYTES = 1024 * 1024


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
            KnowledgeSectionOut(
                title=section.title,
                parts=[
                    KnowledgePartOut(label=part.label, text=part.text) for part in section.parts
                ],
                content=serialise_parts(section.parts),
            )
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


@router.post("/reels", response_model=KnowledgeReelsOut, status_code=202)
async def add_reel_knowledge(
    payload: KnowledgeReelsIn,
    background_tasks: BackgroundTasks,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeReelsOut:
    """
    Files what a creator said in their own reels.

    202, not 201: downloading and transcribing happens after this returns, so
    every document here comes back "processing". A link that cannot be
    accepted is reported beside the ones that were — losing four good reels
    because the fifth was a typo is not what anyone asked for.
    """
    # Unasked, a reel is transcribed into whatever this creator's projects
    # are in — the same guess new projects make, for the same reason: it is
    # a better one than a hardcoded default, and it is the language they
    # will be writing from this transcript in.
    language = payload.language or await project_service.last_used_language(db, creator.id)
    results: list[ReelQueuedOut] = []

    for raw_url in payload.urls:
        url = raw_url.strip()
        if not url:
            continue
        if not is_video_url(url):
            results.append(
                ReelQueuedOut(url=url, error="That is not a link. Paste the reel's URL.")
            )
            continue

        existing = await knowledge_service.find_by_source_url(db, creator.id, url)
        if existing is not None:
            results.append(
                ReelQueuedOut(
                    url=url,
                    document=KnowledgeDocumentOut.model_validate(existing),
                    already_added=True,
                )
            )
            continue

        document = await knowledge_service.create_pending_document(
            db,
            creator.id,
            # Named after the link until the download reports the caption it
            # was posted with, which is a better name and arrives later.
            url,
            KnowledgeSourceType.reel,
            storage_key=None,
            source_url=url,
        )
        background_tasks.add_task(
            transcribe_into_knowledge,
            document.id,
            url=url,
            language_key=language,
        )
        results.append(
            ReelQueuedOut(url=url, document=KnowledgeDocumentOut.model_validate(document))
        )

    return KnowledgeReelsOut(reels=results)


@router.post("/video", response_model=KnowledgeDocumentOut, status_code=202)
async def add_video_knowledge(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str | None = Form(None),
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> KnowledgeDocument:
    """
    The same thing for a video file, for the reel Instagram will not hand over.

    The file is spooled to disk and never stored: what gets kept is the
    transcript. Holding the video too would mean paying to store two hundred
    megabytes in order to retrieve four hundred words, and the words are the
    only part My Knowledge ever reads.
    """
    filename = file.filename or "video"
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension not in _VIDEO_EXTENSIONS:
        raise ValidationAppError(
            "That does not look like a video. Upload an MP4, MOV or WEBM file."
        )

    path = await _spool_video_to_disk(file, settings.max_video_bytes)

    document = await knowledge_service.create_pending_document(
        db, creator.id, filename, KnowledgeSourceType.video, storage_key=None
    )
    background_tasks.add_task(
        transcribe_into_knowledge,
        document.id,
        local_path=str(path),
        language_key=language or await project_service.last_used_language(db, creator.id),
    )
    return document


async def _spool_video_to_disk(file: UploadFile, limit_bytes: int) -> Path:
    """
    Writes an upload to a temp file a megabyte at a time.

    The limit is enforced as the bytes arrive, so an oversized video is
    refused partway through rather than after the server has already held
    all of it. The transcription task deletes the file when it is done with
    it, however that goes.
    """
    path = Path(tempfile.gettempdir()) / f"oneinfo-knowledge-{uuid.uuid4()}.upload"
    written = 0
    try:
        with path.open("wb") as out:
            while chunk := await file.read(_UPLOAD_CHUNK_BYTES):
                written += len(chunk)
                if written > limit_bytes:
                    raise ValidationAppError(
                        "That video is too large. Upload a shorter one, or trim it first."
                    )
                out.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return path


@router.get("/{document_id}", response_model=KnowledgeDetailOut)
async def get_knowledge(
    document_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> KnowledgeDetailOut:
    """
    What this document actually says.

    Read back out of the chunks rather than from a stored copy: the chunks
    are what retrieval searches, so this shows what the agents will find
    rather than what was submitted, and the two are worth not confusing.
    """
    document, content, chunk_count = await knowledge_service.get_document_text(
        db, creator.id, document_id, settings.chunk_overlap_words
    )
    return KnowledgeDetailOut(
        **KnowledgeDocumentOut.model_validate(document).model_dump(),
        content=content,
        chunk_count=chunk_count,
        summary=document.summary,
    )


@router.delete("/{document_id}", status_code=204)
async def delete_knowledge(
    document_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> None:
    await knowledge_service.delete_document(db, creator.id, document_id)
