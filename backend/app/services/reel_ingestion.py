"""
A creator's own reels, turned into the knowledge layer.

The premise of My Knowledge is that OneInfo writes in your voice because it
has read you. That works beautifully for someone with a year of ChatGPT
transcripts to paste and not at all for someone who has never written any of
this down — who has, instead, been saying it to camera three times a week.
This path reads those.

What gets filed is the transcript, not the video. The video was only ever
the carrier; storing two hundred megabytes of it to retrieve four hundred
words would be paying for the wrong thing twice.
"""

import tempfile
import uuid
from pathlib import Path

from app.core.config import Settings, get_settings
from app.db.base import get_session_factory
from app.models.knowledge import KnowledgeDocument, KnowledgeStatus
from app.providers.reels import download_reel
from app.providers.transcription import (
    Transcript,
    get_transcription_provider,
    transcript_language_for,
)
from app.providers.transcription.audio import extract_audio
from app.services.knowledge_processing import process_knowledge_document

# How much of the transcript is kept as the document's standing summary.
# Enough for any reel; a cap so a twenty-minute upload cannot push a wall of
# text into every prompt that happens to cite its link.
MAX_SUMMARY_CHARS = 2000


def _as_summary(transcript: Transcript, *, title: str, url: str | None, uploader: str | None) -> str:
    """
    What this reel said, for a prompt to treat as fact.

    Mirrors link_service: a document whose source_url matches a link the
    creator later pastes into an idea is read from here directly, without a
    similarity search that might not surface it.
    """
    lines = [f"Source: {url}"] if url else ["Source: an uploaded video"]
    lines.append(f"Title: {title}")
    if uploader:
        lines.append(f"Posted by: {uploader}")
    lines.append(f"Spoken in: {transcript.language}")
    lines.append("")
    spoken = transcript.text.strip()
    if len(spoken) > MAX_SUMMARY_CHARS:
        spoken = spoken[:MAX_SUMMARY_CHARS].rstrip() + "\n[transcript continues]"
    lines.append(spoken)
    return "\n".join(lines)


def _as_document(
    transcript: Transcript, *, title: str, url: str | None, uploader: str | None
) -> str:
    """
    What gets chunked and embedded.

    The timings are deliberately left out. They are useful for checking a bad
    transcript against the video and useless to a model writing a new script -
    embedded alongside the words they would only dilute what each chunk is
    about.
    """
    header = [f"Video: {title}"]
    if url:
        header.append(f"Source: {url}")
    if uploader:
        header.append(f"Posted by: {uploader}")
    header.append(f"Spoken in: {transcript.language}")
    header += ["", "--- What was said ---", ""]
    return "\n".join(header) + "\n" + transcript.text.strip()


async def transcribe_into_knowledge(
    document_id: uuid.UUID,
    *,
    url: str | None = None,
    local_path: str | None = None,
    language_key: str,
) -> None:
    """
    Runs one video from source to filed document, then hands off to the
    normal ingestion pipeline for chunking and embedding.

    Owns its own session and swallows nothing: anything that goes wrong is
    written to the document as a failure the creator can read, because this
    runs after the response has already gone out and there is nobody left to
    raise to.
    """
    settings = get_settings()
    session_factory = get_session_factory()

    async with session_factory() as db:
        document = await db.get(KnowledgeDocument, document_id)
        if document is None:
            return

        try:
            content, summary, title = await _transcribe(
                settings, url=url, local_path=local_path, language_key=language_key,
                fallback_title=document.title,
            )
        except Exception as exc:
            await db.rollback()
            document = await db.get(KnowledgeDocument, document_id)
            if document is not None:
                document.status = KnowledgeStatus.failed
                document.error_message = str(exc)[:500]
                await db.commit()
            return
        finally:
            # The upload only ever existed to be transcribed. Whether that
            # worked or not, it goes.
            if local_path:
                Path(local_path).unlink(missing_ok=True)

        document.summary = summary
        # A reel URL is filed before anything has been downloaded, so until
        # now the document has been sitting in the list named after its link.
        # The caption it was actually posted with is a better name.
        document.title = title[:200]
        await db.commit()

    # A separate session on purpose: the pipeline below opens its own, and
    # holding this one through an embedding call would pin a connection for
    # the length of it.
    await process_knowledge_document(document_id, content)


async def _transcribe(
    settings: Settings,
    *,
    url: str | None,
    local_path: str | None,
    language_key: str,
    fallback_title: str,
) -> tuple[str, str, str]:
    """The document text, its summary and its title, from whichever source was given."""
    language = transcript_language_for(language_key)
    provider = get_transcription_provider(settings)

    with tempfile.TemporaryDirectory(prefix="oneinfo-reel-") as tmp:
        workdir = Path(tmp)
        uploader: str | None = None

        if url:
            reel = await download_reel(
                settings.ytdlp_path, url, workdir, max_bytes=settings.max_video_bytes
            )
            video_path, title, uploader = reel.path, reel.title, reel.uploader
        elif local_path:
            video_path, title = Path(local_path), fallback_title
            if not video_path.exists():
                raise FileNotFoundError("The uploaded video is no longer on the server.")
        else:
            raise ValueError("Nothing to transcribe: no link and no file.")

        audio_path = await extract_audio(settings.ffmpeg_path, video_path, workdir)
        transcript = await provider.transcribe(audio_path, language=language)

    if not transcript.text.strip():
        raise ValueError(
            "No speech was found in that video. A reel that is only music or "
            "on-screen text has nothing to transcribe."
        )

    return (
        _as_document(transcript, title=title, url=url, uploader=uploader),
        _as_summary(transcript, title=title, url=url, uploader=uploader),
        title,
    )
