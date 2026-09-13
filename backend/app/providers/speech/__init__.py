from app.core.config import Settings
from app.providers.speech.base import (
    LANGUAGE_CODES,
    MAX_PACE,
    SARVAM_SPEAKERS,
    WORDS_PER_SECOND,
    SpeechProvider,
    pace_to_fit,
    speech_seconds,
)
from app.providers.speech.dev_provider import DevSpeechProvider
from app.providers.speech.sarvam_provider import SarvamSpeechProvider

__all__ = [
    "LANGUAGE_CODES",
    "MAX_PACE",
    "SARVAM_SPEAKERS",
    "WORDS_PER_SECOND",
    "SpeechProvider",
    "get_speech_provider",
    "language_code_for",
    "pace_to_fit",
    "speech_seconds",
]


def get_speech_provider(
    settings: Settings, speaker: str | None = None
) -> SpeechProvider:
    """
    The voice this creator's lines are spoken in.

    `speaker` is the creator's own choice. It used to come from one
    environment variable shared by everybody on the deployment, set once to
    a male voice and changeable only by editing a file on the server - so a
    creator who wanted a different voice had no way to say so.
    """
    if settings.speech_mode == "sarvam":
        if not settings.sarvam_api_key:
            raise RuntimeError("SPEECH_PROVIDER=sarvam requires SARVAM_API_KEY.")
        return SarvamSpeechProvider(
            settings.sarvam_api_key,
            settings.sarvam_tts_model,
            speaker or settings.sarvam_speaker,
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
