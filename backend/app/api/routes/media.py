import asyncio
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.asset import Asset, AssetType
from app.models.creator import Creator
from app.models.project import Project
from app.models.storyboard import StoryboardScene
from app.models.video_output import VideoOutput
from app.providers.storage import get_storage_provider
from app.schemas.media import MediaItemOut, MediaKind
from fastapi import Response

# Everything this creator has generated, in one place. The clips already
# existed but were only reachable inside the scene card that made them, which
# meant a finished shot was effectively lost the moment the creator moved on
# to another project.
router = APIRouter(prefix="/media", tags=["media"])


@router.get("", response_model=list[MediaItemOut])
async def list_media(
    kind: MediaKind | None = Query(default=None),
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> list[MediaItemOut]:
    """
    Finished videos and individual scene clips, newest first.

    Two tables rather than one, because a finished video and a scene clip are
    genuinely different things: one is the deliverable, the other is a part
    that made it. They are merged here so the creator sees a library rather
    than two lists.
    """
    items: list[MediaItemOut] = []

    if kind in (None, MediaKind.video):
        rows = await db.execute(
            select(VideoOutput, Project.title)
            .join(Project, Project.id == VideoOutput.project_id)
            .where(VideoOutput.creator_id == creator.id)
            .order_by(VideoOutput.created_at.desc())
        )
        for output, title in rows.all():
            items.append(
                MediaItemOut(
                    id=output.id,
                    kind=MediaKind.video,
                    project_id=output.project_id,
                    project_title=title,
                    label="Finished video",
                    duration_seconds=output.duration_seconds,
                    file_size_bytes=output.file_size_bytes,
                    url=f"/media/{output.id}/file?kind=video",
                    created_at=output.created_at,
                )
            )

    if kind in (None, MediaKind.clip):
        rows = await db.execute(
            select(Asset, Project.title, StoryboardScene.order)
            .join(Project, Project.id == Asset.project_id)
            .join(StoryboardScene, StoryboardScene.id == Asset.scene_id)
            .where(
                Asset.creator_id == creator.id,
                Asset.asset_type == AssetType.scene_video,
            )
            .order_by(Asset.created_at.desc())
        )
        for asset, title, order in rows.all():
            take = f" · take {asset.take_index + 1}" if asset.take_index else ""
            items.append(
                MediaItemOut(
                    id=asset.id,
                    kind=MediaKind.clip,
                    project_id=asset.project_id,
                    project_title=title,
                    label=f"Scene {order}{take}",
                    duration_seconds=asset.duration_seconds,
                    file_size_bytes=None,
                    url=f"/media/{asset.id}/file?kind=clip",
                    created_at=asset.created_at,
                )
            )

    items.sort(key=lambda item: item.created_at, reverse=True)
    return items


@router.get("/{item_id}/file")
async def download_media(
    item_id: uuid.UUID,
    kind: MediaKind,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    One media file.

    Ownership is checked against creator_id on the row itself rather than
    trusted from the id: these ids come back in a list, and a list is not an
    authorisation.
    """
    if kind is MediaKind.video:
        row = await db.get(VideoOutput, item_id)
    else:
        row = await db.get(Asset, item_id)

    if row is None or row.creator_id != creator.id:
        raise NotFoundError("That file isn't available.")

    storage = get_storage_provider(settings)
    content = await asyncio.to_thread(storage.read, row.storage_key)
    return Response(content=content, media_type=row.mime_type)
