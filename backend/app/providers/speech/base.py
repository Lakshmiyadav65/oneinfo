"""
Turning a scene's dialogue into a voice.

Veo speaks its own lines, and for Telugu it speaks them badly: the voice is
audibly synthetic and the pronunciation drifts, because its speech is
trained overwhelmingly on English and the dialogue reaches it romanised.
A provider here produces the line properly, in a voice built for the
language, and the pipeline puts that over Veo's picture.
"""

from typing import Protocol

# Sarvam accepts 0.5 to 2.0. This is far tighter on purpose. Past roughly a
# sixth faster the delivery stops sounding like a person talking and starts
# sounding like a recording played at the wrong speed, which is the exact
# complaint this whole path exists to fix.
MAX_PACE = 1.18

# What each project language is called to a speech model. Tenglish is Telugu
# as far as the voice is concerned: the English words inside the line are
# the ones an actual Hyderabad speaker would use in an otherwise Telugu
# sentence, and a Telugu voice reads them the way that speaker would.
LANGUAGE_CODES = {
    "english": "en-IN",
    "telugu": "te-IN",
    "tenglish": "te-IN",
}


# Roughly how fast a line is read out loud at pace 1.0. Words rather than
# characters because Tenglish is romanised Telugu - the words run long in
# letters without taking any longer to say, so counting characters
# systematically overestimates exactly the language this app is mostly used in.
WORDS_PER_SECOND = 2.6


def speech_seconds(text: str) -> float:
    """
    How long a line takes to say, near enough to plan a scene around.

    An estimate, and deliberately a cheap one: the alternative is
    synthesising the line to find out, which costs a paid call per scene
    during storyboarding - before the creator has agreed to any of it.
    Anything downstream that needs the real number measures the audio.
    """
    return len([word for word in text.split() if word.strip()]) / WORDS_PER_SECOND


class SpeechProvider(Protocol):
    async def synthesize(self, text: str, *, language_code: str, pace: float) -> bytes:
        """The line spoken, as WAV bytes."""
        ...


def pace_to_fit(spoken_seconds: float, clip_seconds: float) -> float:
    """
    How much faster or slower to speak so the line lands inside its clip.

    Asked of the speech model rather than done to the finished audio.
    Stretching a waveform afterwards is what makes a voice sound processed;
    a model told to speak a little quicker just speaks a little quicker.

    Only ever speeds up. A line that already fits is spoken at its normal
    rate and the spare time at the end is left silent: slowing someone down
    to fill eight seconds does not read as unhurried, it reads as a drawl.

    Capped, so a line far too long for its scene comes back too long rather
    than gabbled. The caller is expected to say so - shortening the sentence
    is the creator's decision, and it is the right fix.
    """
    if spoken_seconds <= 0 or clip_seconds <= 0:
        return 1.0
    if spoken_seconds <= clip_seconds:
        return 1.0
    return min(MAX_PACE, spoken_seconds / clip_seconds)


# The voices bulbul:v3 will speak in, exactly as the API lists them.
#
# Not a guess and not copied from documentation: asked for a speaker it does
# not have, Sarvam answers "Available speakers for bulbul:v3 are: ..." and
# this is that answer. Sent back to the creator so they can choose one and
# hear it, rather than having a single voice set once in an environment
# variable for everybody on the deployment.
#
# No gender labels. Which of these sounds right is a judgement about a voice,
# and the honest way to make it is to listen - which is why the choice ships
# with a preview rather than with adjectives.
SARVAM_SPEAKERS: tuple[str, ...] = (
    "aditya", "ritu", "ashutosh", "priya", "neha", "rahul", "pooja", "rohan",
    "simran", "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun",
    "manan", "sumit", "roopa", "kabir", "aayan", "shubh", "advait", "anand",
    "tanya", "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani",
    "mohit", "kavitha", "rehan", "soham", "rupali",
)
