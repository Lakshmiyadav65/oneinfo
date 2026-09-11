"""
Turning a creator's own reels into the knowledge layer.

Two things here are worth pinning down. The first is where the audio gets
cut: everything downstream depends on a chunk holding one utterance, and the
whole point of this path is content that switches language mid-sentence. The
second is that a batch of links behaves like a batch — one bad link must not
take the good ones with it, and a link already transcribed must not be paid
for twice.
"""

import sys
from itertools import pairwise
from pathlib import Path
from typing import get_args

import pytest

from app.providers.reels import (
    _as_seconds,
    _readable_error,
    _resolve_command,
    is_video_url,
)
from app.providers.transcription import get_transcription_provider
from app.providers.transcription.audio import plan_chunk_cuts
from app.providers.transcription.base import (
    TRANSCRIPT_LANGUAGES,
    Transcript,
    TranscriptSegment,
    transcript_language_for,
)
from app.providers.transcription.sarvam_provider import _overall_language
from app.schemas.project import ProjectUpdateIn
from app.services.reel_ingestion import MAX_SUMMARY_CHARS, _as_document, _as_summary
from tests.conftest import auth_headers


def test_short_audio_is_not_cut_at_all():
    assert plan_chunk_cuts(18.0, [(5.0, 5.6)], min_seconds=1.0, max_seconds=25.0) == []


def test_the_cut_lands_on_the_first_pause_after_the_minimum():
    """
    Not the pause nearest some target length.

    This is the bug the whole function is shaped around: aim for a target and
    the cut sails past the pause between a Telugu sentence and an English one,
    so the chunk holds both. Detection picks one language per request, and the
    English comes back written in Telugu. Cutting at the earliest usable pause
    keeps the switch on a boundary.
    """
    silences = [(4.0, 4.5), (12.0, 12.6), (22.0, 22.4)]

    cuts = plan_chunk_cuts(60.0, silences, min_seconds=1.0, max_seconds=25.0)

    assert cuts[0] == pytest.approx(4.25)


def test_speech_with_no_pause_in_it_is_cut_at_the_ceiling():
    """The safety net. The real-time endpoint refuses long audio, so a
    continuous stretch has to be cut somewhere even though it splits a
    sentence."""
    cuts = plan_chunk_cuts(70.0, [], min_seconds=1.0, max_seconds=25.0)

    assert cuts == [25.0, 50.0]


def test_every_chunk_stays_under_the_ceiling():
    silences = [(float(n), n + 0.4) for n in range(3, 300, 7)]

    cuts = plan_chunk_cuts(300.0, silences, min_seconds=1.0, max_seconds=25.0)

    boundaries = [0.0, *cuts, 300.0]
    spans = [b - a for a, b in pairwise(boundaries)]
    assert max(spans) <= 25.0 + 1e-6
    assert cuts == sorted(cuts)


def test_a_pause_at_the_very_start_cannot_stall_the_planner():
    """
    A silence whose midpoint is at or behind the current position would be
    chosen forever, and the request would never return. Contrived, but the
    failure is a hung worker rather than a bad transcript.
    """
    cuts = plan_chunk_cuts(80.0, [(0.0, 2.0)], min_seconds=0.0, max_seconds=25.0)

    assert all(later > earlier for earlier, later in pairwise(cuts))


def test_a_transcript_offers_exactly_the_languages_a_project_does():
    """
    The invariant this feature is built on. A transcript is what the script
    agents later write from, so "what language is this in" is one question
    asked once — the moment these two lists differ, a creator is picking a
    language here that Create Video has never heard of.
    """
    project_languages = set(get_args(ProjectUpdateIn.model_fields["language"].annotation))

    assert set(TRANSCRIPT_LANGUAGES) == project_languages


def test_tenglish_is_transcribed_into_latin_script():
    """
    The app's own definition, in models/tanglish.py and every agent prompt:
    Tenglish is spoken Telugu written in Latin script. Transliteration is
    the mode that produces that; transcription would come back in Telugu
    script and quietly mean something else by the same word.
    """
    assert transcript_language_for("tenglish").mode == "translit"
    assert transcript_language_for("telugu").mode == "transcribe"
    assert transcript_language_for("telugu").language_code == "te-IN"


def test_english_translates_rather_than_transcribing():
    """
    Asked to transcribe Telugu speech as en-IN, the model ignores the code
    and returns Telugu script anyway — so a creator picking English got a
    Telugu document. Translate is the mode that honours the choice.
    """
    assert transcript_language_for("english").mode == "translate"


def test_an_unknown_language_transcribes_as_spoken_rather_than_failing():
    assert transcript_language_for("something-nobody-mapped").key == "tenglish"
    assert transcript_language_for(None).key == "tenglish"
    assert transcript_language_for("TELUGU") is TRANSCRIPT_LANGUAGES["telugu"]


