import httpx


class OpenAIEmbeddingProvider:
    def __init__(self, api_key: str, dimensions: int, model: str):
        self._api_key = api_key
        self._dimensions = dimensions
        self._model = model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        response = httpx.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={"model": self._model, "input": texts, "dimensions": self._dimensions},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in data["data"]]
