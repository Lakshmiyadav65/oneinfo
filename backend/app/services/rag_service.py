from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.knowledge import KnowledgeChunk
from app.providers.embeddings import get_embedding_provider


async def retrieve(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    query: str,
    k: int | None = None,
) -> list[KnowledgeChunk]:
    """
    Creator-scoped semantic retrieval. creator_id is applied in the WHERE
    clause of the same query as the similarity ordering — never a global
    search filtered afterward.
    """
    embedder = get_embedding_provider(settings)
    query_embedding = embedder.embed([query])[0]
    limit = k or settings.rag_top_k

    stmt = (
        select(KnowledgeChunk)
        .where(KnowledgeChunk.creator_id == creator_id)
        .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