def test_a_reel_that_switched_language_is_reported_as_mixed():
    """Not flattened to whichever came first — that would misreport the
    normal shape of this content as a single-language video."""
    segments = [
        TranscriptSegment(0.0, 4.0, "te-IN", "నాకు కావాలి"),
        TranscriptSegment(4.0, 8.0, "en-IN", "link in bio"),
    ]

    assert _overall_language(segments) == "mixed (en-IN, te-IN)"


def test_one_language_throughout_is_reported_plainly():
    segments = [TranscriptSegment(0.0, 4.0, "te-IN", "ఒకటి")] * 2

    assert _overall_language(segments) == "te-IN"


def _transcript(text: str = "naaku idi chala nachindi") -> Transcript:
    return Transcript(
        text=text,
        language="mixed (en-IN, te-IN)",
        segments=[TranscriptSegment(0.0, 4.0, "te-IN", text)],
    )


def test_the_filed_document_keeps_the_words_and_drops_the_timings():
    """Timings help someone checking a bad transcript against the video and
    mean nothing to a model writing a new script — embedded alongside the
    words they would only dilute what the chunk is about."""
    document = _as_document(
        _transcript(), title="Three tax mistakes", url="https://insta/reel/abc", uploader="@me"
    )

    assert "naaku idi chala nachindi" in document
    assert "https://insta/reel/abc" in document
    assert "0.0" not in document


def test_an_uploaded_video_says_so_instead_of_claiming_a_source():
    summary = _as_summary(_transcript(), title="clip.mp4", url=None, uploader=None)

    assert summary.startswith("Source: an uploaded video")


def test_a_long_transcript_is_capped_in_the_summary():
    """The summary is read into any prompt citing this link, so an hour-long
    upload must not be able to push a wall of text into all of them."""
    summary = _as_summary(
        _transcript("word " * 4000), title="Long one", url="https://insta/reel/x", uploader=None
    )

    assert len(summary) < MAX_SUMMARY_CHARS + 200
    assert "[transcript continues]" in summary


@pytest.mark.parametrize(
    "value,expected",
    [
        ("https://www.instagram.com/reel/abc/", True),
        ("http://insta.gram/x", True),
        ("  https://x.com/y  ", True),
        ("instagram.com/reel/abc", False),
        ("just some words", False),
        ("", False),
    ],
)
def test_only_links_are_treated_as_links(value, expected):
    assert is_video_url(value) is expected


_LOGIN_WALL = (
    "ERROR: [Instagram] abc: Requested content is not available, "
    "rate-limit reached or login required"
)


def test_a_login_wall_is_explained_rather_than_dumped():
    """The downloader's own wording here is a stack of internal detail. What
    a creator needs is the one thing they can do about it."""
    message = _readable_error(_LOGIN_WALL)

    assert "instagram_cookies_path" in message.lower()
    assert "upload the video file instead" in message.lower()


def test_a_login_wall_with_cookies_already_set_says_something_useful_instead():
    """
    Telling someone to configure the cookies file they have already
    configured is the kind of advice that makes a person stop reading error
    messages. If the session was sent and still refused, it has expired.
    """
    message = _readable_error(_LOGIN_WALL, had_cookies=True)

    assert "expired" in message.lower()
    assert "instagram_cookies_path" not in message.lower()


def test_a_reel_with_no_reported_duration_still_parses():
    """
    yt-dlp prints a bare NA for a number the site did not give it, and
    Instagram gives no duration for plenty of reels. Read as JSON that NA is
    a syntax error, which took down the parse of a download that had in fact
    just succeeded — the file was on disk and the creator was told it could
    not be found.
    """
    assert _as_seconds("NA") is None
    assert _as_seconds(None) is None
    assert _as_seconds("") is None
    assert _as_seconds("12.5") == 12.5
    assert _as_seconds(30) == 30.0


def test_yt_dlp_is_found_even_when_it_is_not_on_the_path():
    """
    pip installs it beside the interpreter, and that directory only joins
    PATH when the virtualenv is activated. A server started as
    `.venv/Scripts/python.exe -m uvicorn` has yt-dlp installed and cannot
    see it, so falling back to the running interpreter is what makes the
    difference between working and "not installed".
    """
    command = _resolve_command("a-binary-that-is-not-installed-anywhere")

    assert command[0] == sys.executable
    assert command[1:] == ["-m", "yt_dlp"]


def test_an_unrecognised_failure_keeps_the_downloaders_own_last_line():
    message = _readable_error("ERROR: something nobody has seen before\n")

    assert "something nobody has seen before" in message


