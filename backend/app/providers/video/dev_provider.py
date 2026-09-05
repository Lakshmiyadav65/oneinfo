import tempfile
import uuid
from pathlib import Path

from app.core.config import Settings
from app.providers.ffmpeg_runner import escape_drawtext, run_ffmpeg
from app.providers.video.base import VideoGenerationRequest, VideoJobStatus

_PALETTE = ["1f2937", "4f46e5", "0f766e", "9d174d", "78350f", "1e3a8a"]


class DevVideoProvider:
    """
    Generates a real, playable placeholder clip locally via FFmpeg instead
    of calling Veo — a solid-color card naming the visual_prompt (what a
    real provider would have depicted) and a silent audio track. The
    scene's actual caption is burned in later, uniformly, by
    rendering_service — real Veo output needs that same caption pass, so
    it doesn't belong here. Proves the full asset/storage/rendering
    pipeline end-to-end without Google Cloud credentials. Swap to
    VeoVideoProvider for real generated video.
    """

    # FFmpeg renders any length, so dev runs are never snapped.
    supported_durations: tuple[int, ...] | None = None

    def __init__(self, settings: Settings):
        self._settings = settings
        self._jobs: dict[str, Path] = {}

    async def create_video_job(self, request: VideoGenerationRequest) -> str:
        job_id = str(uuid.uuid4())
        output_path = Path(tempfile.gettempdir()) / f"oneinfo-dev-scene-{job_id}.mp4"
        settings = self._settings

        color = _PALETTE[hash(request.visual_prompt) % len(_PALETTE)]
        text = escape_drawtext(request.visual_prompt)

        color_source = (
            f"color=c=0x{color}:s={settings.video_width}x{settings.video_height}"
            f":d={request.duration_seconds}:r={settings.video_fps}"
        )
        drawtext_filter = (
            f"drawtext=text='{text}':fontcolor=white:fontsize=40:"
            "x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.4:boxborderw=20"
        )

        await run_ffmpeg(
            settings.ffmpeg_path,
            [
                "-f", "lavfi",
                "-i", color_source,
                "-f", "lavfi",
                "-i", "anullsrc=r=44100:cl=stereo",
                "-vf", drawtext_filter,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-t", str(request.duration_seconds),
                "-shortest",
                str(output_path),
            ],
        )

        self._jobs[job_id] = output_path
        return job_id

    async def get_job_status(self, job_id: str) -> VideoJobStatus:
        if job_id not in self._jobs:
            return VideoJobStatus(status="failed", error_message="Unknown job id.")
        return VideoJobStatus(status="completed")

    async def download_result(self, job_id: str) -> bytes:
        return self._jobs[job_id].read_bytes()
