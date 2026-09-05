import asyncio
import json

from app.core.errors import AppError


class FFmpegError(AppError):
    code = "RENDER_FAILED"
    status_code = 500


async def _run(binary: str, args: list[str], *, error_message: str) -> str:
    process = await asyncio.create_subprocess_exec(
        binary,
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
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
