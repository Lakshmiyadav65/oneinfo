"""
Fetching a reel a creator points at.

A thin, deliberate wrapper around yt-dlp. Deliberate because the failures
here are the ones a creator will actually hit — a private account, a link
that needs a login, a tool that has gone stale against Instagram's latest
reshuffle — and each of those deserves a sentence they can act on rather
than a stack trace.
"""

import asyncio
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from app.core.errors import AppError, ValidationAppError

_URL = re.compile(r"^https?://", re.IGNORECASE)

# yt-dlp prints one JSON line per download with these fields, so the title
# and id come back from the same call that fetched the file.
#
# The `j` conversion is what makes this safe for text: an Instagram caption
# routinely contains quotes and newlines, and j JSON-escapes them instead of
# splitting the line in half. Duration is the exception — j leaves a missing
# number as a bare `NA`, which is not JSON and took the whole parse down, so
# it is quoted as a string and parsed leniently below. Reels frequently have
# no duration reported at all.
_PRINT_TEMPLATE = (
    '{"id":%(id)j,"title":%(title)j,"path":%(filepath)j,'
    '"uploader":%(uploader)j,"duration":"%(duration)s"}'
)


class ReelDownloadError(AppError):
    code = "PROVIDER_TIMEOUT"
    status_code = 502


@dataclass(frozen=True)
class DownloadedReel:
    path: Path
    video_id: str
    title: str
    uploader: str | None
    duration_seconds: float | None


def is_video_url(value: str) -> bool:
    return _URL.match(value.strip()) is not None


async def download_reel(
    ytdlp_path: str,
    url: str,
    workdir: Path,
    *,
    max_bytes: int,
    cookies_path: Path | None = None,
) -> DownloadedReel:
    """
    Downloads one video into workdir.

    The size ceiling is handed to yt-dlp rather than checked afterwards: it
    knows the size before it starts, and refusing up front beats streaming
    two hundred megabytes to disk to then throw them away.
    """
    if not is_video_url(url):
        raise ValidationAppError(f"{url!r} is not a link. Paste the reel's URL.")

    args = [
        "-f", "mp4/best",
        "-o", str(workdir / "%(id)s.%(ext)s"),
        "--no-playlist",
        "--no-warnings",
        "--max-filesize", str(max_bytes),
        "--print", f"after_move:{_PRINT_TEMPLATE}",
        url,
    ]
    if cookies_path is not None:
        args.extend(["--cookies", str(cookies_path)])

    command = _resolve_command(ytdlp_path)

    def _invoke() -> subprocess.CompletedProcess[bytes]:
        # A thread, not asyncio.create_subprocess_exec — same reason as
        # ffmpeg_runner: asyncio subprocesses do not work on the event loop
        # policy uvicorn installs on Windows.
        return subprocess.run([*command, *args], capture_output=True, check=False)

    process = await asyncio.to_thread(_invoke)

    if process.returncode != 0:
        raise ReelDownloadError(
            _readable_error(
                process.stderr.decode(errors="replace"), had_cookies=cookies_path is not None
            )
        )

    printed = [line for line in process.stdout.decode(errors="replace").splitlines() if line.strip()]
    if not printed:
        raise ReelDownloadError(
            "That link downloaded nothing. It may be a photo post rather than "
            "a video, or larger than the server will accept."
        )

    try:
        meta = json.loads(printed[-1])
        path = Path(meta["path"])
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise ReelDownloadError("The download finished but the file could not be found.") from exc

    if not path.exists():
        raise ReelDownloadError("The download finished but the file could not be found.")

    return DownloadedReel(
        path=path,
        video_id=str(meta.get("id") or path.stem),
        # yt-dlp writes the literal string "NA" for a field the site did not
        # give it, which would otherwise become a document titled "NA".
        title=_or_none(meta.get("title")) or str(meta.get("id") or path.stem),
        uploader=_or_none(meta.get("uploader")),
        duration_seconds=_as_seconds(meta.get("duration")),
    )


def _as_seconds(value: object) -> float | None:
    """The duration, when the site reported one. Nothing rides on it."""
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _resolve_command(ytdlp_path: str) -> list[str]:
    """
    How to invoke yt-dlp, given that it is usually not on PATH.

    pip installs it as a script beside the interpreter — `.venv/Scripts` on
    Windows — and that directory only joins PATH when the virtualenv is
    *activated*. A server started as `.venv/Scripts/python.exe -m uvicorn`,
    or from an IDE, has yt-dlp installed and still cannot see it, which is a
    miserable thing to debug from "not installed" alone.

    So: an explicit YTDLP_PATH or a real binary on PATH wins, and otherwise
    it is run as a module through the interpreter already running, which is
    by definition the environment it was installed into.
    """
    found = shutil.which(ytdlp_path)
    if found:
        return [found]
    if importlib.util.find_spec("yt_dlp") is not None:
        return [sys.executable, "-m", "yt_dlp"]
    raise ReelDownloadError(
        "yt-dlp is not installed on the server, so reel links cannot be "
        "downloaded. Upload the video file instead."
    )


def _or_none(value: object) -> str | None:
    text = str(value).strip() if value is not None else ""
    return None if text in ("", "NA", "None") else text


def _readable_error(stderr: str, *, had_cookies: bool = False) -> str:
    """
    yt-dlp's diagnosis, translated into something a creator can act on.

    The cases below are the ones that come up constantly with Instagram; the
    fallback keeps yt-dlp's own last line, because when it is something else
    that line is usually the most informative thing anyone has.
    """
    lowered = stderr.lower()
    if "login" in lowered or "private" in lowered or "rate-limit" in lowered:
        if had_cookies:
            # Pointing them at the cookies file they already configured would
            # be useless advice, so say the thing that is actually wrong.
            return (
                "That reel still needs a login even with the configured "
                "cookies — the session has probably expired. Export a fresh "
                "cookies.txt, or upload the video file instead."
            )
        return (
            "That reel needs a login to view — Instagram serves private and "
            "some age-gated posts only to signed-in accounts. Set "
            "INSTAGRAM_COOKIES_PATH to your own exported cookies.txt, or "
            "upload the video file instead."
        )
    if "file is larger than max-filesize" in lowered or "max-filesize" in lowered:
        return "That video is larger than the server will accept. Try a shorter one."
    if "unsupported url" in lowered:
        return "Nothing here knows how to download that link."
    if "404" in lowered or "not found" in lowered:
        return "That link goes nowhere. Check it is the reel's public URL."

    lines = [line for line in stderr.splitlines() if line.strip()]
    tail = lines[-1] if lines else "no output"
    return f"That reel could not be downloaded: {tail[:200]}"
