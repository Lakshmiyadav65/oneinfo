import tempfile
import uuid
from pathlib import Path

from app.core.config import Settings
from app.providers.ffmpeg_runner import run_ffmpeg
from app.providers.speech.base import speech_seconds

# Even an empty line has to produce a file ffmpeg will accept.
MIN_SECONDS = 0.4


# Quiet enough not to be mistaken for a finished soundtrack, loud enough to
# be unmistakably present. Peaks near -22 dBFS.
TONE_HZ = 330
TONE_GAIN = 0.8


class DevSpeechProvider:
    """
    Produces a real, playable WAV of about the length the line would take to
    say, instead of calling Sarvam.

    A quiet tone, not silence. This used to emit digital silence, on the
    reasoning that a developer who heard a beep might think the voice pass
    had worked. It went the other way in practice: the silence was muxed
    over Veo's picture, replacing Veo's real audio, and preferred over the
    raw clip when the video was stitched - so whole exports shipped mute
    with nothing anywhere saying why.

    A beep is never mistaken for a person reading a line. Silence is
    indistinguishable from a broken audio pipeline, and that ambiguity is
    what cost a finished video. Now silence means exactly one thing: the
    speech provider failed.
    """

    def __init__(self, settings: Settings):
        self._settings = settings

    async def synthesize(self, text: str, *, language_code: str, pace: float) -> bytes:
        # The same estimate the storyboard plans scene lengths with, so the
        # placeholder exercises the real fitting rather than a second guess.
        seconds = max(MIN_SECONDS, speech_seconds(text) / max(pace, 0.1))

        out = Path(tempfile.gettempdir()) / f"oneinfo-speech-{uuid.uuid4()}.wav"
        try:
            await run_ffmpeg(
                self._settings.ffmpeg_path,
                [
                    "-f", "lavfi",
                    "-i", f"sine=frequency={TONE_HZ}:sample_rate=24000",
                    "-t", f"{seconds:.3f}",
                    "-af", f"volume={TONE_GAIN}",
                    "-c:a", "pcm_s16le",
                    str(out),
                ],
            )
            return out.read_bytes()
        finally:
            out.unlink(missing_ok=True)
