from pathlib import Path


class LocalStorageProvider:
    """
    Filesystem-backed storage for local development. Swap for an S3/GCS/R2
    provider satisfying the same interface once real cloud credentials are
    configured (Phase 05) — nothing above this layer needs to change.
    """

    def __init__(self, base_path: str):
        self._base_path = Path(base_path)
        self._base_path.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        path = (self._base_path / key).resolve()
        if not str(path).startswith(str(self._base_path.resolve())):
            raise ValueError("Invalid storage key.")
        return path

    def save(self, key: str, content: bytes) -> str:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return key

    def read(self, key: str) -> bytes:
        return self._resolve(key).read_bytes()

    def delete(self, key: str) -> None:
        path = self._resolve(key)
        if path.exists():
            path.unlink()

    def get_url(self, key: str) -> str | None:
        return None
