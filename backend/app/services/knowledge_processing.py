import asyncio
import uuid

from app.core.config import get_settings
from app.db.base import get_session_factory
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeStatus
from app.providers.chunking import chunk_text
from app.providers.embeddings import get_embedding_provider
from app.providers.storage import get_storage_provider
from app.providers.text_extraction.extract import extract_text


async def process_knowledge_document(document_id: uuid.UUID, raw_text: str | None = None) -> None:
    """
    Runs the RAG ingestion pipeline for one document: extract (unless
    raw_text is already given, e.g. pasted text) -> chunk -> embed -> store
    chunks, then marks the document ready or failed. Owns its own DB
    session since it may run after the originating request has finished.
    """
    settings = get_settings()
    session_factory = get_session_factory()

    async with session_factory() as db:
        document = await db.get(KnowledgeDocument, document_id)
        if document is None:
            return

        try:
            text = raw_text
            if text is None:
                storage = get_storage_provider(settings)
                # StorageProvider/EmbeddingProvider are sync interfaces
                # (real providers do blocking network/disk I/O) — hop off
                # the event loop so one slow document can't stall every
                # other concurrent request.
                content = await asyncio.to_thread(storage.read, document.storage_key)
                text = extract_text(document.source_type, content)

            chunks = chunk_text(text, settings.chunk_size_words, settings.chunk_overlap_words)
            if not chunks:
                raise ValueError("No extractable text content.")

            embedder = get_embedding_provider(settings)
            embeddings = await asyncio.to_thread(embedder.embed, chunks)

            for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                db.add(
                    KnowledgeChunk(
                        document_id=document.id,
                        creator_id=document.creator_id,
                        chunk_index=index,
                        content=chunk,
                        embedding=embedding,
                    )
                )

            document.status = KnowledgeStatus.ready
            document.error_message = None
            await db.commit()
        except Exception as exc:
            await db.rollback()
            document = await db.get(KnowledgeDocument, document_id)
            if document is not None:
                document.status = KnowledgeStatus.failed
                document.error_message = str(exc)[:500]
                await db.commit()
