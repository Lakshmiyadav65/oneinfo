from typing import Protocol


class StorageProvider(Protocol):
    def save(self, key: str, content: bytes) -> str:
        """Persists content under key, returns the storage key to record."""
        ...

    def read(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...

    def get_url(self, key: str) -> str | None:
        """
        A directly-fetchable URL for this key (e.g. a signed cloud URL), or
        None if the provider can't produce one — local dev storage always
        returns None, and callers fall back to proxying the file through
        the API's own authenticated download route.
        """
        ...
