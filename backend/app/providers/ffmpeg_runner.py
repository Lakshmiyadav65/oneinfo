import asyncio
import json
import subprocess
from dataclasses import dataclass

from app.core.errors import AppError


class FFmpegError(AppError):
    code = "RENDER_FAILED"
    status_code = 500


async def _run(binary: str, args: list[str], *, error_message: str) -> str:
    """
    Runs ffmpeg/ffprobe off the event loop.

    Deliberately not asyncio.create_subprocess_exec: asyncio subprocesses are
    unsupported on Windows' SelectorEventLoop, which is the policy uvicorn
    installs there. Every call raised a bare NotImplementedError with an empty
    message, so the job failed with nothing to go on and no render could ever
    finish through the server. A thread works on every platform and loop.
    """

    def _invoke() -> subprocess.CompletedProcess[bytes]:
        # check=False: a non-zero exit is handled below, where the useful
        # lines of ffmpeg's stderr are pulled out for the message.
        return subprocess.run([binary, *args], capture_output=True, check=False)

    process = await asyncio.to_thread(_invoke)
    stdout, stderr = process.stdout, process.stderr
    if process.returncode != 0:
        # ffmpeg says what actually went wrong in its last few lines; everything
        # before that is banner and stream dumps. Keeping 2000 characters looked
        # thorough, but callers truncate to 500 for storage — which kept the
        # banner and threw the error away. Keep the lines that matter instead.
        lines = [
            line for line in stderr.decode(errors="replace").splitlines() if line.strip()
        ]
        raise FFmpegError(f"{error_message}: " + " | ".join(lines[-4:]))
    return stdout.decode(errors="replace")


async def run_ffmpeg(ffmpeg_path: str, args: list[str]) -> None:
    await _run(ffmpeg_path, ["-y", *args], error_message="ffmpeg failed")


def escape_drawtext(text: str) -> str:
    """
    Escapes a caption for drawtext's filter syntax.

    Note what is deliberately NOT escaped: `%`. drawtext rejects a
    backslash-escaped percent outright — "Invalid argument", and the whole
    render dies — and a percent only means anything when text expansion is on.
    rendering_service passes expansion=none, so it is just a percent sign.
    A caption as ordinary as "Why 90% of coders quit" used to kill the render.
    """
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")


def escape_fontfile_path(path: str) -> str:
    """
    drawtext parses its own filter string, so a Windows font path needs
    forward slashes and an escaped drive colon (C\\:/Windows/... ) or the
    filter fails to parse.
    """
    return path.replace("\\", "/").replace(":", "\\:")


async def probe_duration_seconds(ffprobe_path: str, file_path: str) -> float:
    output = await _run(
        ffprobe_path,
        [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            file_path,
        ],
        error_message="ffprobe failed",
    )
    data = json.loads(output)
    return float(data["format"]["duration"])


@dataclass(frozen=True)
class VideoInfo:
    duration_seconds: float
    width: int | None
    height: int | None
    has_video: bool
    has_audio: bool


async def probe_video_info(ffprobe_path: str, file_path: str) -> VideoInfo:
    """
    What a file actually contains, rather than what its name or the browser's
    Content-Type claims.

    This is to an uploaded recording what Pillow is to an uploaded photo: the
    only thing that decides whether the bytes are usable. A file that arrives
    labelled video/webm and holds nothing of the sort has to fail here, with
    something readable, and not four steps later inside ffmpeg.
    """
    output = await _run(
        ffprobe_path,
        [
            "-v", "error",
            "-show_entries", "format=duration",
            "-show_streams",
            "-of", "json",
            file_path,
        ],
        error_message="ffprobe failed",
    )
    data = json.loads(output)
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)

    # A WebM straight out of MediaRecorder routinely reports no container
    # duration at all - the header is written before the length is known and
    # never gets back-filled. Fall back to the video stream's own duration
    # rather than calling a perfectly good recording unreadable.
    raw_duration = data.get("format", {}).get("duration")
    if raw_duration in (None, "N/A") and video is not None:
        raw_duration = video.get("duration")
    try:
        duration = float(raw_duration)
    except (TypeError, ValueError):
        duration = 0.0

    def _dimension(key: str) -> int | None:
        if video is None:
            return None
        value = video.get(key)
        return int(value) if isinstance(value, int | float | str) and str(value).isdigit() else None

    return VideoInfo(
        duration_seconds=duration,
        width=_dimension("width"),
        height=_dimension("height"),
        has_video=video is not None,
        has_audio=any(s.get("codec_type") == "audio" for s in streams),
    )
