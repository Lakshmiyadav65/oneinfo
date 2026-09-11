from pathlib import Path

from app.providers.ffmpeg_runner import probe_duration_seconds
from app.providers.transcription.base import (
    ProgressCallback,
    Transcript,
    TranscriptLanguage,
    TranscriptSegment,
)

# How long a placeholder segment stands for. Nothing rides on the number; it
# exists so a three-minute video produces several segments rather than one,
# and the chunking and embedding downstream get exercised the way a real
# transcript would exercise them.
_SEGMENT_SECONDS = 20.0


class DevTranscriptionProvider:
    """
    Produces a marked placeholder transcript instead of calling Sarvam.

    Marked, and obviously so. A dev transcript that read like real speech
    would be embedded, retrieved, and written into a script, and the first
    anyone would know of it is a video confidently telling viewers something
    no one ever said.
    """

    def __init__(self, ffprobe_path: str):
        self._ffprobe_path = ffprobe_path

    async def transcribe(
        self,
        audio_path: Path,
        *,
        language: TranscriptLanguage,
        on_progress: ProgressCallback | None = None,
    ) -> Transcript:
        duration = await probe_duration_seconds(self._ffprobe_path, str(audio_path))
        count = max(1, int(duration // _SEGMENT_SECONDS) + 1)

        segments: list[TranscriptSegment] = []
        for index in range(count):
            if on_progress:
                on_progress(f"Transcribing part {index + 1} of {count}")
            start = index * _SEGMENT_SECONDS
            segments.append(
                TranscriptSegment(
                    start=round(start, 2),
                    end=round(min(start + _SEGMENT_SECONDS, duration), 2),
                    language_code="unknown",
                    text=(
                        f"[DEV MODE] Placeholder transcript, part {index + 1} of {count}, "
                        f"in {language.key}. Set TRANSCRIPTION_PROVIDER=sarvam "
                        f"with a SARVAM_API_KEY to transcribe what was actually said."
                    ),
                )
            )

        return Transcript(
            text="\n".join(segment.text for segment in segments),
            language="unknown",
            segments=segments,
        )
