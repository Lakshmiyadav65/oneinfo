import asyncio
import tempfile
from pathlib import Path

import httpx

from app.core.errors import AppError
from app.providers.transcription.audio import chunk_audio
from app.providers.transcription.base import (
    ProgressCallback,
    Transcript,
    TranscriptLanguage,
    TranscriptSegment,
)

_ENDPOINT = "https://api.sarvam.ai/speech-to-text"

# Transient failures get three tries with a widening gap. A long video is a
# lot of requests, and losing the whole transcript to one 503 near the end
# would mean re-downloading and re-cutting everything to get back here.
_MAX_ATTEMPTS = 3


class SarvamTranscriptionError(AppError):
    code = "PROVIDER_TIMEOUT"
    status_code = 502


class SarvamTranscriptionProvider:
    """
    Sarvam's Indian-language speech to text.

    Chosen for the same reason as its voice: this content is Telugu and
    English in the same sentence, and a model trained mostly on English
    transcribes that by picking a side. Sarvam keeps each word in the script
    it was said in — provided the chunk it is given holds one utterance,
    which is what the cutting in audio.py is for.
    """

    def __init__(
        self,
        api_key: str,
        model: str,
        ffmpeg_path: str,
        ffprobe_path: str,
        *,
        min_chunk_seconds: float,
        max_chunk_seconds: float,
        silence_db: int,
        silence_min_seconds: float,
    ):
        self._api_key = api_key
        self._model = model
        self._ffmpeg_path = ffmpeg_path
        self._ffprobe_path = ffprobe_path
        self._min_chunk_seconds = min_chunk_seconds
        self._max_chunk_seconds = max_chunk_seconds
        self._silence_db = silence_db
        self._silence_min_seconds = silence_min_seconds

    async def transcribe(
        self,
        audio_path: Path,
        *,
        language: TranscriptLanguage,
        on_progress: ProgressCallback | None = None,
    ) -> Transcript:
        with tempfile.TemporaryDirectory(prefix="oneinfo-stt-") as tmp:
            chunks, boundaries = await chunk_audio(
                self._ffmpeg_path,
                self._ffprobe_path,
                audio_path,
                Path(tmp),
                min_seconds=self._min_chunk_seconds,
                max_seconds=self._max_chunk_seconds,
                silence_db=self._silence_db,
                silence_min_seconds=self._silence_min_seconds,
            )

            segments: list[TranscriptSegment] = []
            # One client for every chunk: a hundred requests down a fresh
            # connection each is a hundred TLS handshakes.
            async with httpx.AsyncClient(timeout=60.0) as client:
                for index, chunk in enumerate(chunks):
                    if on_progress:
                        on_progress(f"Transcribing part {index + 1} of {len(chunks)}")
                    result = await self._transcribe_chunk(client, chunk, language)
                    segments.append(
                        TranscriptSegment(
                            start=round(boundaries[index], 2),
                            end=round(boundaries[index + 1], 2),
                            language_code=result.get("language_code") or "unknown",
                            text=(result.get("transcript") or "").strip(),
                        )
                    )

        return Transcript(
            text="\n".join(segment.text for segment in segments if segment.text),
            language=_overall_language(segments),
            segments=segments,
        )

    async def _transcribe_chunk(
        self, client: httpx.AsyncClient, chunk: Path, language: TranscriptLanguage
    ) -> dict:
        data = {"model": self._model, "language_code": language.language_code}
        if language.mode:
            data["mode"] = language.mode

        last_error = "no response"
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                response = await client.post(
                    _ENDPOINT,
                    headers={"api-subscription-key": self._api_key},
                    data=data,
                    files={"file": (chunk.name, chunk.read_bytes(), "audio/wav")},
                )
            except httpx.HTTPError as exc:
                last_error = str(exc)
            else:
                if response.status_code == 200:
                    return response.json()
                # A rate limit or a server fault is worth waiting out. A 400
                # or a 401 is not - the model id or the key is wrong, and
                # trying twice more just delays saying so.
                if response.status_code != 429 and response.status_code < 500:
                    raise SarvamTranscriptionError(
                        _readable_error(response.status_code, response.text)
                    )
                last_error = f"HTTP {response.status_code}: {response.text[:200]}"

            if attempt < _MAX_ATTEMPTS:
                await asyncio.sleep(2**attempt)

        raise SarvamTranscriptionError(
            f"The transcription service did not answer after {_MAX_ATTEMPTS} tries: {last_error}"
        )


def _readable_error(status_code: int, body: str) -> str:
    if status_code in (401, 403):
        return "The transcription service rejected the API key."
    return f"The transcription service refused that audio ({status_code}): {body[:200]}"


def _overall_language(segments: list[TranscriptSegment]) -> str:
    """
    What language the video was in.

    "mixed" is a real answer here rather than a failure to decide - a reel
    that opens in Telugu and lands its call to action in English is the
    normal shape of this content, and flattening that to one code would
    misreport it.
    """
    distinct = sorted(
        {s.language_code for s in segments if s.language_code and s.language_code != "unknown"}
    )
    if len(distinct) == 1:
        return distinct[0]
    if distinct:
        return "mixed (" + ", ".join(distinct) + ")"
    return "unknown"
