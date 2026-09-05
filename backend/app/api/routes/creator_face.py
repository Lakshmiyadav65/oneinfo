import asyncio
import uuid

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.creator import Creator
from app.models.creator_face import MAX_FACE_IMAGES, CreatorFaceImage
from app.providers.storage import get_storage_provider
from app.schemas.creator_face import (
    CreatorFaceImageOut,
    FaceDescriptionsIn,
    FaceSetupOut,
)
from app.services import creator_face_service

router = APIRouter(prefix="/creators/me/face", tags=["creator face"])


async def _setup(db: AsyncSession, creator: Creator) -> FaceSetupOut:
    images = await creator_face_service.list_faces(db, creator.id)
    return FaceSetupOut(
        images=[CreatorFaceImageOut.model_validate(image) for image in images],
        max_images=MAX_FACE_IMAGES,
        consent_granted=creator.face_consent_at is not None,
        consent_at=creator.face_consent_at,
        appearance_description=creator.appearance_description,
        voice_description=creator.voice_description,
        ready_for_generation=bool(images) and creator.face_consent_at is not None,
    )


@router.get("", response_model=FaceSetupOut)
async def get_face_setup(
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> FaceSetupOut:
    return await _setup(db, creator)


@router.post("", response_model=CreatorFaceImageOut, status_code=201)
async def upload_face(
    file: UploadFile = File(...),
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> CreatorFaceImageOut:
    content = await file.read()
    face = await creator_face_service.add_face(
        db, settings, creator.id, content, file.filename
    )
    return CreatorFaceImageOut.model_validate(face)


@router.post("/consent", response_model=FaceSetupOut)
async def grant_consent(
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> FaceSetupOut:
    await creator_face_service.grant_consent(db, creator)
    return await _setup(db, creator)


@router.delete("/consent", response_model=FaceSetupOut)
async def revoke_consent(
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> FaceSetupOut:
    await creator_face_service.revoke_consent(db, creator)
    return await _setup(db, creator)


@router.patch("/descriptions", response_model=FaceSetupOut)
async def update_descriptions(
    payload: FaceDescriptionsIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> FaceSetupOut:
    if payload.appearance_description is not None:
        creator.appearance_description = payload.appearance_description.strip() or None
    if payload.voice_description is not None:
        creator.voice_description = payload.voice_description.strip() or None
    await db.commit()
    await db.refresh(creator)
    return await _setup(db, creator)


@router.get("/{face_id}/file")
async def get_face_file(
    face_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    Serves a reference photo back so the UI can show what was uploaded.
    Scoped to the owning creator - a face is about as personal as stored
    data gets, and nobody else has any business fetching one.
    """
    result = await db.execute(
        select(CreatorFaceImage).where(
            CreatorFaceImage.id == face_id, CreatorFaceImage.creator_id == creator.id
        )
    )
    face = result.scalar_one_or_none()
    if face is None:
        raise NotFoundError("No such reference photo.")

    storage = get_storage_provider(settings)
    content = await asyncio.to_thread(storage.read, face.storage_key)
    return Response(content=content, media_type=face.mime_type)


# Declared last on purpose: "/{face_id}" would otherwise swallow "/consent"
# and "/descriptions" and fail them as malformed UUIDs.
@router.delete("/{face_id}", status_code=204)
async def delete_face(
    face_id: uuid.UUID,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
) -> None:
    await creator_face_service.delete_face(db, creator.id, face_id)
