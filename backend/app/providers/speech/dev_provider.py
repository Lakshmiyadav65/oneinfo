import tempfile
import uuid
from pathlib import Path

from app.core.config import Settings
from app.providers.ffmpeg_runner import run_ffmpeg

# Roughly how fast a person reads a line out loud, in words per second, at
# pace 1.0. Only used to give the placeholder a believable length: the point
# of the dev provider is to exercise the fitting and muxing without a key,
# and a track of the wrong length would exercise neither.
WORDS_PER_SECOND = 2.6

# Even an empty line has to produce a file ffmpeg will accept.
MIN_SECONDS = 0.4


class DevSpeechProvider:
    """
    Produces a real, playable silent WAV of about the length the line would
    take to say, instead of calling Sarvam.

    Silent rather than a tone. A placeholder voice that made noise would be
    mixed over the picture and played back, and a developer checking whether
    the voice pass worked would hear a beep and think it had.
    """

    def __init__(self, settings: Settings):
        self._settings = settings

    async def synthesize(self, text: str, *, language_code: str, pace: float) -> bytes:
        words = len([word for word in text.split() if word.strip()])
        seconds = max(MIN_SECONDS, words / WORDS_PER_SECOND / max(pace, 0.1))

        out = Path(tempfile.gettempdir()) / f"oneinfo-speech-{uuid.uuid4()}.wav"
        try:
            await run_ffmpeg(
                self._settings.ffmpeg_path,
                [
                    "-f", "lavfi",
                    "-i", "anullsrc=channel_layout=mono:sample_rate=24000",
                    "-t", f"{seconds:.3f}",
                    "-c:a", "pcm_s16le",
                    str(out),
                ],
            )
            return out.read_bytes()
        finally:
            out.unlink(missing_ok=True)
