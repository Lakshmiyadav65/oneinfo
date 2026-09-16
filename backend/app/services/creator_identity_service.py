"""
Who the creator looks and sounds like, in words the video model can use.

Veo only sees the creator's face on the scenes it is handed their reference
photo for. Every other scene is generated from text alone, and a clip told
"one narrator, the same gender in every clip" with no narrator named has
nothing to be consistent with - it has no memory of the clip before. A demo
video came back with the creator's own female voice on the two on-camera
clips and a man narrating the three b-roll clips after them, because the
voice description was empty and nothing had ever filled it in.

So when the creator has a reference photo and has not described themselves,
the photo is described once, here, and stored. They can still rewrite either
description; anything they wrote is never replaced.
"""

import asyncio
import logging
from enum import StrEnum

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.creator import Creator
from app.providers.llm.gemini_provider import GeminiLLMProvider
from app.providers.storage import get_storage_provider
from app.services import creator_face_service

logger = logging.getLogger(__name__)


class NarratorGender(StrEnum):
    female = "female"
    male = "male"
    unclear = "unclear"


class CreatorDescription(BaseModel):
    appearance: str
    voice: str
    gender: NarratorGender


# The speech voice used when the creator has not picked one. The deployment
# default is a male voice, which would put the same wrong voice back over a
# woman's video by a different route.
_DEFAULT_SPEAKER = {NarratorGender.female: "kavya", NarratorGender.male: "shubh"}

_PROMPT = (
    "This is a reference photo of a video creator who presents their own "
    "short-form videos. A video model will generate clips of them from text, "
    "so describe them in words that keep every clip consistent.\n"
    "appearance: one sentence, starting 'A', covering apparent gender, "
    "approximate age, hair, and clothing as seen in the photo. No names, no "
    "guesses about ethnicity, no judgements about attractiveness.\n"
    "voice: one sentence describing the speaking voice that matches this "
    "person, starting with their apparent gender and age, e.g. 'A woman in "
    "her mid-twenties with a warm, clear, medium-pitched voice'.\n"
    "gender: female, male, or unclear."
)


async def ensure_descriptions(
    db: AsyncSession, settings: Settings, creator: Creator
) -> None:
    """
    Fills in whichever of the two descriptions is empty, from the primary
    reference photo.

    Best effort. Failing to describe a photo must not stop a storyboard or a
    paid run that would otherwise go ahead; it leaves the prompt no worse
    than it was, and the next call tries again.
    """
    if creator.appearance_description and creator.voice_description:
        return
    if settings.llm_provider != "gemini" or not settings.gemini_api_key:
        return
    faces = await creator_face_service.list_faces(db, creator.id)
    if not faces:
        return

    try:
        storage = get_storage_provider(settings)
        photo = await asyncio.to_thread(storage.read, faces[0].storage_key)
        llm = GeminiLLMProvider(settings.gemini_api_key, settings.gemini_model)
        described = await llm.generate_structured(
            _PROMPT, CreatorDescription, images=[(photo, faces[0].mime_type)]
        )
    except Exception:
        logger.exception("Could not describe creator %s from their photo", creator.id)
        return

    assert isinstance(described, CreatorDescription)
    if not creator.appearance_description and described.appearance.strip():
        creator.appearance_description = described.appearance.strip()
    if not creator.voice_description and described.voice.strip():
        creator.voice_description = described.voice.strip()
    if not creator.speech_speaker and described.gender in _DEFAULT_SPEAKER:
        creator.speech_speaker = _DEFAULT_SPEAKER[described.gender]
    await db.commit()
