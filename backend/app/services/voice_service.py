"""
Putting a real voice over Veo's picture.

Veo generates speech and lip motion together, and its speech is trained
overwhelmingly on English. A Telugu line comes back in an audibly synthetic
voice, mispronounced, because the dialogue reaches it romanised. This
replaces that audio with the line spoken properly.

What it does not do is move the lips. Veo animated them to its own speech,
so a new track leaves them out of step - fine for b-roll, wrong for a scene
with the creator's face in it. That is the lip-sync pass, and it is separate.
"""

import asyncio
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import NotFoundError, ValidationAppError
from app.models.asset import Asset, AssetType
from app.models.storyboard import StoryboardScene
from app.providers.ffmpeg_runner import probe_duration_seconds, run_ffmpeg
from app.providers.speech import (
    SpeechProvider,
    get_speech_provider,
    language_code_for,
    pace_to_fit,
)
from app.providers.storage import get_storage_provider
from app.services import generation_service, project_service


@dataclass
class VoicedClip:
    path: Path
    clip_seconds: float
    spoken_seconds: float
    pace: float
    # True when the line still runs past the clip at the fastest pace we are
    # willing to speak at, so the muxed file cuts its last words off. The
    # caller is expected to say which scene and let the creator shorten the
    # line, which is the only fix that does not make something worse.
    overruns: bool

    @property
    def overrun_seconds(self) -> float:
        return max(0.0, self.spoken_seconds - self.clip_seconds)


async def _say(
    settings: Settings,
    provider: SpeechProvider,
    text: str,
    language_code: str,
    pace: float,
    scratch: list[Path],
) -> tuple[Path, float]:
    audio = await provider.synthesize(text, language_code=language_code, pace=pace)
    path = Path(tempfile.gettempdir()) / f"oneinfo-voice-{uuid.uuid4()}.wav"
    path.write_bytes(audio)
    scratch.append(path)
    return path, await probe_duration_seconds(settings.ffprobe_path, str(path))


async def voice_over_clip(
    settings: Settings,
    provider: SpeechProvider,
    *,
    dialogue: str,
    language_code: str,
    clip_path: Path,
    scratch: list[Path],
) -> VoicedClip:
    """
    The clip with its dialogue spoken over it, in place of Veo's audio.

    Said twice at most. The first reading is at the speaker's natural rate,
    which is the only way to find out how long the line actually takes; if
    that overshoots the clip, it is said again a little quicker. Asking the
    model to speak faster beats stretching the waveform afterwards, which is
    what makes a voice sound processed.
    """
    clip_seconds = await probe_duration_seconds(settings.ffprobe_path, str(clip_path))

    audio_path, spoken = await _say(
        settings, provider, dialogue, language_code, 1.0, scratch
    )
    pace = pace_to_fit(spoken, clip_seconds)
    if pace != 1.0:
        audio_path, spoken = await _say(
            settings, provider, dialogue, language_code, pace, scratch
        )

    out = Path(tempfile.gettempdir()) / f"oneinfo-voiced-{uuid.uuid4()}.mp4"
    scratch.append(out)
    await run_ffmpeg(
        settings.ffmpeg_path,
        [
            "-i", str(clip_path),
            "-i", str(audio_path),
            # Veo's audio is dropped rather than mixed under. It is the
            # thing being replaced, and two voices saying the same line a
            # beat apart is worse than either on its own.
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-ar", "44100",
            "-ac", "2",
            # apad with -shortest: a line shorter than its scene is followed
            # by silence to the end of the picture, rather than -shortest
            # cutting the picture down to the length of the line.
            "-af", "apad",
            "-shortest",
            str(out),
        ],
    )

    return VoicedClip(
        path=out,
        clip_seconds=clip_seconds,
        spoken_seconds=spoken,
        pace=pace,
        # Half a second of grace. Speech probes a touch long on the trailing
        # silence in a WAV, and reporting every scene as overrunning would
        # train the creator to ignore the warning that matters.
        overruns=spoken > clip_seconds + 0.5,
    )


async def voice_scene(
    db: AsyncSession,
    settings: Settings,
    creator_id: str,
    project_id: uuid.UUID,
    scene_id: uuid.UUID,
) -> VoicedClip:
    """
    Speaks one scene's line over the clip it already has.

    Calls the video provider zero times, so it costs nothing beyond the
    speech itself. That is the point: the picture was paid for once, and
    trying a different voice, speaker or wording must never mean paying Veo
    again to find out how it sounds.
    """
    project = await project_service.get_owned_project(db, creator_id, project_id)

    scene = await db.get(StoryboardScene, scene_id)
    if scene is None or scene.creator_id != creator_id:
        raise NotFoundError("No such scene in this storyboard.")
    if not scene.voiceover.strip():
        raise ValidationAppError("This scene has no dialogue to speak.")

    # The raw Veo clip, never a previously voiced one: voicing a voiced clip
    # would layer one reading over another.
    source = await generation_service.get_scene_asset(
        db, creator_id, project_id, scene_id, scene.selected_take
    )

    storage = get_storage_provider(settings)
    scratch: list[Path] = []
    try:
        clip_bytes = await asyncio.to_thread(storage.read, source.storage_key)
        clip_path = Path(tempfile.gettempdir()) / f"oneinfo-clip-{uuid.uuid4()}.mp4"
        clip_path.write_bytes(clip_bytes)
        scratch.append(clip_path)

        result = await voice_over_clip(
            settings,
            get_speech_provider(settings),
            dialogue=scene.voiceover,
            language_code=language_code_for(project.language),
            clip_path=clip_path,
            scratch=scratch,
        )

        voiced_bytes = result.path.read_bytes()
        storage_key = (
            f"{creator_id}/{project_id}/scenes/"
            f"{scene_id}-take{source.take_index}-voiced.mp4"
        )
        await asyncio.to_thread(storage.save, storage_key, voiced_bytes)

        # One voiced clip per take, replaced in place. Keeping every attempt
        # would fill the media library with readings of the same line, and
        # the comparison worth having is between Veo's picture and its
        # replacement, not between takes of a voice that costs nothing to
        # redo.
        existing = await db.execute(
            select(Asset).where(
                Asset.scene_id == scene_id,
                Asset.asset_type == AssetType.scene_voiced_video,
                Asset.take_index == source.take_index,
            )
        )
        asset = existing.scalar_one_or_none()
        if asset is None:
            asset = Asset(
                creator_id=creator_id,
                project_id=project_id,
                scene_id=scene_id,
                asset_type=AssetType.scene_voiced_video,
                take_index=source.take_index,
            )
            db.add(asset)
        asset.storage_key = storage_key
        asset.mime_type = "video/mp4"
        asset.duration_seconds = result.clip_seconds
        await db.commit()

        return result
    finally:
        for path in scratch:
            path.unlink(missing_ok=True)
