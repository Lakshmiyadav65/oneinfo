"""
Getting audio out of a video and into pieces a transcriber will accept.

The chunking here is the part that took the longest to get right, and the
reasoning is kept with it: a real-time speech API takes short audio, and
where you cut decides whether code-switched speech survives the trip.
"""

import re
from pathlib import Path

from app.providers.ffmpeg_runner import (
    probe_duration_seconds,
    run_ffmpeg,
    run_ffmpeg_for_stderr,
)

_SILENCE_START = re.compile(r"silence_start:\s*(-?[\d.]+)")
_SILENCE_END = re.compile(r"silence_end:\s*(-?[\d.]+)")


async def extract_audio(ffmpeg_path: str, video_path: Path, workdir: Path) -> Path:
    """Mono 16kHz WAV, which is what every speech model wants and no video has."""
    audio_path = workdir / f"{video_path.stem}.wav"
    await run_ffmpeg(
        ffmpeg_path,
        [
            "-i", str(video_path),
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-loglevel", "error",
            str(audio_path),
        ],
    )
    return audio_path


async def detect_silences(
    ffmpeg_path: str, audio_path: Path, *, noise_db: int, min_seconds: float
) -> list[tuple[float, float]]:
    """Every pause in the audio, as (start, end) seconds."""
    stderr = await run_ffmpeg_for_stderr(
        ffmpeg_path,
        [
            "-i", str(audio_path),
            "-af", f"silencedetect=noise={noise_db}dB:d={min_seconds}",
            "-f", "null", "-",
        ],
    )

    silences: list[tuple[float, float]] = []
    start: float | None = None
    for line in stderr.splitlines():
        opened = _SILENCE_START.search(line)
        if opened:
            start = float(opened.group(1))
            continue
        closed = _SILENCE_END.search(line)
        if closed and start is not None:
            silences.append((start, float(closed.group(1))))
            start = None
    return silences


def plan_chunk_cuts(
    duration: float,
    silences: list[tuple[float, float]],
    *,
    min_seconds: float,
    max_seconds: float,
) -> list[float]:
    """
    Where to cut, so each chunk is as close to a single utterance as the
    pauses allow.

    Cuts at the *first* pause after min_seconds, not at a target length.
    That distinction is the whole reason this function exists: aim for a
    target and you sail straight past the pause between a Telugu sentence
    and an English one, and the chunk holds both. Language detection picks
    one language per request, so a two-language chunk comes back entirely in
    whichever the model thought was dominant — which is exactly the "my
    English came back as Telugu" complaint. Cutting at the nearest pause
    keeps the switch on a boundary.

    max_seconds is only a safety net for a stretch with no pause in it at
    all, and it is the one case where a sentence can get split in half.
    """
    if duration <= max_seconds:
        return []

    cuts: list[float] = []
    position = 0.0
    while duration - position > max_seconds:
        window_low = position + min_seconds
        window_high = position + max_seconds
        midpoints = [
            (start + end) / 2
            for start, end in silences
            if window_low <= (start + end) / 2 <= window_high
        ]
        cut = min(round(min(midpoints) if midpoints else window_high, 3), duration)
        # A pause found at or before where we already are would loop forever.
        if cut <= position:
            cut = min(window_high, duration)
        cuts.append(cut)
        position = cut
    return cuts


async def split_audio(
    ffmpeg_path: str, audio_path: Path, workdir: Path, cuts: list[float]
) -> list[Path]:
    """The audio as files, in order. One file if there was nothing to cut."""
    if not cuts:
        return [audio_path]

    await run_ffmpeg(
        ffmpeg_path,
        [
            "-i", str(audio_path),
            "-f", "segment",
            "-segment_times", ",".join(str(cut) for cut in cuts),
            "-c", "copy",
            "-reset_timestamps", "1",
            "-loglevel", "error",
            str(workdir / "chunk_%04d.wav"),
        ],
    )
    return sorted(workdir.glob("chunk_*.wav"))


async def chunk_audio(
    ffmpeg_path: str,
    ffprobe_path: str,
    audio_path: Path,
    workdir: Path,
    *,
    min_seconds: float,
    max_seconds: float,
    silence_db: int,
    silence_min_seconds: float,
) -> tuple[list[Path], list[float]]:
    """
    The audio split at its pauses.

    Returns the chunk files and the boundary times around them, so each
    chunk's transcript can be stamped with where in the video it came from.
    """
    duration = await probe_duration_seconds(ffprobe_path, str(audio_path))
    silences = (
        await detect_silences(
            ffmpeg_path, audio_path, noise_db=silence_db, min_seconds=silence_min_seconds
        )
        if duration > max_seconds
        else []
    )
    cuts = plan_chunk_cuts(duration, silences, min_seconds=min_seconds, max_seconds=max_seconds)
    chunks = await split_audio(ffmpeg_path, audio_path, workdir, cuts)
    return chunks, [0.0, *cuts, duration]
