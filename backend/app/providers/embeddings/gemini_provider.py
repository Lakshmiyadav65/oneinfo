import httpx

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiEmbeddingProvider:
    def __init__(self, api_key: str, dimensions: int, model: str):
        self._api_key = api_key
        self._dimensions = dimensions
        self._model = model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        requests = [
            {
                "model": self._model,
                "content": {"parts": [{"text": text}]},
                "outputDimensionality": self._dimensions,
            }
            for text in texts
        ]
        response = httpx.post(
            f"{_BASE_URL}/{self._model}:batchEmbedContents",
            params={"key": self._api_key},
            json={"requests": requests},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        return [item["values"] for item in data["embeddings"]]
