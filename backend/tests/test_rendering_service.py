import tempfile
from pathlib import Path

from app.core.config import get_settings
from app.providers.video.base import VideoGenerationRequest
from app.providers.video.dev_provider import DevVideoProvider
from app.services.rendering_service import render_final_video


async def test_render_final_video_concatenates_the_scene_clips(requires_ffmpeg):
    settings = get_settings()
    provider = DevVideoProvider(settings)

    clips: list[Path] = []
    for index, prompt in enumerate(["Scene one visual", "Scene two visual"]):
        job_id = await provider.create_video_job(
            VideoGenerationRequest(visual_prompt=prompt, duration_seconds=2)
        )
        video_bytes = await provider.download_result(job_id)
        path = Path(tempfile.gettempdir()) / f"test-render-scene-{index}.mp4"
        path.write_bytes(video_bytes)
        clips.append(path)

    try:
        output_path, duration = await render_final_video(settings, clips)
        try:
            assert output_path.exists()
            assert output_path.stat().st_size > 0
            assert 3.5 <= duration <= 4.5
        finally:
            output_path.unlink(missing_ok=True)
    finally:
        for path in clips:
            path.unlink(missing_ok=True)


# --- the line, drawn on b-roll ----------------------------------------------


def test_the_wrap_follows_the_frame_rather_than_a_fixed_count():
    """
    A fixed column count was set against a 540-wide vertical preview and ran
    off both edges the moment the font grew with the frame. Overflowing is a
    width problem, and ffmpeg does not wrap at all.
    """
    from app.services.rendering_service import _caption_font_size, _wrap_columns

    for width, height in ((540, 960), (1080, 1920), (1920, 1080)):
        font = _caption_font_size(width, height)
        columns = _wrap_columns(width, font)
        # Comfortably inside the frame, with a margin either side.
        assert columns * font * 0.5 <= width * 0.9
        assert 12 <= columns <= 42


def test_a_caption_is_never_stretched_to_a_wall_of_text():
    """Three lines is the ceiling. A line needing more than that belongs to
    a clip with other problems."""
    from app.services.rendering_service import _MAX_LINES

    assert _MAX_LINES == 3


def test_a_percent_sign_does_not_kill_the_render():
    """
    drawtext reads % as the start of a strftime expansion and refuses the
    whole render - "Stray %" on a sentence as ordinary as "cover 90% of it".
    Turning expansion off is what makes a spoken line safe to draw.
    """
    from pathlib import Path

    from app.core.config import Settings
    from app.services.rendering_service import _caption_filter

    assert "expansion=none" in _caption_filter(Settings(), Path("c.txt"), 540, 960)


def test_a_script_with_no_font_for_it_is_left_undrawn():
    """Without a font covering the script, every Telugu glyph comes out as
    an empty rectangle. A bar of rectangles is worse than nothing."""
    from app.services.rendering_service import _needs_a_real_font

    assert _needs_a_real_font("సాఫ్ట్‌వేర్ డెవలపర్") is True
    assert _needs_a_real_font("System Design basics") is False


def test_a_path_reaches_drawtext_in_the_form_it_accepts():
    """
    Two parsers sit between the argument and the option, and one backslash
    only survives the first. The unquoted single-escaped form this used to
    produce failed to parse the filter graph outright - for fontfile as much
    as for textfile.
    """
    from app.providers.ffmpeg_runner import escape_fontfile_path

    escaped = escape_fontfile_path(r"C:\Windows\Fonts\Nirmala.ttc")

    assert escaped == r"'C\:/Windows/Fonts/Nirmala.ttc'"
