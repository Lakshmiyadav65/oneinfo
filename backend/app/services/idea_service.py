from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.idea_agent import run_idea_agent
from app.core.config import Settings
from app.models.knowledge import KnowledgeChunk
from app.providers.llm import get_llm_provider
from app.schemas.agents import IdeaSuggestionList

# Enough of the creator's material to establish niche and voice without
# burying the instructions in a wall of retrieved text.
_KNOWLEDGE_SAMPLE_SIZE = 10


async def suggest_ideas(
    db: AsyncSession, settings: Settings, creator_id: str, language: str
) -> tuple[IdeaSuggestionList, bool]:
    """
    Proposes ideas for a creator with an empty Idea box.

    Unlike every other agent here this one has no query to retrieve against —
    there is no idea yet, which is the whole point. So it samples the
    creator's most recent knowledge instead of running a semantic search,
    and the newest material is the best guess at what they are working on now.

    Returns the suggestions and whether any knowledge backed them.
    """
    result = await db.execute(
        select(KnowledgeChunk.content)
        .where(KnowledgeChunk.creator_id == creator_id)
        .order_by(KnowledgeChunk.created_at.desc())
        .limit(_KNOWLEDGE_SAMPLE_SIZE)
    )
    chunks = list(result.scalars().all())

    llm = get_llm_provider(settings)
    suggestions = await run_idea_agent(
        llm,
        knowledge_chunks=chunks,
        count=settings.idea_suggestion_count,
        language=language,
    )
    return suggestions, bool(chunks)
