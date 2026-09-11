import asyncio
import json
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_creator
from app.core.config import Settings, get_settings
from app.core.errors import NotFoundError, ValidationAppError
from app.db.session import get_db
from app.models.creator import Creator
from app.models.creator_face import MAX_FACE_IMAGES, CreatorFaceImage
from app.providers.storage import get_storage_provider
from app.schemas.creator_face import (
    CreatorFaceImageOut,
    CreatorRecordingOut,
    FaceDescriptionsIn,
    FaceSetupOut,
    ReextractIn,
)
from app.services import creator_face_service, creator_recording_service

router = APIRouter(prefix="/creators/me/face", tags=["creator face"])

_CHUNK_BYTES = 1024 * 1024


async def _setup(db: AsyncSession, creator: Creator) -> FaceSetupOut:
    images = await creator_face_service.list_faces(db, creator.id)
    recording = await creator_recording_service.get_recording(db, creator.id)
    return FaceSetupOut(
        images=[CreatorFaceImageOut.model_validate(image) for image in images],
        max_images=MAX_FACE_IMAGES,
        consent_granted=creator.face_consent_at is not None,
        consent_at=creator.face_consent_at,
        appearance_description=creator.appearance_description,
        voice_description=creator.voice_description,
        recording=CreatorRecordingOut.model_validate(recording) if recording else None,
        ready_for_generation=bool(images) and creator.face_consent_at is not None,
    )


async def _spool_to_disk(file: UploadFile, limit_bytes: int) -> Path:
    """
    Writes an upload to a temp file a megabyte at a time.

    Unlike a reference photo, a capture is not read whole into memory. It has
    to reach disk for ffprobe regardless, and the limit is enforced as the
    bytes arrive so an oversized take is refused partway through rather than
    after the server has already held all of it.
    """
    path = Path(tempfile.gettempdir()) / f"oneinfo-capture-{uuid.uuid4()}.upload"
    written = 0
    try:
        with path.open("wb") as out:
            while chunk := await file.read(_CHUNK_BYTES):
                written += len(chunk)
                if written > limit_bytes:
                    raise ValidationAppError(
                        "That recording is too large. Record a shorter one."
                    )
                out.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return path


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


def _take_mime(raw: str | None) -> str:
    """
    The container a take is stored as.

    MediaRecorder reports its type with the codecs attached
    ("video/webm;codecs=vp9,opus"), which is not a media type anything will
    serve back. Narrowed to what we are willing to store; ffprobe decides
    whether the bytes are actually video, not this.
    """
    base = (raw or "").split(";")[0].strip().lower()
    return base if base in {"video/webm", "video/mp4"} else "video/webm"


@router.post("/capture", response_model=FaceSetupOut, status_code=201)
async def save_capture(
    file: UploadFile = File(...),
    frames: list[UploadFile] = File(...),
    angles: str = Form(...),
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FaceSetupOut:
    """
    One live capture, and the three frames the browser confirmed from it.

    Replaces the whole reference set rather than adding to it - see
    creator_recording_service for why a capture's frames are not mixed with
    older photos.
    """
    try:
        raw_angles = json.loads(angles)
    except json.JSONDecodeError:
        raise ValidationAppError("That capture's angles weren't readable.") from None

    take_path = await _spool_to_disk(file, settings.max_recording_bytes)
    try:
        frame_bytes = [await frame.read() for frame in frames]
        await creator_recording_service.save_capture(
            db,
            settings,
            creator.id,
            take_path=take_path,
            mime_type=_take_mime(file.content_type),
            frames=frame_bytes,
            raw_angles=raw_angles,
        )
    finally:
        take_path.unlink(missing_ok=True)

    await db.refresh(creator)
    return await _setup(db, creator)


@router.post("/recording/reextract", response_model=FaceSetupOut)
async def reextract_frames(
    payload: ReextractIn,
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FaceSetupOut:
    await creator_recording_service.reextract(db, settings, creator.id, payload.angles)
    return await _setup(db, creator)


@router.get("/recording/file")
async def get_recording_file(
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    Plays the capture back so the creator can see what is stored.

    Scoped to the owning creator, like the reference photos. This is the most
    personal file the product holds and nobody else has any business fetching
    one.
    """
    recording = await creator_recording_service.get_recording(db, creator.id)
    if recording is None:
        raise NotFoundError("You don't have a recording.")
    storage = get_storage_provider(settings)
    content = await asyncio.to_thread(storage.read, recording.storage_key)
    return Response(content=content, media_type=recording.mime_type)


@router.delete("/recording", response_model=FaceSetupOut)
async def delete_recording(
    creator: Creator = Depends(get_current_creator),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FaceSetupOut:
    """Deletes the capture and keeps the frames cut from it."""
    await creator_recording_service.delete_recording(db, settings, creator.id)
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
