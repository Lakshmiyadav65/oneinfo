from datetime import timedelta

from google.cloud import storage as gcs_sdk


class GCSStorageProvider:
    """
    Real cloud storage via Google Cloud Storage — the master spec's
    preferred backend, matching the team's existing Google Cloud startup
    credits. Requires GOOGLE_APPLICATION_CREDENTIALS (a service account
    JSON with Storage Object Admin on the bucket) and STORAGE_BUCKET.

    Untested against a live bucket pending real credentials, same caveat
    as the Gemini/Veo providers.
    """

    def __init__(self, bucket_name: str, credentials_path: str):
        client = gcs_sdk.Client.from_service_account_json(credentials_path)
        self._bucket = client.bucket(bucket_name)

    def save(self, key: str, content: bytes) -> str:
        blob = self._bucket.blob(key)
        blob.upload_from_string(content)
        return key

    def read(self, key: str) -> bytes:
        return self._bucket.blob(key).download_as_bytes()

    def delete(self, key: str) -> None:
        self._bucket.blob(key).delete()

    def get_url(self, key: str) -> str | None:
        return self._bucket.blob(key).generate_signed_url(expiration=timedelta(hours=1))
