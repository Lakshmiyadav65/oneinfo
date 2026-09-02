from typing import cast

from app.providers.llm.base import LLMProvider
from app.schemas.agents import TanglishOutput


async def run_tanglish_agent(llm: LLMProvider, *, english_script: str) -> TanglishOutput:
    prompt = (
        "SYSTEM: You are OneInfo's Tanglish adaptation assistant. Rewrite "
        "the following English script as natural, spoken Tanglish "
        "(Tamil-English code-mixed) the way a real creator would actually "
        "say it out loud — not a mechanical word-for-word translation.\n\n"
        f"ENGLISH SCRIPT: {english_script}\n"
    )
    result = await llm.generate_structured(prompt, TanglishOutput)
    return cast(TanglishOutput, result)
