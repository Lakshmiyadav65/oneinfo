from app.core.config import Settings
from app.providers.transcription.base import (
    DEFAULT_TRANSCRIPT_LANGUAGE,
    TRANSCRIPT_LANGUAGES,
    ProgressCallback,
    Transcript,
    TranscriptionProvider,
    TranscriptLanguage,
    TranscriptSegment,
    transcript_language_for,
)
from app.providers.transcription.dev_provider import DevTranscriptionProvider
from app.providers.transcription.sarvam_provider import SarvamTranscriptionProvider
from app.providers.transcription.whisper_provider import WhisperTranscriptionProvider

__all__ = [
    "DEFAULT_TRANSCRIPT_LANGUAGE",
    "TRANSCRIPT_LANGUAGES",
    "ProgressCallback",
    "Transcript",
    "TranscriptLanguage",
    "TranscriptSegment",
    "TranscriptionProvider",
    "get_transcription_provider",
    "transcript_language_for",
]


def get_transcription_provider(settings: Settings) -> TranscriptionProvider:
    if settings.transcription_provider == "sarvam":
        if not settings.sarvam_api_key:
            raise RuntimeError("TRANSCRIPTION_PROVIDER=sarvam requires SARVAM_API_KEY.")
        return SarvamTranscriptionProvider(
            settings.sarvam_api_key,
            settings.sarvam_stt_model,
            settings.ffmpeg_path,
            settings.ffprobe_path,
            min_chunk_seconds=settings.transcription_min_chunk_seconds,
            max_chunk_seconds=settings.transcription_max_chunk_seconds,
            silence_db=settings.transcription_silence_db,
            silence_min_seconds=settings.transcription_silence_min_seconds,
        )
    if settings.transcription_provider == "whisper":
        return WhisperTranscriptionProvider(settings.whisper_model)
    return DevTranscriptionProvider(settings.ffprobe_path)
