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
        )
    return DevVideoProvider(settings)
