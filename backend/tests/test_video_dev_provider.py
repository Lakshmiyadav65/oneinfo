import tempfile
from pathlib import Path

from app.core.config import get_settings
from app.providers.ffmpeg_runner import probe_duration_seconds
from app.providers.video.base import VideoGenerationRequest
from app.providers.video.dev_provider import DevVideoProvider


async def test_dev_provider_produces_a_real_playable_clip(requires_ffmpeg):
    settings = get_settings()
    provider = DevVideoProvider(settings)

    job_id = await provider.create_video_job(
        VideoGenerationRequest(visual_prompt="A steaming cup of coffee on a wooden table", duration_seconds=3)
    )
    status = await provider.get_job_status(job_id)
    assert status.status == "completed"

    video_bytes = await provider.download_result(job_id)
    assert len(video_bytes) > 0

    path = Path(tempfile.gettempdir()) / f"test-dev-clip-{job_id}.mp4"
    path.write_bytes(video_bytes)
    try:
        duration = await probe_duration_seconds(settings.ffprobe_path, str(path))
        assert 2.5 <= duration <= 3.5
    finally:
        path.unlink(missing_ok=True)


async def test_dev_provider_unknown_job_id_fails_safely(requires_ffmpeg):
    settings = get_settings()
    provider = DevVideoProvider(settings)
    status = await provider.get_job_status("nonexistent")
    assert status.status == "failed"
