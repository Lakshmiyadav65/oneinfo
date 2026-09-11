import asyncio
import io
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.models.creator import Creator
from app.models.creator_face import MAX_FACE_IMAGES, CreatorFaceImage
from app.providers.storage import get_storage_provider

# Veo works from a face, and a face that is a hundred pixels across carries
# no likeness to work from. This is deliberately permissive — it rejects
# thumbnails and icons, not ordinary phone photos.
MIN_FACE_DIMENSION = 400


def _probe_image(content: bytes) -> tuple[str, int, int]:
    """(mime_type, width, height) — and a clear error if it isn't an image."""
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - Pillow is a hard dependency
        raise ValidationAppError("Image support is unavailable on the server.") from None

    try:
        with Image.open(io.BytesIO(content)) as image:
            fmt = (image.format or "").lower()
            width, height = image.size
    except Exception:
        raise ValidationAppError("That file isn't a readable image.") from None

    mime = {"jpeg": "image/jpeg", "jpg": "image/jpeg", "png": "image/png"}.get(fmt)
    if mime is None:
        raise ValidationAppError("Reference photos must be JPEG or PNG.")
    return mime, width, height


def validate_face_image(settings: Settings, content: bytes) -> tuple[str, int, int]:
    """
    (mime_type, width, height), or a readable refusal.

    Split out from add_face so a caller holding several images can find out
    that one of them is unusable *before* it starts replacing what the
    creator already has. A capture that fails on its third frame must not
    leave someone with no reference set at all.
    """
    if len(content) > settings.max_upload_bytes:
        raise ValidationAppError("That photo is too large.")

    mime, width, height = _probe_image(content)
    if min(width, height) < MIN_FACE_DIMENSION:
        raise ValidationAppError(
            f"That photo is {width}x{height}. Reference photos need to be at least "
            f"{MIN_FACE_DIMENSION}px on the shorter side so the face is usable."
        )
    return mime, width, height


async def list_faces(db: AsyncSession, creator_id: str) -> list[CreatorFaceImage]:
    result = await db.execute(
        select(CreatorFaceImage)
        .where(CreatorFaceImage.creator_id == creator_id)
        .order_by(CreatorFaceImage.position, CreatorFaceImage.created_at)
    )
    return list(result.scalars().all())


async def add_face(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    content: bytes,
    filename: str | None,
    *,
    recording_id: uuid.UUID | None = None,
    angle: str | None = None,
) -> CreatorFaceImage:
    """
    Adds one reference image, wherever the bytes came from.

    Frames grabbed from a live capture come through here too, and are probed
    exactly as hard as a file a creator picked: they arrive from a browser
    either way, so drawing them ourselves earns them no trust. Keeping this
    the single door in is also what stops the size, dimension and count rules
    from being written down twice and drifting apart.
    """
    mime, width, height = validate_face_image(settings, content)

    existing = await list_faces(db, creator_id)
    if len(existing) >= MAX_FACE_IMAGES:
        raise ValidationAppError(
            f"You already have {MAX_FACE_IMAGES} reference photos, which is the most "
            "the video model accepts. Delete one before adding another."
        )

    storage = get_storage_provider(settings)
    suffix = "png" if mime == "image/png" else "jpg"
    storage_key = f"{creator_id}/face/{uuid.uuid4()}.{suffix}"
    # StorageProvider is a sync interface; keep the event loop free.
    await asyncio.to_thread(storage.save, storage_key, content)

    face = CreatorFaceImage(
        creator_id=creator_id,
        storage_key=storage_key,
        mime_type=mime,
        position=len(existing),
        width=width,
        height=height,
        file_size_bytes=len(content),
        recording_id=recording_id,
        angle=angle,
    )
    db.add(face)
    await db.commit()
    await db.refresh(face)
    return face


async def delete_all_faces(db: AsyncSession, settings: Settings, creator_id: str) -> None:
    """
    Clears the whole reference set, files included.

    Used when a capture replaces what came before. Unlike delete_face this
    removes the stored objects too - a replacement that left the old files
    behind would quietly accumulate every previous likeness on disk, and
    nothing would ever point at them again.
    """
    faces = await list_faces(db, creator_id)
    if not faces:
        return

    storage = get_storage_provider(settings)
    for face in faces:
        # Best effort per file. A storage object that has already gone is not
        # a reason to leave the rows behind and the set half-replaced.
        try:
            await asyncio.to_thread(storage.delete, face.storage_key)
        except Exception:
            pass
        await db.delete(face)
    await db.commit()


async def delete_face(db: AsyncSession, creator_id: str, face_id: uuid.UUID) -> None:
    result = await db.execute(
        select(CreatorFaceImage).where(
            CreatorFaceImage.id == face_id, CreatorFaceImage.creator_id == creator_id
        )
    )
    face = result.scalar_one_or_none()
    if face is None:
        raise NotFoundError("No such reference photo.")
    await db.delete(face)
    await db.commit()

    # Renumber so positions stay contiguous and position 0 remains the
    # primary reference the model leans on hardest.
    for index, remaining in enumerate(await list_faces(db, creator_id)):
        remaining.position = index
    await db.commit()


async def load_face_bytes(
    db: AsyncSession, settings: Settings, creator_id: str
) -> list[bytes]:
    """The creator's reference photos as raw bytes, best shot first."""
    faces = await list_faces(db, creator_id)
    if not faces:
        return []
    storage = get_storage_provider(settings)
    return [
        await asyncio.to_thread(storage.read, face.storage_key)
        for face in faces[:MAX_FACE_IMAGES]
    ]


async def grant_consent(db: AsyncSession, creator: Creator) -> Creator:
    creator.face_consent_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(creator)
    return creator


async def revoke_consent(db: AsyncSession, creator: Creator) -> Creator:
    """
    Withdrawing consent stops future generation immediately. It deliberately
    does not delete the photos — the creator may be pausing, not leaving, and
    deleting someone's uploads as a side effect of a toggle would be worse
    than keeping them. Deleting the photos is its own explicit action.
    """
    creator.face_consent_at = None
    await db.commit()
    await db.refresh(creator)
    return creator


def require_consent(creator: Creator) -> None:
    if creator.face_consent_at is None:
        raise ValidationAppError(
            "Before your face can appear in a video, you need to confirm you agree "
            "to your likeness being used to generate it."
        )
