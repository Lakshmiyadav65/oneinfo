"""
Turning one live capture into the creator's Veo reference set.

The browser runs the session: it tracks the face, confirms each angle only
once it has actually measured the turn, and grabs a frame at that instant.
What arrives here is the take plus three frames and the moments they came
from. None of it is trusted - the take is probed with ffprobe, the frames
with Pillow, and the angles are checked against the take's real duration.

Grabbing the frames in the browser rather than cutting them here is
deliberate. A WebM out of MediaRecorder has sparse keyframes, so seeking it
by timestamp lands near the moment rather than on it, and the whole point of
tracking the head was to catch an exact one. Re-extraction below does seek
the take, and accepts that imprecision, because the alternative is asking
someone to film themselves again.
"""

import asyncio
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.models.creator_face import CreatorFaceImage
from app.models.creator_recording import (
    ANGLES,
    MAX_RECORDING_SECONDS,
    MIN_RECORDING_SECONDS,
    CreatorRecording,
)
from app.providers.ffmpeg_runner import VideoInfo, probe_video_info, run_ffmpeg
from app.providers.storage import get_storage_provider
from app.services import creator_face_service
from app.services.creator_face_service import MIN_FACE_DIMENSION

# Extensions we are willing to store a take under, keyed by what ffprobe
# makes of it. The browser's Content-Type is not consulted.
_SUFFIX_BY_MIME = {"video/webm": "webm", "video/mp4": "mp4"}


@dataclass(frozen=True)
class ConfirmedAngle:
    angle: str
    offset_seconds: float
    yaw_degrees: float | None

    def as_json(self) -> dict[str, Any]:
        return {
            "angle": self.angle,
            "offset_seconds": self.offset_seconds,
            "yaw_degrees": self.yaw_degrees,
        }


def parse_angles(raw: Any, duration_seconds: float) -> list[ConfirmedAngle]:
    """
    The three confirmed angles, or a refusal saying which rule was broken.

    Pure, and deliberately strict. A capture that reports two angles, or
    reports them out of order, or points past the end of its own take, is a
    capture whose session went wrong somewhere - and a reference set built
    from it would be silently worse rather than visibly broken.
    """
    if not isinstance(raw, list):
        raise ValidationAppError("That capture didn't report which angles it confirmed.")
    if len(raw) != len(ANGLES):
        raise ValidationAppError(
            f"A capture has to confirm {len(ANGLES)} angles and this one reported "
            f"{len(raw)}. Record again and hold each turn until it locks."
        )

    parsed: list[ConfirmedAngle] = []
    for expected, entry in zip(ANGLES, raw, strict=True):
        if not isinstance(entry, dict):
            raise ValidationAppError("That capture's angles aren't in a readable shape.")
        if entry.get("angle") != expected:
            raise ValidationAppError(
                f"Expected the {expected} angle next and got "
                f"{entry.get('angle') or 'nothing'}. Record again."
            )
        try:
            offset = float(entry["offset_seconds"])
        except (KeyError, TypeError, ValueError):
            raise ValidationAppError(
                f"The {expected} angle didn't say when it was confirmed."
            ) from None
        # A hair past the end is the ordinary case, not a broken capture:
        # MediaRecorder's own clock and the container's reported duration
        # disagree by a frame or two on every take.
        if offset < 0 or offset > duration_seconds + 0.5:
            raise ValidationAppError(
                f"The {expected} angle points to {offset:.1f}s but the recording is "
                f"{duration_seconds:.1f}s long. Record again."
            )
        if parsed and offset <= parsed[-1].offset_seconds:
            raise ValidationAppError(
                "The angles aren't in the order they were recorded in. Record again."
            )

        yaw = entry.get("yaw_degrees")
        parsed.append(
            ConfirmedAngle(
                angle=expected,
                offset_seconds=min(offset, duration_seconds),
                yaw_degrees=float(yaw) if isinstance(yaw, int | float) else None,
            )
        )
    return parsed


def validate_take(info: VideoInfo) -> None:
    """What the recording itself has to be before anything is cut from it."""
    if not info.has_video:
        raise ValidationAppError("That file doesn't contain any video.")
    if info.duration_seconds < MIN_RECORDING_SECONDS:
        raise ValidationAppError(
            f"That recording is {info.duration_seconds:.1f}s long. A capture needs at "
            f"least {MIN_RECORDING_SECONDS:.0f}s to hold all three angles."
        )
    if info.duration_seconds > MAX_RECORDING_SECONDS:
        raise ValidationAppError(
            f"That recording is {info.duration_seconds:.0f}s long, and the limit is "
            f"{MAX_RECORDING_SECONDS:.0f}s. Record a shorter one."
        )
    if info.width and info.height and min(info.width, info.height) < MIN_FACE_DIMENSION:
        raise ValidationAppError(
            f"That recording is {info.width}x{info.height}. A capture needs at least "
            f"{MIN_FACE_DIMENSION}px on the shorter side for the face to be usable."
        )


