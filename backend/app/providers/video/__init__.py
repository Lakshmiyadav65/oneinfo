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


def get_supported_durations(
    settings: Settings, *, with_reference: bool = False
) -> tuple[int, ...] | None:
    """
    The active provider's clip-length constraint, without building the
    provider itself — storyboard generation needs to know this and has no
    reason to load service account credentials to ask.

    `with_reference` asks for the constraint that applies when the creator is
    on camera, which Veo restricts much harder than plain text-to-video.
    """
    provider = VeoVideoProvider if settings.video_provider == "veo" else DevVideoProvider
    if with_reference:
        return provider.reference_supported_durations or provider.supported_durations
    return provider.supported_durations
