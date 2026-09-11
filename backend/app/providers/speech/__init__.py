from app.core.config import Settings
from app.providers.speech.base import (
    LANGUAGE_CODES,
    MAX_PACE,
    SpeechProvider,
    pace_to_fit,
)
from app.providers.speech.dev_provider import DevSpeechProvider
from app.providers.speech.sarvam_provider import SarvamSpeechProvider

__all__ = [
    "LANGUAGE_CODES",
    "MAX_PACE",
    "SpeechProvider",
    "get_speech_provider",
    "language_code_for",
    "pace_to_fit",
]


def get_speech_provider(settings: Settings) -> SpeechProvider:
    if settings.speech_provider == "sarvam":
        if not settings.sarvam_api_key:
            raise RuntimeError("SPEECH_PROVIDER=sarvam requires SARVAM_API_KEY.")
        return SarvamSpeechProvider(
            settings.sarvam_api_key,
            settings.sarvam_tts_model,
            settings.sarvam_speaker,
        )
    return DevSpeechProvider(settings)


def language_code_for(language: str) -> str:
    """
    What to call the project's language to a speech model.

    Falls back to Indian English rather than raising. A project in a
    language nobody has mapped yet should come out readable, not refuse to
    be voiced at all.
    """
    return LANGUAGE_CODES.get(language.strip().lower(), "en-IN")