async def get_recording(db: AsyncSession, creator_id: str) -> CreatorRecording | None:
    result = await db.execute(
        select(CreatorRecording)
        .where(CreatorRecording.creator_id == creator_id)
        .order_by(CreatorRecording.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _replace_face_set(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    recording: CreatorRecording,
    frames: list[bytes],
    angles: list[ConfirmedAngle],
) -> list[CreatorFaceImage]:
    """
    The three frames become the whole reference set, not an addition to it.

    Frames from one take share an outfit, a light and a background, which is
    the consistency appearance_description exists to defend. Leaving an older
    photo of a different shirt in the set would undo that, and the video
    model only accepts three images anyway.
    """
    # Probe every frame first. Replacing the set and then discovering the
    # third frame is unusable would leave the creator with nothing.
    for frame in frames:
        creator_face_service.validate_face_image(settings, frame)

    await creator_face_service.delete_all_faces(db, settings, creator_id)

    saved: list[CreatorFaceImage] = []
    for frame, angle in zip(frames, angles, strict=True):
        saved.append(
            await creator_face_service.add_face(
                db,
                settings,
                creator_id,
                frame,
                f"{angle.angle}.jpg",
                recording_id=recording.id,
                angle=angle.angle,
            )
        )
    return saved


async def save_capture(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    *,
    take_path: Path,
    mime_type: str,
    frames: list[bytes],
    raw_angles: Any,
) -> CreatorRecording:
    """
    Stores one capture and rebuilds the reference set from its frames.

    Everything is checked before anything is written or deleted, so a capture
    the server refuses leaves the creator exactly as they were.
    """
    if len(frames) != len(ANGLES):
        raise ValidationAppError(
            f"A capture has to send {len(ANGLES)} frames and this one sent {len(frames)}."
        )

    info = await probe_video_info(settings.ffprobe_path, str(take_path))
    validate_take(info)
    angles = parse_angles(raw_angles, info.duration_seconds)

    suffix = _SUFFIX_BY_MIME.get(mime_type, "webm")
    storage = get_storage_provider(settings)
    storage_key = f"{creator_id}/capture/{uuid.uuid4()}.{suffix}"
    content = take_path.read_bytes()
    await asyncio.to_thread(storage.save, storage_key, content)

    previous = await get_recording(db, creator_id)

    recording = CreatorRecording(
        creator_id=creator_id,
        storage_key=storage_key,
        mime_type=mime_type,
        duration_seconds=info.duration_seconds,
        width=info.width,
        height=info.height,
        file_size_bytes=len(content),
        angles=[angle.as_json() for angle in angles],
    )
    db.add(recording)
    await db.commit()
    await db.refresh(recording)

    await _replace_face_set(db, settings, creator_id, recording, frames, angles)

    # One capture per creator. Dropped only once the new one is stored and
    # its frames are in place, so a failure anywhere above leaves the old
    # take intact rather than losing both.
    if previous is not None:
        await _drop_recording(db, settings, previous)

    await db.refresh(recording)
    return recording


async def reextract(
    db: AsyncSession, settings: Settings, creator_id: str, raw_angles: Any = None
) -> CreatorRecording:
    """
    Re-cuts the reference set from the capture already on file.

    This is what keeping the take buys: a creator who doesn't like one of
    their frames can move where it was taken from without filming again.
    Unlike the live session, this has to seek the recording, and a WebM
    seeks to somewhere near the offset rather than exactly on it - so it
    decodes from the start of the request and picks the most representative
    frame of a short window rather than whatever lands first.
    """
    recording = await get_recording(db, creator_id)
    if recording is None:
        raise NotFoundError("You don't have a recording to re-cut.")

    duration = recording.duration_seconds or MAX_RECORDING_SECONDS
    angles = parse_angles(raw_angles if raw_angles is not None else recording.angles, duration)

    storage = get_storage_provider(settings)
    scratch: list[Path] = []
    try:
        source = Path(tempfile.gettempdir()) / f"oneinfo-capture-{uuid.uuid4()}.bin"
        source.write_bytes(await asyncio.to_thread(storage.read, recording.storage_key))
        scratch.append(source)

        frames = [
            await _cut_frame(settings, source, angle.offset_seconds, scratch)
            for angle in angles
        ]
        await _replace_face_set(db, settings, creator_id, recording, frames, angles)

        recording.angles = [angle.as_json() for angle in angles]
        await db.commit()
        await db.refresh(recording)
        return recording
    finally:
        for path in scratch:
            path.unlink(missing_ok=True)


async def _cut_frame(
    settings: Settings, source: Path, offset_seconds: float, scratch: list[Path]
) -> bytes:
    out = Path(tempfile.gettempdir()) / f"oneinfo-frame-{uuid.uuid4()}.jpg"
    scratch.append(out)
    await run_ffmpeg(
        settings.ffmpeg_path,
        [
            # -ss after -i: slower, because it decodes up to the offset, but
            # it lands on the requested moment instead of the nearest
            # keyframe, which on a MediaRecorder WebM can be seconds away.
            "-i", str(source),
            "-ss", f"{offset_seconds:.3f}",
            "-t", "0.6",
            # Pick the most representative frame of the window rather than
            # the first one, which on a turning head is often the blurred one.
            "-vf", "thumbnail=15",
            "-frames:v", "1",
            "-q:v", "2",
            str(out),
        ],
    )
    return out.read_bytes()


async def _drop_recording(
    db: AsyncSession, settings: Settings, recording: CreatorRecording
) -> None:
    storage = get_storage_provider(settings)
    try:
        await asyncio.to_thread(storage.delete, recording.storage_key)
    except Exception:
        # A missing object is not a reason to keep a row pointing at it.
        pass
    await db.delete(recording)
    await db.commit()


async def delete_recording(db: AsyncSession, settings: Settings, creator_id: str) -> None:
    """
    Deletes the capture and keeps the frames cut from it.

    The same reasoning as withdrawing consent: the creator is removing the
    most personal file they gave us, not asking for their avatar to stop
    working. The face images survive, with recording_id nulled by the
    foreign key.
    """
    recording = await get_recording(db, creator_id)
    if recording is None:
        raise NotFoundError("You don't have a recording to delete.")
    await _drop_recording(db, settings, recording)
