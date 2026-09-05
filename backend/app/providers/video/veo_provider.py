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

    Verified against the live API with veo-3.1-lite-generate-001: the
    request shape below is correct, and generated clips come back as H.264
    720p with an AAC audio track (unlike the silent dev-provider clips).
    """

    # Veo generates fixed-length clips only. Anything else fails the request
    # with "Unsupported output video duration N seconds, supported durations
    # are [8,4,6] for feature text_to_video" — and any scenes already
    # generated before that point have still been billed.
    supported_durations: tuple[int, ...] | None = (4, 6, 8)
    # Reference-to-video is stricter still: "Unsupported output video duration
    # 6 seconds, supported durations are [8] for feature reference_to_video".
    # A scene featuring the creator therefore has to be exactly 8 seconds.
    reference_supported_durations: tuple[int, ...] | None = (8,)

    # Veo caps subject references at three images.
    MAX_REFERENCE_IMAGES = 3

    def __init__(
        self,
        project: str,
        location: str,
        credentials_path: str,
        model: str,
        reference_model: str | None = None,
    ):
        self._project = project
        self._location = location
        self._model = model
        self._reference_model = reference_model or model
        self._credentials = service_account.Credentials.from_service_account_file(
            credentials_path, scopes=_SCOPES
        )
        # job_id -> (operation name, model), since Vertex AI operations are
        # addressed by name, not a short id, AND the polling endpoint is
        # per-model: an operation created on the reference model has to be
        # polled and downloaded on that same model, not the default one.
        self._operations: dict[str, tuple[str, str]] = {}

    def _access_token(self) -> str:
        if not self._credentials.valid:
            self._credentials.refresh(GoogleAuthRequest())
        return self._credentials.token

    def _base_url(self, model: str | None = None) -> str:
        return (
            f"https://{self._location}-aiplatform.googleapis.com/v1/projects/"
            f"{self._project}/locations/{self._location}/publishers/google/models/"
            f"{model or self._model}"
        )

    async def create_video_job(self, request: VideoGenerationRequest) -> str:
        instance: dict = {"prompt": request.visual_prompt}
        parameters: dict = {"durationSeconds": request.duration_seconds}

        # Only a request that actually carries a face goes to the reference
        # model: it costs three times the Lite tier per second, and Lite
        # rejects reference images outright rather than ignoring them.
        model = self._model
        if request.reference_images:
            model = self._reference_model
            instance["referenceImages"] = [
                {
                    "image": {
                        "bytesBase64Encoded": base64.b64encode(image).decode(),
                        "mimeType": "image/jpeg",
                    },
                    "referenceType": "asset",
                }
                for image in request.reference_images[: self.MAX_REFERENCE_IMAGES]
            ]
            # Generating a real, identifiable person is gated behind this.
            parameters["personGeneration"] = "allow_adult"

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self._base_url(model)}:predictLongRunning",
                headers={"Authorization": f"Bearer {self._access_token()}"},
                json={"instances": [instance], "parameters": parameters},
            )
        response.raise_for_status()
        operation_name = response.json()["name"]
        job_id = operation_name.rsplit("/", 1)[-1]
        # Store the model too: polling and download are per-model endpoints,
        # and a job created on the reference tier must be followed there.
        self._operations[job_id] = (operation_name, model)
        return job_id

    async def get_job_status(self, job_id: str) -> VideoJobStatus:
        tracked = self._operations.get(job_id)
        if tracked is None:
            return VideoJobStatus(status="failed", error_message="Unknown job id.")

        data = await self._fetch_operation(*tracked)
        if not data.get("done"):
            return VideoJobStatus(status="processing")
        if "error" in data:
            return VideoJobStatus(status="failed", error_message=str(data["error"])[:500])

        # A safety-filtered generation still finishes "successfully": the
        # operation is done, carries no error, and simply has no videos in it.
        # Reported here rather than letting download_result fail later with a
        # response-shape error that points at the wrong culprit.
        response = data.get("response", {})
        if not response.get("videos"):
            filtered = response.get("raiMediaFilteredCount", 0)
            reasons = response.get("raiMediaFilteredReasons") or []
            if filtered:
                detail = f" ({'; '.join(str(r) for r in reasons)})" if reasons else ""
                return VideoJobStatus(
                    status="failed",
                    error_message=(
                        f"Veo's safety filter blocked this scene{detail}. Rewrite the "
                        "scene's visual prompt and try again."
                    )[:500],
                )
            return VideoJobStatus(
                status="failed", error_message="Veo returned no video for this scene."
            )
        return VideoJobStatus(status="completed")

    async def download_result(self, job_id: str) -> bytes:
        tracked = self._operations.get(job_id)
        if tracked is None:
            raise VeoProviderError("Unknown video job id.")

        data = await self._fetch_operation(*tracked)
        # Verified against the live API: the finished operation returns
        # response.videos[], each with bytesBase64Encoded + mimeType. (It is
        # not response.predictions[] â€” that was the assumed shape before this
        # was ever run for real.)
        try:
            b64_video = data["response"]["videos"][0]["bytesBase64Encoded"]
        except (KeyError, IndexError) as exc:
            raise VeoProviderError("Veo returned an unexpected response shape.") from exc
        return base64.b64decode(b64_video)

    async def _fetch_operation(self, operation_name: str, model: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self._base_url(model)}:fetchPredictOperation",
                headers={"Authorization": f"Bearer {self._access_token()}"},
                json={"operationName": operation_name},
            )
        response.raise_for_status()
        return response.json()
