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


def test_with_no_key_anywhere_the_placeholder_is_what_is_left():
    assert isinstance(
        get_speech_provider(Settings(speech_provider=None, sarvam_api_key=None)),
        DevSpeechProvider,
    )


def test_a_configured_key_is_taken_to_mean_the_key_should_be_used():
    """
    The bug this pins: SPEECH_PROVIDER was simply never written down, so it
    defaulted to "dev" while SARVAM_API_KEY sat right above it. Every scene
    was voiced with the placeholder, that audio replaced Veo's, and the
    finished video exported silent. Nobody chooses that by leaving a line
    out of a config file.
    """
    # speech_provider=None is "not written down anywhere", which is the state
    # the bug needed. Spelled out because conftest pins SPEECH_PROVIDER=dev to
    # keep the suite offline, and that would otherwise answer the question.
    unset = Settings(speech_provider=None, sarvam_api_key="a-key")

    assert unset.speech_mode == "sarvam"
    assert not isinstance(get_speech_provider(unset), DevSpeechProvider)


def test_the_placeholder_stays_forceable_with_a_key_present():
    """Resolving from the key is a default, not a policy. Someone working
    offline with a key in their .env still gets to skip the paid call."""
    assert Settings(speech_provider="dev", sarvam_api_key="a-key").speech_mode == "dev"


async def test_the_placeholder_voice_is_audible(requires_ffmpeg):
    """
    It used to be digital silence, which is indistinguishable from a broken
    audio pipeline - and that ambiguity is exactly what shipped a mute
    export. Silence now means one thing only: the speech provider failed.
    """
    import tempfile
    from pathlib import Path

    from app.providers.ffmpeg_runner import peak_level_db
    from app.services.voice_service import SILENCE_CEILING_DBFS

    settings = Settings()
    audio = await DevSpeechProvider(settings).synthesize(
        "Ee roadmap kavali ante comment cheyyandi.", language_code="te-IN", pace=1.0
    )
    path = Path(tempfile.gettempdir()) / "oneinfo-test-placeholder.wav"
    path.write_bytes(audio)
    try:
        assert await peak_level_db(settings.ffmpeg_path, str(path)) > SILENCE_CEILING_DBFS
    finally:
        path.unlink(missing_ok=True)


async def test_a_provider_that_returns_silence_is_refused(requires_ffmpeg, tmp_path):
    """
    The invariant the whole failure turned on. Voicing maps Veo's audio away
    and replaces it, so a silent track does not fail anything - it produces a
    valid, correctly sized, completely mute clip, which stitching then
    prefers over the raw one. Four exported videos went out that way.

    Caught before the mux, because after it Veo's audio is already gone.
    """
    from pathlib import Path

    from app.core.errors import ValidationAppError
    from app.providers.ffmpeg_runner import run_ffmpeg
    from app.services.voice_service import voice_over_clip

    settings = Settings()
    silent = tmp_path / "silent.wav"
    await run_ffmpeg(
        settings.ffmpeg_path,
        ["-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=24000",
         "-t", "2", "-c:a", "pcm_s16le", str(silent)],
    )
    clip = tmp_path / "clip.mp4"
    await run_ffmpeg(
        settings.ffmpeg_path,
        ["-f", "lavfi", "-i", "color=c=black:s=64x64:d=4",
         "-f", "lavfi", "-i", "sine=frequency=440:d=4",
         "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(clip)],
    )

    class _SilentProvider:
        async def synthesize(self, text, *, language_code, pace):
            return silent.read_bytes()

    scratch: list[Path] = []
    with pytest.raises(ValidationAppError, match="silence"):
        await voice_over_clip(
            settings,
            _SilentProvider(),
            dialogue="a line",
            language_code="te-IN",
            clip_path=clip,
            scratch=scratch,
        )
    for path in scratch:
        path.unlink(missing_ok=True)


async def test_one_voice_across_a_whole_video(client, seeded_dev_creators):
    """
    The guarantee a prompt cannot give. Veo generates each clip with no
    memory of the last, so a prompt naming a voice is a request it can
    decline - which is how a video comes back with a woman reading one scene
    and a man the next. Speech is synthesised by one configured speaker, so
    every scene put through this matches by construction.

    A scene with no clip yet is skipped rather than refused: half a
    storyboard generated is the normal state of a project part-way through,
    and there is nothing to speak over on the rest.
    """
    from tests.conftest import auth_headers, run_full_pipeline

    result = await run_full_pipeline(client, "creator-a", "A short explainer about filter coffee")
    project_id = result["project_id"]
    headers = auth_headers("creator-a")

    resp = await client.post(f"/projects/{project_id}/voice", headers=headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Nothing has been generated, so every scene is skipped and none fails.
    assert body["voiced"] == []
    assert body["skipped"] == [s["order"] for s in result["storyboard"]["scenes"]]


async def test_the_voice_pass_belongs_to_the_project_owner(client, seeded_dev_creators):
    from tests.conftest import auth_headers, run_full_pipeline

    result = await run_full_pipeline(client, "creator-a", "A short explainer about filter coffee")

    resp = await client.post(
        f"/projects/{result['project_id']}/voice", headers=auth_headers("creator-b")
    )

    assert resp.status_code == 404, resp.text


def test_the_speakers_offered_are_the_ones_the_model_has():
    """
    Not a guess and not copied from documentation. Asked for a speaker it
    does not have, Sarvam answers "Available speakers for bulbul:v3 are:
    ..." and this list is that answer - which is the only version of it that
    cannot drift away from what the API will accept.
    """
    from app.providers.speech import SARVAM_SPEAKERS

    assert "shubh" in SARVAM_SPEAKERS
    assert len(SARVAM_SPEAKERS) == 37
    # Lower case, because the API is strict about it.
    assert all(name == name.lower() for name in SARVAM_SPEAKERS)


def test_the_creator_choice_beats_the_deployment_default():
    """
    The speaker used to be one environment variable shared by everybody on
    the deployment, set once to a male voice and changeable only by editing
    a file on the server.
    """
    from app.core.config import Settings
    from app.providers.speech import get_speech_provider

    settings = Settings(speech_provider="sarvam", sarvam_api_key="k", sarvam_speaker="shubh")

    assert get_speech_provider(settings)._speaker == "shubh"
    assert get_speech_provider(settings, "priya")._speaker == "priya"


async def test_a_voice_that_does_not_exist_is_refused_before_it_is_used(
    client, seeded_dev_creators
):
    """
    Refused on the way in rather than at synthesis. A speaker the model does
    not have comes back from Sarvam as a 400 in the middle of voicing a
    scene, after the creator has pressed a button and waited.
    """
    from tests.conftest import auth_headers

    headers = auth_headers("creator-a")

    refused = await client.patch(
        "/creators/me/face/descriptions",
        json={"speech_speaker": "nobody-by-that-name"},
        headers=headers,
    )
    assert refused.status_code == 422, refused.text

    accepted = await client.patch(
        "/creators/me/face/descriptions",
        json={"speech_speaker": "Priya"},
        headers=headers,
    )
    assert accepted.status_code == 200, accepted.text
    # Stored lower case, which is what the API accepts.
    assert accepted.json()["speech_speaker"] == "priya"

    cleared = await client.patch(
        "/creators/me/face/descriptions",
        json={"speech_speaker": ""},
        headers=headers,
    )
    assert cleared.json()["speech_speaker"] is None
