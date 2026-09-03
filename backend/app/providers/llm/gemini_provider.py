import json
from typing import Any

import httpx
from pydantic import BaseModel

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def _resolve_refs(node: Any, defs: dict[str, Any]) -> Any:
    """Gemini's responseSchema doesn't support $ref/$defs, so inline them."""
    if isinstance(node, dict):
        if "$ref" in node:
            ref_name = node["$ref"].removeprefix("#/$defs/")
            return _resolve_refs(defs[ref_name], defs)
        return {k: _resolve_refs(v, defs) for k, v in node.items() if k not in {"title", "default"}}
    if isinstance(node, list):
        return [_resolve_refs(item, defs) for item in node]
    return node


def _to_gemini_schema(model: type[BaseModel]) -> dict[str, Any]:
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})
    return _resolve_refs(raw, defs)


class GeminiLLMProviderError(RuntimeError):
    pass


class GeminiLLMProvider:
    def __init__(self, api_key: str, default_model: str):
        self._api_key = api_key
        self._default_model = default_model

    async def generate_structured(
        self, prompt: str, schema: type[BaseModel], *, model: str | None = None
    ) -> BaseModel:
        url = f"{_BASE_URL}/{model or self._default_model}:generateContent"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": _to_gemini_schema(schema),
            },
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, params={"key": self._api_key}, json=body)
        response.raise_for_status()
        data = response.json()

        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise GeminiLLMProviderError("Gemini returned an unexpected response shape.") from exc

        return schema.model_validate(json.loads(text))
