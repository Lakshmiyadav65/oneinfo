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
        # ffmpeg/ffprobe stderr can be long; keep only the tail for logs,
        # and never surface raw provider/tooling output to the client.
        tail = stderr.decode(errors="replace")[-2000:]
        raise FFmpegError(f"{error_message}: {tail}")
    return stdout.decode(errors="replace")


async def run_ffmpeg(ffmpeg_path: str, args: list[str]) -> None:
    await _run(ffmpeg_path, ["-y", *args], error_message="ffmpeg failed")


def escape_drawtext(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")


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
