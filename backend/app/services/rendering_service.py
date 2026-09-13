import tempfile
import textwrap
import unicodedata
from pathlib import Path

from app.core.config import Settings
from app.providers.ffmpeg_runner import (
    escape_fontfile_path,
    probe_duration_seconds,
    run_ffmpeg,
)

# At most this many lines. A line that needs more than three is long enough
# that the clip it belongs to has other problems.
_MAX_LINES = 3
# Share of the frame width the text may use, leaving a margin either side.
_TEXT_WIDTH_SHARE = 0.86
# Average glyph advance as a share of the font size, for a proportional
# sans. Close enough to wrap by, and wrapping is the only thing it decides.
_GLYPH_ADVANCE = 0.5
# Past this a line is wide enough to be hard to read across, however much
# room the frame has. Matters on 16:9, where the width would otherwise allow
# seventy characters on one line.
_MAX_COLUMNS = 42


def _caption_font_size(width: int, height: int) -> int:
    """Sized against the shorter edge, so a caption looks the same weight
    whether the video is vertical or wide."""
    return max(18, min(width, height) // 22)


def _wrap_columns(width: int, font_size: int) -> int:
    """
    How many characters fit on one line of this frame.

    Worked out rather than fixed. A fixed count was set against a vertical
    540-wide preview and ran off both edges the moment the font grew with
    the frame - the wrap has to follow the width, because overflowing is a
    width problem and ffmpeg does not wrap at all.
    """
    usable = width * _TEXT_WIDTH_SHARE
    return max(12, min(_MAX_COLUMNS, int(usable / (font_size * _GLYPH_ADVANCE))))


def _needs_a_real_font(text: str) -> bool:
    """
    True when the text has characters drawtext's built-in font cannot draw.

    Telugu is the case that matters: with no font configured every glyph
    comes out as an empty box, which is worse than drawing nothing at all.
    """
    return any(ord(ch) > 0x24F and not unicodedata.category(ch).startswith("Z") for ch in text)


def _caption_filter(
    settings: Settings, text_path: Path, width: int, height: int
) -> str:
    """
    The drawtext filter for one clip's line.

    Read from a file rather than inlined. drawtext parses its own filter
    string, so a line with a colon, a quote or a percent sign in it becomes
    a syntax error in the middle of a render - and the lines here are
    ordinary spoken sentences full of all three.
    """
    font = ""
    if settings.caption_font_path:
        font = f"fontfile={escape_fontfile_path(settings.caption_font_path)}:"
    return (
        f"drawtext={font}"
        # Escaped the same way the font path is, and for the same reason:
        # drawtext parses its own filter string, so the drive colon in a
        # Windows path ends the option early and the whole graph fails.
        f"textfile={escape_fontfile_path(str(text_path))}:"
        # The text is a spoken line, not a format string. Without this
        # drawtext reads % as the start of a strftime expansion and refuses
        # the whole render - "Stray %" on a sentence as ordinary as "cover
        # 90% of it".
        "expansion=none:"
        "fontcolor=white:"
        f"fontsize={_caption_font_size(width, height)}:"
        f"line_spacing={max(4, _caption_font_size(width, height) // 6)}:"
        "box=1:boxcolor=black@0.6:"
        f"boxborderw={max(8, _caption_font_size(width, height) // 3)}:"
        "x=(w-text_w)/2:"
        "y=h-text_h-(h/9)"
    )


async def render_final_video(
    settings: Settings,
    clips: list[Path],
    size: tuple[int, int] | None = None,
    captions: list[str | None] | None = None,
) -> tuple[Path, float]:
    """
    Normalizes each scene clip to a consistent format, then concatenates them
    into one final MP4.

    `captions` is one entry per clip, in the same order, or None to draw
    nothing anywhere. An entry of None leaves that clip alone.

    Text is drawn here rather than asked of the video model on purpose. Veo
    will write words into a shot, and it misspells them - reliably enough
    that a whiteboard reading "Systm Desgin" is the normal result, and
    unrecoverably, since text baked into a generated frame cannot be taken
    out again. Drawn at this step the words are exactly the creator's, in
    the creator's language, and changing them costs a re-stitch rather than
    another paid generation.

    Every clip used to get its scene caption drawn across the bottom, and
    that was removed for two reasons: it doubled up on the spoken line for a
    presenter already saying it, and the caption was written in English
    while the voiceover was not. Both are addressed rather than ignored -
    the caller draws on b-roll only, and the text it passes is the scene's
    own line, which now follows the project's language.

    `clips` is the scene files in storyboard order. Returns
    (output_path, duration_seconds).
    """
    # `size` is the project's own shape and resolution. Falling back to the
    # configured pair keeps every existing caller and test working unchanged.
    width, height = size or (settings.video_width, settings.video_height)
    work_dir = Path(tempfile.mkdtemp(prefix="oneinfo-render-"))

    normalized_paths: list[Path] = []
    for index, clip_path in enumerate(clips):
        normalized_path = work_dir / f"scene_{index:03d}.mp4"
        caption = (captions[index] if captions and index < len(captions) else None) or ""
        # Still re-encoded to one size, frame rate and audio layout: the
        # concat below stream-copies, and it produces a broken file if the
        # parts disagree on any of those.
        # Fitted and padded, never stretched. A plain scale=W:H distorts
        # anything whose shape differs from the target, and clips genuinely
        # do differ: a project generated landscape and later switched to
        # vertical stitches old 16:9 clips into a 9:16 video, and squashing
        # a face is a worse outcome than a black bar.
        normalize_filter = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,"
            f"setsar=1,fps={settings.video_fps}"
        )

        # Skipped rather than drawn in boxes. Without a font that covers the
        # script, drawtext renders every Telugu glyph as an empty rectangle,
        # and a bar of rectangles across the bottom of a clip is worse than
        # the clip with nothing on it.
        if caption.strip() and not (
            _needs_a_real_font(caption) and not settings.caption_font_path
        ):
            columns = _wrap_columns(width, _caption_font_size(width, height))
            wrapped = textwrap.wrap(caption.strip(), width=columns)[:_MAX_LINES]
            text_path = work_dir / f"caption_{index:03d}.txt"
            text_path.write_text("\n".join(wrapped), encoding="utf-8")
            normalize_filter = (
                f"{normalize_filter},"
                f"{_caption_filter(settings, text_path, width, height)}"
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
