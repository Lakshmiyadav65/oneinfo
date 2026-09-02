from typing import Literal, Protocol

from pydantic import BaseModel


class VideoGenerationRequest(BaseModel):
    visual_prompt: str
    duration_seconds: int


class VideoJobStatus(BaseModel):
    status: Literal["processing", "completed", "failed"]
    error_message: str | None = None


class VideoProvider(Protocol):
    async def create_video_job(self, request: VideoGenerationRequest) -> str: ...

    async def get_job_status(self, job_id: str) -> VideoJobStatus: ...

    async def download_result(self, job_id: str) -> bytes: ...
