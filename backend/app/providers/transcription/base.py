"""
Turning a video a creator already made into text they can build on.

The mirror image of providers/speech: that one gives a written line a voice,
this one gives a spoken line words. It exists for the creator who has no
chat history to paste but has been posting reels for a year — what they said
in those is a better record of how they talk than anything they could write
down about themselves now.
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class TranscriptLanguage:
    """
    A project language, and what to ask the transcriber for to get it.

    Deliberately keyed on the same three languages the rest of the app uses
    rather than on a vocabulary of its own. A creator choosing how their reel
    gets written down is making the same choice they make in Create Video,
    and asking it twice in two different sets of words would suggest the two
    are unrelated — while the whole point is that this transcript becomes
    what the script agents write from.

    No label or hint here: those live in the frontend's PROJECT_LANGUAGES,
    already the one place the app names these languages to a creator.
    """

    key: str
    # What Sarvam is asked for. `unknown` lets it detect per chunk, which is
    # what makes Tenglish work: the speech switches language mid-sentence and
    # the transliteration follows it.
    mode: str
    language_code: str


TRANSCRIPT_LANGUAGES: dict[str, TranscriptLanguage] = {
    # Translate, not transcribe. Asked to transcribe as en-IN, the model
    # ignores the code and returns Telugu speech in Telugu script anyway —
    # so a creator picking English got a Telugu document. A creator picking
    # English wants to read English, whatever the reel was spoken in, and
    # translate is the mode that actually honours that.
    "english": TranscriptLanguage(key="english", mode="translate", language_code="unknown"),
    # Tenglish is spoken Telugu written in Latin script — the app's own
    # definition, in models/tanglish.py and every agent prompt. That is
    # exactly what Sarvam's translit mode produces.
    "tenglish": TranscriptLanguage(key="tenglish", mode="translit", language_code="unknown"),
    "telugu": TranscriptLanguage(key="telugu", mode="transcribe", language_code="te-IN"),
}

# What a reel is transcribed as when nobody has said. Speech, romanised, is
# the most useful default for this content: an English reel comes back
# unchanged, and a Telugu one comes back readable to anyone.
DEFAULT_TRANSCRIPT_LANGUAGE = "tenglish"


def transcript_language_for(key: str | None) -> TranscriptLanguage:
    """
    Falls back rather than raising. A language nobody has mapped yet should
    transcribe as spoken, not refuse to transcribe at all.
    """
    return TRANSCRIPT_LANGUAGES.get(
        (key or "").strip().lower(), TRANSCRIPT_LANGUAGES[DEFAULT_TRANSCRIPT_LANGUAGE]
    )


@dataclass(frozen=True)
class TranscriptSegment:
    """One chunk of audio and what was said in it."""

    start: float
    end: float
    language_code: str
    text: str


@dataclass(frozen=True)
class Transcript:
    text: str
    # "te-IN", or "mixed (en-IN, te-IN)" when the chunks disagreed — which
    # for this content is the normal answer, not a problem.
    language: str
    segments: list[TranscriptSegment]


# Called with a line of progress per chunk. A twelve-minute video is a
# hundred requests, and a creator watching a spinner deserves to know which
# one it is on.
ProgressCallback = Callable[[str], None]


class TranscriptionProvider(Protocol):
    async def transcribe(
        self,
        audio_path: Path,
        *,
        language: TranscriptLanguage,
        on_progress: ProgressCallback | None = None,
    ) -> Transcript:
        """The spoken audio as text."""
        ...
