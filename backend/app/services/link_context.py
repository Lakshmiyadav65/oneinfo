"""
The page behind a link in the idea, as authoritative context.

Exists because of a specific failure. A creator pasted an event page URL as
their whole idea. Nothing read it, so the idea carried no subject, and the
hook agent took its subject from retrieved knowledge instead - four of that
creator's six filed documents were about a different event, so the project
came back titled after it and every hook was about the wrong thing. It was
entirely plausible and entirely wrong, which is the worst way to be wrong.
"""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import ValidationAppError
from app.models.knowledge import KnowledgeDocument
from app.models.project import Project
from app.services import link_service

_URL = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
# Trailing punctuation belongs to the sentence, not the address.
_TRAILING = ".,;:!?)]}"


def find_urls(text: str) -> list[str]:
    seen: list[str] = []
    for match in _URL.findall(text or ""):
        url = match.rstrip(_TRAILING)
        if url not in seen:
            seen.append(url)
    return seen


async def for_idea(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    project: Project,
) -> str | None:
    """
    What the links in this idea actually say, or None when there are none.

    Raises rather than returning empty when a link is present but unreadable.
    Generating anyway is what produced a video about the wrong event, and the
    creator cannot tell from the output that it happened.
    """
    urls = find_urls(project.idea)
    if not urls:
        return None

    sections: list[str] = []
    failures: list[str] = []

    for url in urls:
        existing = (
            await db.execute(
                select(KnowledgeDocument).where(
                    KnowledgeDocument.creator_id == creator_id,
                    KnowledgeDocument.source_url == url,
                )
            )
        ).scalars().first()
        if existing is not None and existing.summary:
            # Already read, on this project or another. Re-fetching would
            # cost a round trip and a model call to learn the same thing.
            sections.append(existing.summary)
            continue

        page = await link_service.read_link(
            db,
            settings,
            creator_id,
            url,
            save_to_knowledge=True,
            ingest_inline=True,
            language=project.language,
        )
        if page.error:
            failures.append(f"{url} — {page.error}")
        elif page.summary_text:
            sections.append(page.summary_text)

    if sections:
        return "\n\n".join(sections)

    raise ValidationAppError(
        "Your idea is a link, and it couldn't be read, so there is nothing to "
        "write about yet. Generating anyway would produce a video about "
        "whatever else is in your knowledge, which is not what you asked for.\n\n"
        + "\n".join(failures)
        + "\n\nOpen the page, copy its text, and add it under My Knowledge — "
        "then describe the video you want in the idea box."
    )
