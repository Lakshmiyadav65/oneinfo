from app.core.config import Settings
from app.providers.storage.base import StorageProvider
from app.providers.storage.local_provider import LocalStorageProvider


def get_storage_provider(settings: Settings) -> StorageProvider:
    if settings.storage_backend == "s3":
        raise RuntimeError("STORAGE_BACKEND=s3 is not configured yet (Phase 05).")
    return LocalStorageProvider(settings.storage_local_path)
