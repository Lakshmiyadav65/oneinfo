from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.link_agent import run_link_agent
from app.core.config import Settings
from app.core.errors import AppError
from app.models.knowledge import KnowledgeSourceType
from app.providers.llm import get_llm_provider
from app.providers.web import fetch_page
from app.schemas.agents import LinkSummary
from app.schemas.link import LinkReadOut
from app.services import knowledge_service
from app.services.knowledge_processing import process_knowledge_document


class Scheduler(Protocol):
    """FastAPI's BackgroundTasks, narrowed to the one method used. Passed in
    rather than imported so the service can be driven from a test or a
    worker without a request behind it."""

    def add_task(self, func: Any, /, *args: Any, **kwargs: Any) -> None: ...

# Enough text to be an article rather than a redirect stub or a cookie wall.
MIN_USEFUL_CHARS = 300


def _as_summary(url: str, title: str, summary: LinkSummary) -> str:
    """The takeaways as text, for a prompt to treat as fact."""
    lines = [f"Source: {url}", f"Title: {title}"]
    if summary.topic:
        lines.append(f"What it is: {summary.topic}")
    if summary.audience:
        lines.append(f"Who it is for: {summary.audience}")
    for takeaway in summary.takeaways:
        lines.append(f"{takeaway.label}: {takeaway.detail}")
    if summary.call_to_action:
        lines.append(f"Call to action: {summary.call_to_action}")
    return "\n".join(lines)


def _as_document(url: str, title: str, summary: LinkSummary, page_text: str) -> str:
    """
    What gets filed in My Knowledge.

    The takeaways go first and the page text follows. Retrieval matches on
    the whole document, and a creator asking "when is the deadline" should
    hit the line that says so rather than the paragraph it was buried in -
    but the page itself is kept because the takeaways are one reading of it,
    and the next question may need something they left out.
    """
    lines = [f"Source: {url}", f"Title: {title}", ""]
    if summary.topic:
        lines.append(f"Topic: {summary.topic}")
    if summary.audience:
        lines.append(f"Audience: {summary.audience}")
    lines.append("")
    for takeaway in summary.takeaways:
        lines.append(f"{takeaway.label}: {takeaway.detail}")
    if summary.call_to_action:
        lines.append(f"Call to action: {summary.call_to_action}")
    lines += ["", "--- Full page text ---", "", page_text]
    return "\n".join(lines)


async def read_link(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    url: str,
    *,
    schedule: Any = None,
    save_to_knowledge: bool,
    language: str = "english",
    ingest_inline: bool = False,
) -> LinkReadOut:
    """
    Fetches one page, pulls out what a video could be built on, and
    optionally files it.

    Never raises for a page that simply could not be read. The caller is
    handling several links at once, and losing the two that worked because
    the third needed a login is not what anyone asked for.
    """
    try:
        page = await fetch_page(url)
    except AppError as exc:
        return LinkReadOut(url=url, title=url, error=str(exc))

    if len(page.text) < MIN_USEFUL_CHARS:
        return LinkReadOut(
            url=page.url,
            title=page.title,
            characters=len(page.text),
            error=(
                "There was almost no readable text on that page. It may load its "
                "content with JavaScript, or need a login."
            ),
        )

    llm = get_llm_provider(settings)
    summary = await run_link_agent(
        llm, url=page.url, title=page.title, page_text=page.text, language=language
    )

    if not summary.is_substantive:
        return LinkReadOut(
            url=page.url,
            title=page.title,
            characters=len(page.text),
            error=(
                "That page turned out to be mostly navigation rather than an "
                "article, so there was nothing to build a video from."
            ),
        )

    summary_text = _as_summary(page.url, page.title, summary)

    saved = False
    if save_to_knowledge:
        document = await knowledge_service.create_pending_document(
            db, creator_id, page.title[:200], KnowledgeSourceType.text, storage_key=None
        )
        document.source_url = page.url
        document.summary = summary_text
        await db.commit()

        content = _as_document(page.url, page.title, summary, page.text)
        if ingest_inline:
            # The caller is about to write from this page, and a document
            # still being chunked is a document the next step cannot use.
            await process_knowledge_document(document.id, content)
        else:
            # Otherwise after the response, the same way a pasted document
            # goes: chunking and embedding is the slow half.
            schedule.add_task(process_knowledge_document, document.id, content)
        saved = True

    return LinkReadOut(
        url=page.url,
        title=page.title,
        topic=summary.topic,
        audience=summary.audience,
        takeaways=summary.takeaways,
        call_to_action=summary.call_to_action,
        characters=len(page.text),
        saved_as_knowledge=saved,
        summary_text=summary_text,
    )


async def read_links(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    urls: list[str],
    *,
    schedule: Scheduler,
    save_to_knowledge: bool,
    language: str = "english",
) -> list[LinkReadOut]:
    """
    Reads several links, in the order given.

    Sequential rather than gathered: each one ends in a model call and a
    write, and firing five of those at once is a good way to hit a rate
    limit on the step a creator is watching.
    """
    results: list[LinkReadOut] = []
    for url in urls:
        results.append(
            await read_link(
                db, settings, creator_id, url,
                schedule=schedule,
                save_to_knowledge=save_to_knowledge,
                language=language,
            )
        )
    return results
