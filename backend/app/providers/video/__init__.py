from app.core.config import Settings
from app.providers.video.base import VideoProvider
from app.providers.video.dev_provider import DevVideoProvider
from app.providers.video.veo_provider import VeoVideoProvider


def get_video_provider(settings: Settings) -> VideoProvider:
    if settings.video_provider == "veo":
        if not (settings.google_cloud_project and settings.google_application_credentials):
            raise RuntimeError(
                "VIDEO_PROVIDER=veo requires GOOGLE_CLOUD_PROJECT and "
                "GOOGLE_APPLICATION_CREDENTIALS."
            )
        return VeoVideoProvider(
            settings.google_cloud_project,
            settings.google_cloud_location,
            settings.google_application_credentials,
            settings.veo_model,
            settings.veo_reference_model,
        )
    return DevVideoProvider(settings)


def get_supported_durations(settings: Settings) -> tuple[int, ...] | None:
    """
    The active provider's clip-length constraint, without building the
    provider itself — storyboard generation needs to know this and has no
    reason to load service account credentials to ask.
    """
    if settings.video_provider == "veo":
        return VeoVideoProvider.supported_durations
    return DevVideoProvider.supported_durations
