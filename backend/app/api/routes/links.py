from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models.creator import Creator
from app.schemas.link import LinkReadIn, LinkReadResultOut
from app.services import link_service

# Creators paste links, not just ideas: an event page, a job posting, a
# programme announcement. Reading it here means the script is built on what
# the page actually says rather than on what the model remembers about it.
router = APIRouter(prefix="/links", tags=["links"])


@router.post("/read", response_model=LinkReadResultOut)
async def read_links(
    payload: LinkReadIn,
    background_tasks: BackgroundTasks,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LinkReadResultOut:
    """
    Reads the pages behind some links and returns what a video could be
    built on: the topic, who it is for, and the specifics a viewer acts on.

    A link that cannot be read is reported beside the ones that could, never
    as a failure of the whole request.
    """
    pages = await link_service.read_links(
        db,
        settings,
        creator.id,
        payload.urls,
        schedule=background_tasks,
        save_to_knowledge=payload.save_to_knowledge,
    )
    return LinkReadResultOut(pages=pages)
