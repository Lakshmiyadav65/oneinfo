import asyncio
import json
from typing import Any

import httpx
from pydantic import BaseModel

from app.core.errors import AppError

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# Gemini's free tier returns 503 ("high demand") and 429 in bursts — often
# fine seconds later — so a couple of quick retries is the difference
# between a working feature and a broken one.
_RETRY_STATUSES = {429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 4


def _resolve_refs(node: Any, defs: dict[str, Any]) -> Any:
    """Gemini's responseSchema doesn't support $ref/$defs, so inline them."""
    if isinstance(node, dict):
        if "$ref" in node:
            ref_name = node["$ref"].removeprefix("#/$defs/")
            return _resolve_refs(defs[ref_name], defs)
        resolved: dict[str, Any] = {}
        for key, value in node.items():
            # "title"/"default" are JSON Schema metadata Gemini rejects — but
            # inside "properties" these are field *names*, not keywords, so
            # stripping them there drops real fields (a model with a `title`
            # field lost it while staying in "required", which Gemini 400s on).
            if key in {"title", "default"}:
                continue
            if key == "properties" and isinstance(value, dict):
                resolved[key] = {
                    name: _resolve_refs(subschema, defs) for name, subschema in value.items()
                }
            else:
                resolved[key] = _resolve_refs(value, defs)
        return resolved
    if isinstance(node, list):
        return [_resolve_refs(item, defs) for item in node]
    return node


def _to_gemini_schema(model: type[BaseModel]) -> dict[str, Any]:
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})
    return _resolve_refs(raw, defs)


class GeminiLLMProviderError(RuntimeError):
    pass


class ProviderQuotaError(AppError):
    """Surfaces provider quota/overload as an actionable message, not a 500."""

    code = "PROVIDER_UNAVAILABLE"
    status_code = 503


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
            for attempt in range(_MAX_ATTEMPTS):
                try:
                    response = await client.post(url, params={"key": self._api_key}, json=body)
                except httpx.TimeoutException:
                    if attempt == _MAX_ATTEMPTS - 1:
                        raise
                    await asyncio.sleep(2**attempt)
                    continue
                if response.status_code in _RETRY_STATUSES and attempt < _MAX_ATTEMPTS - 1:
                    await asyncio.sleep(2**attempt)
                    continue
                break

        # Quota/overload deserve a message the creator can act on — otherwise
        # they surface as a bare 500 ("Something went wrong") and look like a
        # bug in the app rather than a limit on the key.
        if response.status_code == 429:
            raise ProviderQuotaError(
                "The AI provider's quota for this key is exhausted. Free-tier "
                "Gemini keys allow only a small number of requests per day — "
                "wait for the quota to reset, switch GEMINI_MODEL to a model "
                "with a higher free limit, or enable billing on the key."
            )
        if response.status_code in _RETRY_STATUSES:
            raise ProviderQuotaError(
                "The AI provider is busy right now and didn't recover after "
                "several retries. Please try again in a moment."
            )

        response.raise_for_status()
        data = response.json()

        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise GeminiLLMProviderError("Gemini returned an unexpected response shape.") from exc

        return schema.model_validate(json.loads(text))
