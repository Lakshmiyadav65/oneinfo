from app.core.config import Settings
from app.providers.storage.base import StorageProvider
from app.providers.storage.gcs_provider import GCSStorageProvider
from app.providers.storage.local_provider import LocalStorageProvider


def get_storage_provider(settings: Settings) -> StorageProvider:
    if settings.storage_backend == "gcs":
        if not (settings.storage_bucket and settings.google_application_credentials):
            raise RuntimeError(
                "STORAGE_BACKEND=gcs requires STORAGE_BUCKET and GOOGLE_APPLICATION_CREDENTIALS."
            )
        return GCSStorageProvider(settings.storage_bucket, settings.google_application_credentials)
    return LocalStorageProvider(settings.storage_local_path)
