import json

import httpx
from pydantic import BaseModel


class OpenAICompatibleError(RuntimeError):
    pass


class OpenAICompatibleLLMProvider:
    """
    Shared implementation for OpenAI-compatible chat-completions APIs
    (OpenAI itself, Groq). Uses JSON-mode plus a schema description in the
    prompt rather than a provider-specific strict-schema feature, since
    that's the subset both providers reliably support — unlike Gemini,
    which gets a dedicated responseSchema integration instead.
    """

    def __init__(self, base_url: str, api_key: str, default_model: str):
        self._base_url = base_url
        self._api_key = api_key
        self._default_model = default_model

    async def generate_structured(
        self, prompt: str, schema: type[BaseModel], *, model: str | None = None
    ) -> BaseModel:
        schema_json = json.dumps(schema.model_json_schema())
        system_message = (
            "Respond with ONLY a single JSON object matching this JSON Schema, "
            f"no prose, no markdown fences: {schema_json}"
        )

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self._base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": model or self._default_model,
                    "messages": [
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                },
            )
        response.raise_for_status()
        data = response.json()

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise OpenAICompatibleError("Provider returned an unexpected response shape.") from exc

        return schema.model_validate(json.loads(content))
