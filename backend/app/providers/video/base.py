from typing import Literal, Protocol

from pydantic import BaseModel


class VideoGenerationRequest(BaseModel):
    visual_prompt: str
    duration_seconds: int
    # Up to three photos of one person, as raw image bytes. When present the
    # provider is expected to keep that person's appearance in the output.
    # Veo bills these on a pricier tier, so they are only ever attached when
    # the project actually calls for the creator's face.
    reference_images: list[bytes] = []


class VideoJobStatus(BaseModel):
    status: Literal["processing", "completed", "failed"]
    error_message: str | None = None


class VideoProvider(Protocol):
    # Clip lengths the backend will accept, or None when the provider can
    # render any length. Veo only generates fixed-length clips and rejects
    # anything else outright, so storyboards are snapped to this before a
    # single (billable) request goes out.
    supported_durations: tuple[int, ...] | None
    # Clip lengths allowed when a request carries reference images. Veo
    # constrains this separately and far more tightly than plain
    # text-to-video, so it cannot be folded into the field above. None means
    # "same as supported_durations".
    reference_supported_durations: tuple[int, ...] | None

    async def create_video_job(self, request: VideoGenerationRequest) -> str: ...

    async def get_job_status(self, job_id: str) -> VideoJobStatus: ...

    async def download_result(self, job_id: str) -> bytes: ...


def snap_duration(value: int, allowed: tuple[int, ...] | None) -> int:
    """Nearest supported clip length, preferring the longer one on a tie."""
    if not allowed:
        return value
    return min(allowed, key=lambda option: (abs(option - value), -option))
