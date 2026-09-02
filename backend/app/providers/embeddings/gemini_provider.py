import httpx

_MODEL = "models/text-embedding-004"
_URL = f"https://generativelanguage.googleapis.com/v1beta/{_MODEL}:batchEmbedContents"


class GeminiEmbeddingProvider:
    def __init__(self, api_key: str, dimensions: int):
        self._api_key = api_key
        self._dimensions = dimensions

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        requests = [
            {
                "model": _MODEL,
                "content": {"parts": [{"text": text}]},
                "outputDimensionality": self._dimensions,
            }
            for text in texts
        ]
        response = httpx.post(
            _URL,
            params={"key": self._api_key},
            json={"requests": requests},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        return [item["values"] for item in data["embeddings"]]
