"""
Saying a scene's line in a voice built for the language.

Veo speaks its own dialogue, and for Telugu it speaks it badly: audibly
synthetic, and mispronounced because the line reaches it romanised. Sarvam
says it properly and the pipeline puts that over Veo's picture. What is
pinned here is the fitting - how a line is made to land inside a clip Veo
will only ever generate at 4, 6 or 8 seconds.
"""

import pytest

from app.core.config import Settings
from app.providers.speech import (
    MAX_PACE,
    get_speech_provider,
    language_code_for,
    pace_to_fit,
)
from app.providers.speech.dev_provider import DevSpeechProvider


def test_a_line_that_already_fits_is_spoken_at_its_normal_rate():
    """Slowing someone down to fill the clip does not read as unhurried.
    The spare time at the end is better left silent."""
    assert pace_to_fit(spoken_seconds=5.0, clip_seconds=8.0) == 1.0
    assert pace_to_fit(spoken_seconds=8.0, clip_seconds=8.0) == 1.0


def test_a_line_slightly_over_is_spoken_slightly_quicker():
    assert pace_to_fit(spoken_seconds=8.4, clip_seconds=8.0) == pytest.approx(1.05)


def test_a_line_far_too_long_is_capped_rather_than_gabbled():
    """It comes back overrunning, which the caller reports. Shortening the
    sentence is the creator's call and the only fix that helps."""
    assert pace_to_fit(spoken_seconds=20.0, clip_seconds=6.0) == MAX_PACE


def test_a_scene_with_no_dialogue_or_no_length_asks_for_nothing_unusual():
    assert pace_to_fit(spoken_seconds=0.0, clip_seconds=8.0) == 1.0
    assert pace_to_fit(spoken_seconds=5.0, clip_seconds=0.0) == 1.0


def test_tenglish_is_spoken_as_telugu():
    """The English words inside the line are the ones a Hyderabad speaker
    would use in an otherwise Telugu sentence. A Telugu voice reads them the
    way that speaker would; an English voice reads the Telugu wrongly."""
    assert language_code_for("tenglish") == "te-IN"
    assert language_code_for("telugu") == "te-IN"
    assert language_code_for("english") == "en-IN"


def test_an_unmapped_language_is_read_rather_than_refused():
    assert language_code_for("kannada") == "en-IN"


def test_speech_factory_requires_a_key_for_sarvam():
    with pytest.raises(RuntimeError):
        get_speech_provider(Settings(speech_provider="sarvam", sarvam_api_key=None))


def test_speech_factory_returns_the_dev_provider_by_default():
    assert isinstance(get_speech_provider(Settings()), DevSpeechProvider)
