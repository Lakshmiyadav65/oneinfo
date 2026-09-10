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
