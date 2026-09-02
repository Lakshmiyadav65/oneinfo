import tempfile
from pathlib import Path

from app.core.config import Settings
from app.providers.ffmpeg_runner import escape_drawtext, probe_duration_seconds, run_ffmpeg


async def render_final_video(
    settings: Settings, scenes: list[tuple[Path, str]]
) -> tuple[Path, float]:
    """
    Normalizes each scene clip to a consistent format, burns its caption in
    (the spec's "Captions" pipeline stage — applied uniformly here so it
    works the same whether the clip came from the dev provider or real
    Veo), then concatenates them into one final MP4.

    `scenes` is [(clip_path, caption), ...] in storyboard order. Returns
    (output_path, duration_seconds).
    """
    work_dir = Path(tempfile.mkdtemp(prefix="oneinfo-render-"))

    normalized_paths: list[Path] = []
    for index, (clip_path, caption) in enumerate(scenes):
        normalized_path = work_dir / f"scene_{index:03d}.mp4"
        caption_text = escape_drawtext(caption)
        scale_and_caption_filter = (
            f"scale={settings.video_width}:{settings.video_height},fps={settings.video_fps},"
            f"drawtext=text='{caption_text}':fontcolor=white:fontsize=32:"
            "x=(w-text_w)/2:y=h-text_h-40:box=1:boxcolor=black@0.6:boxborderw=16"
        )
        await run_ffmpeg(
            settings.ffmpeg_path,
            [
                "-i", str(clip_path),
                "-vf", scale_and_caption_filter,
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
