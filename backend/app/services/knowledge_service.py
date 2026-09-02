import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.knowledge import KnowledgeDocument, KnowledgeSourceType, KnowledgeStatus


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


async def create_pending_document(
    db: AsyncSession,
    creator_id: str,
    title: str,
    source_type: KnowledgeSourceType,
    storage_key: str | None,
) -> KnowledgeDocument:
    document = KnowledgeDocument(
        creator_id=creator_id,
        title=title,
        source_type=source_type,
        status=KnowledgeStatus.processing,
        storage_key=storage_key,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def delete_document(db: AsyncSession, creator_id: str, document_id: uuid.UUID) -> None:
    document = await get_owned_document(db, creator_id, document_id)
    await db.delete(document)
    await db.commit()
