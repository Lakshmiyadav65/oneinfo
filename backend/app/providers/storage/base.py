from typing import Protocol


class StorageProvider(Protocol):
    def save(self, key: str, content: bytes) -> str:
        """Persists content under key, returns the storage key to record."""
        ...

    def read(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...
