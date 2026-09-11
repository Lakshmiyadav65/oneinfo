import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.knowledge import (
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeSourceType,
    KnowledgeStatus,
)


async def list_documents(db: AsyncSession, creator_id: str) -> list[KnowledgeDocument]:
    result = await db.execute(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.creator_id == creator_id)
        .order_by(KnowledgeDocument.created_at.desc())
    )
    return list(result.scalars().all())


async def get_owned_document(
    db: AsyncSession, creator_id: str, document_id: uuid.UUID
) -> KnowledgeDocument:
    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.creator_id == creator_id,
        )
    )
    document = result.scalar_one_or_none()
    if document is None:
        # 404, not 403 — never confirm to a caller that another creator's
        # document exists at all.
        raise NotFoundError("Knowledge item not found.")
    return document


async def find_by_source_url(
    db: AsyncSession, creator_id: str, source_url: str
) -> KnowledgeDocument | None:
    """
    An earlier document from the same link, if there is one.

    Transcribing a reel costs a request per chunk of audio, so the same link
    pasted into a second batch should cost nothing at all. A failed attempt
    is not a match — that one is worth retrying.
    """
    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.creator_id == creator_id,
            KnowledgeDocument.source_url == source_url,
            KnowledgeDocument.status != KnowledgeStatus.failed,
        )
    )
    return result.scalars().first()


def rejoin_chunks(chunks: list[str], overlap_words: int) -> str:
    """
    The document's text, back out of the chunks it was stored as.

    Chunking is the only place the text survives ingestion — the original is
    never kept, since a knowledge document exists to be retrieved rather than
    re-read. Consecutive chunks deliberately overlap so a sentence split
    across a boundary is still findable, so rejoining means dropping each
    chunk's leading overlap or every boundary reads twice.

    Word-exact, not byte-exact: chunking normalises whitespace, so the line
    breaks a transcript was written with are already gone by this point and
    no amount of rejoining brings them back.
    """
    if not chunks:
        return ""
    parts = [chunks[0]]
    for chunk in chunks[1:]:
        # A final chunk shorter than the overlap is entirely contained in the
        # one before it, and correctly contributes nothing.
        parts.append(" ".join(chunk.split()[overlap_words:]))
    return " ".join(part for part in parts if part).strip()


async def get_document_text(
    db: AsyncSession, creator_id: str, document_id: uuid.UUID, overlap_words: int
) -> tuple[KnowledgeDocument, str, int]:
    """The document, what it says, and how many chunks retrieval sees it as."""
    document = await get_owned_document(db, creator_id, document_id)
    result = await db.execute(
        select(KnowledgeChunk.content)
        .where(KnowledgeChunk.document_id == document.id)
        .order_by(KnowledgeChunk.chunk_index)
    )
    chunks = list(result.scalars().all())

    # The text as written wins where there is one: it still has the line
    # breaks that make a transcript readable. Rejoining is the fallback for
    # documents filed before it was kept, which are otherwise unreadable.
    text = document.content or rejoin_chunks(chunks, overlap_words)
    return document, text, len(chunks)


async def create_pending_document(
    db: AsyncSession,
    creator_id: str,
    title: str,
    source_type: KnowledgeSourceType,
    storage_key: str | None,
    source_url: str | None = None,
) -> KnowledgeDocument:
    document = KnowledgeDocument(
        creator_id=creator_id,
        title=title,
        source_type=source_type,
        status=KnowledgeStatus.processing,
        storage_key=storage_key,
        source_url=source_url,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


# How much of an edited transcript is kept as the standing summary. Matches
# reel_ingestion.MAX_SUMMARY_CHARS - the same cap, for the same reason.
MAX_SUMMARY_CHARS = 2000


def summarise_for_prompts(content: str) -> str:
    """
    The document, trimmed to what a prompt should be handed as fact.

    Only used for transcripts, where the summary is the words themselves
    with a provenance header. A page read from a link has takeaways written
    by a model instead, and truncating its text would replace something
    considered with something merely short.
    """
    trimmed = content.strip()
    if len(trimmed) <= MAX_SUMMARY_CHARS:
        return trimmed
    return trimmed[:MAX_SUMMARY_CHARS].rstrip() + "\n[transcript continues]"


async def save_edited_content(
    db: AsyncSession, creator_id: str, document_id: uuid.UUID, content: str
) -> KnowledgeDocument:
    """
    Takes a correction and marks the document for re-reading.

    Writes the text now so the editor closes on what was actually typed, and
    leaves the chunking and embedding to the background - it is the slow
    half, and the same half every other way into this table defers.

    The summary is rewritten alongside it for a transcript, because there it
    *is* the transcript and a stale copy would keep feeding the mistake to
    every prompt that cites the source. A link's takeaways are left alone;
    they were written by a model from the page, and replacing them with
    truncated text on an unrelated edit would be a downgrade.
    """
    document = await get_owned_document(db, creator_id, document_id)
    document.content = content
    if document.source_type in (KnowledgeSourceType.reel, KnowledgeSourceType.video):
        document.summary = summarise_for_prompts(content)
    document.status = KnowledgeStatus.processing
    document.error_message = None
    await db.commit()
    await db.refresh(document)
    return document


async def mark_reprocessing(
    db: AsyncSession, creator_id: str, document_id: uuid.UUID
) -> KnowledgeDocument:
    """Puts a document back into processing before it is read again."""
    document = await get_owned_document(db, creator_id, document_id)
    document.status = KnowledgeStatus.processing
    document.error_message = None
    await db.commit()
    await db.refresh(document)
    return document


async def delete_document(db: AsyncSession, creator_id: str, document_id: uuid.UUID) -> None:
    document = await get_owned_document(db, creator_id, document_id)
    await db.delete(document)
    await db.commit()
