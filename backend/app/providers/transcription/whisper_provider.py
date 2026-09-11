import asyncio
from pathlib import Path

from app.core.errors import AppError
from app.providers.transcription.base import (
    ProgressCallback,
    Transcript,
    TranscriptLanguage,
    TranscriptSegment,
)

# Loading a model costs seconds and hundreds of megabytes, and a creator
# adding six reels would otherwise pay that six times. Keyed by size, since
# nothing stops two settings pointing at different ones.
_MODELS: dict[str, object] = {}
_LOAD_LOCK = asyncio.Lock()


class WhisperUnavailableError(AppError):
    code = "VALIDATION_ERROR"
    status_code = 422


class WhisperTranscriptionProvider:
    """
    Transcription on this machine, with no API key and no network call.

    Kept from the prototype because it answers a question Sarvam cannot: what
    happens when there is no key, no credit, or no connection. It is slower
    and it cannot transliterate, but it is free and it is private — the audio
    never leaves the server, which for someone's unpublished drafts is not a
    small thing.

    English only, and that is measured rather than assumed. Asked for Telugu
    on a real reel this model returns fluent-looking Telugu script that is
    not words - and asked to translate the same audio it returns a genuinely
    usable English rendering of it. So English is offered and the other two
    are refused.

    Refused rather than returned with a warning, because of where the output
    goes. The prototype printed to a terminal for a person to eyeball, and
    obvious nonsense there is harmless. Here it would be chunked, embedded
    and retrieved months later as something the creator supposedly said, and
    the first anyone would know is a script built on it.
    """

    def __init__(self, model_size: str, compute_type: str = "int8"):
        self._model_size = model_size
        self._compute_type = compute_type

    async def _model(self) -> object:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise WhisperUnavailableError(
                "The local transcription engine is not installed. Run "
                "`pip install -e .[whisper]` in backend/, or set "
                "TRANSCRIPTION_PROVIDER=sarvam to use the API instead."
            ) from exc

        # The lock, not just the dict check: two reels queued together would
        # otherwise both miss the cache and load the model twice, which is
        # the one thing this cache exists to prevent.
        async with _LOAD_LOCK:
            if self._model_size not in _MODELS:
                _MODELS[self._model_size] = await asyncio.to_thread(
                    WhisperModel, self._model_size, device="cpu", compute_type=self._compute_type
                )
        return _MODELS[self._model_size]

    async def transcribe(
        self,
        audio_path: Path,
        *,
        language: TranscriptLanguage,
        on_progress: ProgressCallback | None = None,
    ) -> Transcript:
        if language.key != "english":
            raise WhisperUnavailableError(
                f"The local engine cannot produce {language.key} — it only "
                "reliably renders speech into English. Choose English, or set "
                "TRANSCRIPTION_PROVIDER=sarvam with an API key for Telugu and "
                "Tenglish."
            )

        if on_progress:
            on_progress(f"Loading the local model ({self._model_size})")
        model = await self._model()

        # Unlike the real-time API this has no length limit, so the audio
        # goes in whole and the silence-cutting in audio.py is skipped
        # entirely. Nothing is lost by that: the cutting exists to keep each
        # request short and each request in one language, and neither
        # constraint applies here.
        if on_progress:
            on_progress("Transcribing locally — this is slower than the API")

        def _run() -> tuple[list[TranscriptSegment], str]:
            segments, info = model.transcribe(  # type: ignore[attr-defined]
                str(audio_path),
                # The only task this engine is offered for, and the one it is
                # actually good at: whatever was spoken, rendered in English.
                task="translate",
                # Skips the silence rather than hallucinating words into it,
                # which this model will otherwise do over background music.
                vad_filter=True,
            )
            collected = [
                TranscriptSegment(
                    start=round(segment.start, 2),
                    end=round(segment.end, 2),
                    language_code=info.language or "unknown",
                    text=segment.text.strip(),
                )
                for segment in segments
            ]
            return collected, info.language or "unknown"

        collected, detected = await asyncio.to_thread(_run)

        return Transcript(
            text="\n".join(segment.text for segment in collected if segment.text),
            language=detected,
            segments=collected,
        )
