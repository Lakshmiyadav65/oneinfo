import base64

import httpx
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account

from app.core.errors import AppError
from app.providers.video.base import VideoGenerationRequest, VideoJobStatus

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


class VeoProviderError(AppError):
    code = "PROVIDER_TIMEOUT"
    status_code = 502


class VeoVideoProvider:
    """
    Real Veo integration via Vertex AI's long-running prediction API.
    Requires GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, and a service
    account key at GOOGLE_APPLICATION_CREDENTIALS with Vertex AI access.

    Untested against the live API pending real credentials — verify exact
    request/response field names against current Vertex AI Veo docs before
    first real use.
    """

    def __init__(self, project: str, location: str, credentials_path: str, model: str):
        self._project = project
        self._location = location
        self._model = model
        self._credentials = service_account.Credentials.from_service_account_file(
            credentials_path, scopes=_SCOPES
        )
        # job_id -> operation name, since Vertex AI operations are
        # addressed by name, not a short id.
        self._operations: dict[str, str] = {}

    def _access_token(self) -> str:
        if not self._credentials.valid:
            self._credentials.refresh(GoogleAuthRequest())
        return self._credentials.token

    def _base_url(self) -> str:
        return (
            f"https://{self._location}-aiplatform.googleapis.com/v1/projects/"
            f"{self._project}/locations/{self._location}/publishers/google/models/{self._model}"
        )

    async def create_video_job(self, request: VideoGenerationRequest) -> str:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self._base_url()}:predictLongRunning",
                headers={"Authorization": f"Bearer {self._access_token()}"},
                json={
                    "instances": [{"prompt": request.visual_prompt}],
                    "parameters": {"durationSeconds": request.duration_seconds},
                },
            )
        response.raise_for_status()
        operation_name = response.json()["name"]
        job_id = operation_name.rsplit("/", 1)[-1]
        self._operations[job_id] = operation_name
        return job_id

    async def get_job_status(self, job_id: str) -> VideoJobStatus:
        operation_name = self._operations.get(job_id)
        if operation_name is None:
            return VideoJobStatus(status="failed", error_message="Unknown job id.")

        data = await self._fetch_operation(operation_name)
        if not data.get("done"):
            return VideoJobStatus(status="processing")
        if "error" in data:
            return VideoJobStatus(status="failed", error_message=str(data["error"])[:500])
        return VideoJobStatus(status="completed")

    async def download_result(self, job_id: str) -> bytes:
        operation_name = self._operations.get(job_id)
        if operation_name is None:
            raise VeoProviderError("Unknown video job id.")

        data = await self._fetch_operation(operation_name)
        try:
            b64_video = data["response"]["predictions"][0]["bytesBase64Encoded"]
        except (KeyError, IndexError) as exc:
            raise VeoProviderError("Veo returned an unexpected response shape.") from exc
        return base64.b64decode(b64_video)

    async def _fetch_operation(self, operation_name: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self._base_url()}:fetchPredictOperation",
                headers={"Authorization": f"Bearer {self._access_token()}"},
                json={"operationName": operation_name},
            )
        response.raise_for_status()
        return response.json()
