from typing import Protocol

from pydantic import BaseModel


class LLMProvider(Protocol):
    async def generate_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        *,
        model: str | None = None,
    ) -> BaseModel: ...
