"""
Transcribe a reel or a video file from the terminal.

    python -m app.cli.transcribe "https://www.instagram.com/reel/XXXX/"
    python -m app.cli.transcribe video.mp4 --language telugu
    python -m app.cli.transcribe --file sources.txt

The same providers the API uses, driven from a shell instead of a request.
That is the whole point of it living here rather than in a project of its
own: a second implementation of this pipeline drifts from the first the
first time either is fixed, and then the tool you tune with stops predicting
what the app will do.

What it is for, concretely: trying a language or a chunking setting against
a real video before writing the result into backend/.env. Everything below
reads its defaults from those same settings, so the run you do here is the
run the server would have done.
"""

import argparse
import asyncio
import json
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path

from app.core.config import get_settings
from app.providers.reels import download_reel, is_video_url
from app.providers.transcription import (
    TRANSCRIPT_LANGUAGES,
    Transcript,
    get_transcription_provider,
    transcript_language_for,
)
from app.providers.transcription.audio import extract_audio


def _log(message: str) -> None:
    # stderr, so `... | jq` on stdout still works.
    print(message, file=sys.stderr)


async def transcribe_one(source: str, language_key: str, outdir: Path) -> Transcript:
    """One video, from wherever it is, to a transcript on disk."""
    settings = get_settings()
    language = transcript_language_for(language_key)
    provider = get_transcription_provider(settings)

    with tempfile.TemporaryDirectory(prefix="oneinfo-cli-") as tmp:
        work = Path(tmp)

        if is_video_url(source):
            _log(f"Downloading {source}")
            reel = await download_reel(
                settings.ytdlp_path, source, work, max_bytes=settings.max_video_bytes
            )
            video_path, name = reel.path, reel.video_id
            _log(f"  {reel.title}" + (f" — {reel.uploader}" if reel.uploader else ""))
        else:
            video_path = Path(source)
            if not video_path.exists():
                raise FileNotFoundError(f"No such video file: {source}")
            name = video_path.stem

        _log("Extracting audio")
        audio = await extract_audio(settings.ffmpeg_path, video_path, work)

        _log(f"Transcribing as {language.key} (mode={language.mode})")
        transcript = await provider.transcribe(audio, language=language, on_progress=_log)

    outdir.mkdir(parents=True, exist_ok=True)
    base = outdir / name

    # The plain script, for reading and pasting.
    base.with_suffix(".txt").write_text(transcript.text + "\n", encoding="utf-8")

    # ensure_ascii=False, or Telugu is stored as \uXXXX escapes and the file
    # is unreadable in the one case this tool exists for.
    base.with_suffix(".json").write_text(
        json.dumps(
            {
                "source": source,
                "language_requested": language.key,
                "language_detected": transcript.language,
                "text": transcript.text,
                "segments": [asdict(segment) for segment in transcript.segments],
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    _log(f"Saved {base}.txt and {base}.json")
    return transcript


async def _main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.cli.transcribe",
        description="Transcribe a reel URL or a local video file, using the app's own pipeline.",
    )
    sources = parser.add_mutually_exclusive_group(required=True)
    sources.add_argument("source", nargs="?", help="A reel URL, or a path to a video file")
    sources.add_argument("--file", "-f", help="A text file with one URL or path per line")
    parser.add_argument(
        "--language",
        "-l",
        choices=sorted(TRANSCRIPT_LANGUAGES),
        default="tenglish",
        help=(
            "How to write the transcript — the same three the app offers. "
            "tenglish (default) is spoken Telugu in Latin script, telugu is "
            "Telugu script, english translates."
        ),
    )
    parser.add_argument(
        "--outdir", "-o", default="transcripts", help="Where to save (default: transcripts/)"
    )
    args = parser.parse_args()

    settings = get_settings()
    if settings.transcription_provider == "dev":
        _log(
            "Note: TRANSCRIPTION_PROVIDER=dev, so this produces a [DEV MODE] "
            "placeholder. Set it to sarvam in backend/.env to transcribe for real."
        )

    if args.file:
        raw = Path(args.file).read_text(encoding="utf-8").splitlines()
        queue = [line.strip() for line in raw if line.strip()]
    else:
        queue = [args.source]

    outdir = Path(args.outdir)
    failures: list[tuple[str, str]] = []

    for source in queue:
        try:
            transcript = await transcribe_one(source, args.language, outdir)
        except Exception as exc:
            # One bad source does not end the batch — the same contract the
            # /knowledge/reels route keeps, for the same reason.
            _log(f"FAILED {source}: {exc}")
            failures.append((source, str(exc)))
            continue

        print(f"\n=== {source} ===")
        print(f"[{transcript.language}]")
        print(transcript.text)

    if failures:
        _log(f"\n{len(failures)} of {len(queue)} failed.")
    return 1 if failures else 0


def main() -> None:
    raise SystemExit(asyncio.run(_main()))


if __name__ == "__main__":
    main()
