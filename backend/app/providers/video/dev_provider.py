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

    # FFmpeg would render any length, but dev deliberately borrows Veo's
    # constraint anyway. A storyboard planned in dev mode is planned for
    # real: without this, a 45s dev storyboard silently became 32s the
    # moment the provider was switched back, and the creator found out
    # from the finished video.
    supported_durations: tuple[int, ...] | None = (4, 6, 8)
    reference_supported_durations: tuple[int, ...] | None = (8,)

    def __init__(self, settings: Settings):
        self._settings = settings
        # job_id -> one path per take, so the takes UI can be exercised
        # without paying Veo for four of anything.
        self._jobs: dict[str, list[Path]] = {}

    async def create_video_job(self, request: VideoGenerationRequest) -> str:
        job_id = str(uuid.uuid4())
        settings = self._settings

        # The dev clip is drawn at the size the project actually renders at,
        # so a vertical project looks vertical here too rather than only
        # after switching to a provider that bills.
        width, height = (
            (settings.video_height, settings.video_width)
            if request.aspect_ratio == "9:16"
            else (settings.video_width, settings.video_height)
        )

        paths: list[Path] = []
        for take in range(max(1, request.sample_count)):
            output_path = (
                Path(tempfile.gettempdir()) / f"oneinfo-dev-scene-{job_id}-{take}.mp4"
            )
            # Takes differ by colour so they are told apart on sight. Veo's
            # takes differ by content; this is only enough to prove the
            # picker works.
            color = _PALETTE[(hash(request.visual_prompt) + take) % len(_PALETTE)]
            label = request.visual_prompt
            if request.sample_count > 1:
                label = f"Take {take + 1} - {label}"
            text = escape_drawtext(label)

            color_source = (
                f"color=c=0x{color}:s={width}x{height}"
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
            paths.append(output_path)

        self._jobs[job_id] = paths
        return job_id

    async def get_job_status(self, job_id: str) -> VideoJobStatus:
        if job_id not in self._jobs:
            return VideoJobStatus(status="failed", error_message="Unknown job id.")
        return VideoJobStatus(status="completed")

    async def download_result(self, job_id: str) -> bytes:
        return self._jobs[job_id][0].read_bytes()

    async def download_all_results(self, job_id: str) -> list[bytes]:
        return [path.read_bytes() for path in self._jobs[job_id]]
