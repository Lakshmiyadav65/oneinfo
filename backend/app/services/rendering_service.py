import tempfile
from pathlib import Path

from app.core.config import Settings
from app.providers.ffmpeg_runner import probe_duration_seconds, run_ffmpeg


async def render_final_video(
    settings: Settings, clips: list[Path]
) -> tuple[Path, float]:
    """
    Normalizes each scene clip to a consistent format, then concatenates them
    into one final MP4.

    No burnt-in captions. Every clip used to get its scene caption drawn
    across the bottom, which put a second line of text over video that is
    already carrying the spoken line - and the wrong one, since the caption
    was written in English while the voiceover was not.

    `clips` is the scene files in storyboard order. Returns
    (output_path, duration_seconds).
    """
    work_dir = Path(tempfile.mkdtemp(prefix="oneinfo-render-"))

    normalized_paths: list[Path] = []
    for index, clip_path in enumerate(clips):
        normalized_path = work_dir / f"scene_{index:03d}.mp4"
        # Still re-encoded to one size, frame rate and audio layout: the
        # concat below stream-copies, and it produces a broken file if the
        # parts disagree on any of those.
        normalize_filter = (
            f"scale={settings.video_width}:{settings.video_height},fps={settings.video_fps}"
        )
        await run_ffmpeg(
            settings.ffmpeg_path,
            [
                "-i", str(clip_path),
                "-vf", normalize_filter,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-ar", "44100", "-ac", "2",
                str(normalized_path),
            ],
        )
        normalized_paths.append(normalized_path)

    concat_list_path = work_dir / "concat.txt"
    concat_list_path.write_text(
        "\n".join(f"file '{p.as_posix()}'" for p in normalized_paths), encoding="utf-8"
    )

    output_path = work_dir / "final.mp4"
    await run_ffmpeg(
        settings.ffmpeg_path,
        [
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list_path),
            "-c", "copy",
            str(output_path),
        ],
    )

    duration = await probe_duration_seconds(settings.ffprobe_path, str(output_path))
    return output_path, duration