async def test_an_unasked_language_follows_the_creators_own_projects(
    client, seeded_dev_creators, monkeypatch
):
    """
    Same guess a new project makes, for the same reason. A creator whose
    work is all in Telugu should not have their reels come back in English
    because nobody asked.
    """
    captured: list = []
    monkeypatch.setattr(
        "app.api.routes.knowledge.transcribe_into_knowledge",
        lambda *a, **k: captured.append(k),
    )
    headers = auth_headers("creator-a")
    project = await client.post("/projects", json={"idea": "a telugu one"}, headers=headers)
    await client.patch(
        f"/projects/{project.json()['id']}", json={"language": "telugu"}, headers=headers
    )

    await client.post(
        "/knowledge/reels", json={"urls": ["https://insta/reel/x"]}, headers=headers
    )

    assert captured[0]["language_key"] == "telugu"


async def test_a_bad_link_is_reported_beside_the_good_ones(
    client, seeded_dev_creators, monkeypatch
):
    """Losing four good reels because the fifth was a typo is not what
    anyone asked for."""
    monkeypatch.setattr(
        "app.api.routes.knowledge.transcribe_into_knowledge", lambda *a, **k: None
    )

    resp = await client.post(
        "/knowledge/reels",
        json={"urls": ["https://insta/reel/good", "not a link at all"]},
        headers=auth_headers("creator-a"),
    )

    assert resp.status_code == 202, resp.text
    good, bad = resp.json()["reels"]
    assert good["document"]["status"] == "processing"
    assert good["error"] is None
    assert bad["document"] is None
    assert "not a link" in bad["error"].lower()


@pytest.mark.parametrize("key", ["telugu", "tenglish"])
async def test_the_local_engine_refuses_what_it_cannot_actually_do(key):
    """
    Measured, not assumed: asked for Telugu on a real reel this model returns
    fluent-looking Telugu script that is not words, while translating the
    same audio gives a usable English rendering.

    It refuses rather than warning because of where the output goes. The
    prototype printed to a terminal for a person to eyeball; here it would be
    chunked, embedded, and surfaced months later as something the creator
    supposedly said.
    """
    from app.providers.transcription.whisper_provider import (
        WhisperTranscriptionProvider,
        WhisperUnavailableError,
    )

    provider = WhisperTranscriptionProvider("small")

    with pytest.raises(WhisperUnavailableError) as refusal:
        await provider.transcribe(Path("unused.wav"), language=transcript_language_for(key))

    assert "sarvam" in str(refusal.value).lower()


def test_choosing_the_local_engine_gets_the_local_engine():
    from app.core.config import Settings
    from app.providers.transcription.whisper_provider import WhisperTranscriptionProvider

    provider = get_transcription_provider(Settings(transcription_provider="whisper"))

    assert isinstance(provider, WhisperTranscriptionProvider)


async def test_the_same_reel_is_never_transcribed_twice(
    client, seeded_dev_creators, monkeypatch
):
    """Each reel costs a download, an ffmpeg pass and a request per chunk of
    audio. A link already filed should cost nothing at all."""
    monkeypatch.setattr(
        "app.api.routes.knowledge.transcribe_into_knowledge", lambda *a, **k: None
    )
    headers = auth_headers("creator-a")
    url = "https://insta/reel/same"

    first = await client.post("/knowledge/reels", json={"urls": [url]}, headers=headers)
    second = await client.post("/knowledge/reels", json={"urls": [url]}, headers=headers)

    assert first.json()["reels"][0]["already_added"] is False
    repeat = second.json()["reels"][0]
    assert repeat["already_added"] is True
    assert repeat["document"]["id"] == first.json()["reels"][0]["document"]["id"]
    listed = await client.get("/knowledge", headers=headers)
    assert len(listed.json()) == 1


async def test_another_creators_reel_is_not_mistaken_for_your_own(
    client, seeded_dev_creators, monkeypatch
):
    """The dedup lookup is a query on source_url, and source_url is not
    unique across creators. Missing the creator filter would hand one
    creator a document belonging to another."""
    monkeypatch.setattr(
        "app.api.routes.knowledge.transcribe_into_knowledge", lambda *a, **k: None
    )
    url = "https://insta/reel/shared"

    await client.post("/knowledge/reels", json={"urls": [url]}, headers=auth_headers("creator-a"))
    resp = await client.post(
        "/knowledge/reels", json={"urls": [url]}, headers=auth_headers("creator-b")
    )

    assert resp.json()["reels"][0]["already_added"] is False


async def test_a_file_that_is_not_a_video_is_refused_before_anything_is_spooled(
    client, seeded_dev_creators
):
    resp = await client.post(
        "/knowledge/video",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        headers=auth_headers("creator-a"),
    )

    assert resp.status_code == 422, resp.text
    assert "video" in resp.json()["error"]["message"].lower()
